// HeyGen v3 API 클라이언트 — 의존성 없음 (Node 18+ 내장 fetch 사용)
//
// 스키마 출처: heygen-com/heygen-cli 의 gen/*.go (Apache-2.0, OpenAPI 기계 생성).
// v1/v2 는 2026-10-31 지원 종료이므로 v3 만 사용한다.

import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const DEFAULT_BASE = 'https://api.heygen.com';

/** 종료 상태. 그 외(waiting/pending/processing 등)는 전부 진행 중으로 취급한다. */
const TERMINAL = new Set(['completed', 'failed']);

export class HeyGenError extends Error {
  constructor(status, payload) {
    const e = payload?.error ?? {};
    super(e.message || `HeyGen API ${status}`);
    this.name = 'HeyGenError';
    this.status = status;
    this.code = e.code ?? null;
    this.param = e.param ?? null;
    this.docUrl = e.doc_url ?? null;
    this.payload = payload;
  }
}

/** 생성은 성공했지만 렌더가 실패한 경우 — video_id 를 보존해 재조회할 수 있게 한다. */
export class VideoFailedError extends Error {
  constructor(video) {
    super(video.failure_message || `영상 생성 실패 (${video.failure_code ?? '사유 미상'})`);
    this.name = 'VideoFailedError';
    this.videoId = video.id;
    this.failureCode = video.failure_code ?? null;
    this.video = video;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class HeyGen {
  constructor({ apiKey = process.env.HEYGEN_API_KEY, baseUrl, maxRetries = 4 } = {}) {
    if (!apiKey) {
      throw new Error(
        'HEYGEN_API_KEY 가 없습니다. app.heygen.com/settings/api 에서 발급한 뒤\n' +
        '  export HEYGEN_API_KEY=... 로 설정하세요 (키는 발급 시 한 번만 보입니다).'
      );
    }
    this.apiKey = apiKey;
    this.baseUrl = baseUrl || process.env.HEYGEN_API_BASE || DEFAULT_BASE;
    this.maxRetries = maxRetries;
  }

  async request(method, path, { query, body } = {}) {
    const url = new URL(path, this.baseUrl);
    for (const [k, v] of Object.entries(query ?? {})) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    }

    const headers = { 'x-api-key': this.apiKey, accept: 'application/json' };
    if (body !== undefined) headers['content-type'] = 'application/json';

    let lastErr;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      let res;
      try {
        res = await fetch(url, {
          method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
        });
      } catch (err) {
        // 네트워크 오류 — 재시도 가치가 있다
        lastErr = err;
        if (attempt === this.maxRetries) throw err;
        await sleep(backoffMs(attempt));
        continue;
      }

      if (res.ok) return res.status === 204 ? null : await res.json();

      const payload = await safeJson(res);

      // 429: Retry-After 를 존중한다. 5xx: 지수 백오프.
      if ((res.status === 429 || res.status >= 500) && attempt < this.maxRetries) {
        const retryAfter = Number(res.headers.get('retry-after'));
        await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : backoffMs(attempt));
        lastErr = new HeyGenError(res.status, payload);
        continue;
      }
      throw new HeyGenError(res.status, payload);
    }
    throw lastErr;
  }

  /** 계정·지갑 잔액. billing_type 에 따라 wallet 또는 subscription 이 채워진다. */
  me() {
    return this.request('GET', '/v3/users/me').then((r) => r.data ?? r);
  }

  /** 아바타 look 목록. look 의 id 가 곧 영상 생성에 넣는 avatar_id 다. */
  listLooks(opts = {}) {
    return this.#paginate('/v3/avatars/looks', { group_id: opts.groupId, limit: opts.limit ?? 100 });
  }

  listVoices(opts = {}) {
    return this.#paginate('/v3/voices', {
      language: opts.language,
      gender: opts.gender,
      engine: opts.engine,
      limit: opts.limit ?? 100,
    });
  }

  async #paginate(path, query) {
    const out = [];
    let token;
    do {
      const r = await this.request('GET', path, { query: { ...query, token } });
      out.push(...(r.data ?? []));
      token = r.has_more ? r.next_token : undefined;
    } while (token);
    return out;
  }

  /** POST /v3/videos → { video_id, status } */
  createVideo(payload) {
    return this.request('POST', '/v3/videos', { body: payload }).then((r) => r.data ?? r);
  }

  /** GET /v3/videos/{id} → { id, status, video_url, subtitle_url, ... } */
  getVideo(videoId) {
    return this.request('GET', `/v3/videos/${encodeURIComponent(videoId)}`).then((r) => r.data ?? r);
  }

  /**
   * completed 가 될 때까지 폴링한다. 웹훅 없이도 충분하다.
   * status 는 waiting/pending/processing 중 무엇이든 진행 중으로 본다.
   */
  async waitForVideo(videoId, { pollMs = 10_000, timeoutMs = 20 * 60_000, onTick } = {}) {
    const startedAt = Date.now();
    for (;;) {
      const video = await this.getVideo(videoId);
      if (video.status === 'completed') return video;
      if (video.status === 'failed') throw new VideoFailedError(video);

      const elapsed = Date.now() - startedAt;
      if (elapsed > timeoutMs) {
        const e = new Error(
          `${Math.round(timeoutMs / 60000)}분 안에 완료되지 않았습니다. ` +
          `생성은 계속 진행 중일 수 있습니다 — video_id: ${videoId}`
        );
        e.videoId = videoId;
        throw e;
      }
      onTick?.({ status: video.status, elapsedMs: elapsed });
      await sleep(pollMs);
    }
  }

  /** presigned URL 이므로 인증 헤더 없이 그대로 받는다. */
  async download(url, destPath) {
    await mkdir(dirname(destPath), { recursive: true });
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(
        `다운로드 실패 ${res.status} — presigned URL 은 만료됩니다. ` +
        `GET /v3/videos/{id} 로 새 URL 을 받으세요.`
      );
    }
    await pipeline(Readable.fromWeb(res.body), createWriteStream(destPath));
    return destPath;
  }
}

function backoffMs(attempt) {
  const base = 1000 * 2 ** attempt;          // 1s, 2s, 4s, 8s
  return base + Math.floor(Math.random() * 400); // 지터
}

async function safeJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export { TERMINAL };
