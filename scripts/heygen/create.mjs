#!/usr/bin/env node
// 대본을 넣으면 MP4 가 나온다.
//
//   node scripts/heygen/create.mjs --file 대본.txt
//   node scripts/heygen/create.mjs --script "안녕하세요, 오너스코리아입니다."
//   cat 대본.txt | node scripts/heygen/create.mjs
//   node scripts/heygen/create.mjs --file 씬구성.json        (다중 씬)
//
// 옵션
//   --out <경로>        저장 위치 (기본 out/<날짜>-<video_id>.mp4)
//   --engine <이름>     avatar_iii(기본) | avatar_iv | avatar_v
//   --resolution <값>   720p | 1080p | 4k
//   --aspect <비율>     16:9 | 9:16 | 4:5 | 5:4 | 1:1 | auto
//   --title <제목>      HeyGen 앱에 표시될 제목
//   --burn-caption      자막을 영상에 구워서 추가로 받는다 (SRT 는 항상 받음)
//   --no-subtitle       SRT 내려받지 않음
//   --dry-run           요청 본문만 출력하고 크레딧을 쓰지 않는다
//   --timeout <분>      완료 대기 한도 (기본 20)

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { HeyGen, HeyGenError, VideoFailedError } from './heygen.mjs';
import { buildAvatarVideo, buildStudioVideo, estimateCost, parseInput, ENGINES } from './payload.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const value = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d;
};

main().catch((err) => {
  if (err instanceof HeyGenError) {
    console.error(`\n✗ HeyGen 오류 ${err.status}${err.code ? ` (${err.code})` : ''}: ${err.message}`);
    if (err.param) console.error(`  문제 필드: ${err.param}`);
    if (err.status === 401) console.error('  → HEYGEN_API_KEY 를 확인하세요.');
    if (err.status === 402) console.error('  → 지갑 잔액이 부족합니다. app.heygen.com/billing 에서 충전하세요.');
    if (err.docUrl) console.error(`  문서: ${err.docUrl}`);
  } else if (err instanceof VideoFailedError) {
    console.error(`\n✗ 렌더 실패: ${err.message}`);
    console.error(`  video_id=${err.videoId}  failure_code=${err.failureCode ?? '-'}`);
  } else {
    console.error(`\n✗ ${err?.message ?? err}`);
  }
  process.exit(1);
});

async function main() {
  const engine = value('engine');
  if (engine && !ENGINES.includes(engine)) {
    throw new Error(`--engine 은 ${ENGINES.join(' | ')} 중 하나여야 합니다.`);
  }

  const config = await loadConfig();
  const raw = await readScript();
  if (!raw.trim()) throw new Error('대본이 비어 있습니다.');

  const opts = {
    engine,
    resolution: value('resolution'),
    aspect: value('aspect'),
    title: value('title'),
    burnCaption: flag('burn-caption'),
  };

  const input = parseInput(raw);
  const body =
    input.mode === 'studio'
      ? buildStudioVideo({ config, scenes: input.scenes, opts })
      : buildAvatarVideo({ config, script: input.script, opts });

  const usedEngine = opts.engine ?? config.engine ?? 'avatar_iii';
  console.log(
    `\n아바타: ${config.avatar_name ?? config.avatar_id}` +
    `   엔진: ${usedEngine}   해상도: ${body.resolution}   비율: ${body.aspect_ratio}`
  );
  console.log(
    input.mode === 'studio'
      ? `다중 씬 ${body.scenes.length}개`
      : `단일 대본 ${input.script.length}자`
  );

  if (flag('dry-run')) {
    console.log('\n--dry-run: 요청 본문만 출력합니다 (크레딧 소모 없음).\n');
    console.log(JSON.stringify(body, null, 2));
    return;
  }

  const hg = new HeyGen();
  const created = await hg.createVideo(body);
  console.log(`\n생성 요청됨 — video_id=${created.video_id} (status=${created.status})`);

  const timeoutMin = Number(value('timeout', '20'));
  const startedAt = Date.now();
  let lastStatus = '';
  const video = await hg.waitForVideo(created.video_id, {
    timeoutMs: timeoutMin * 60_000,
    onTick: ({ status, elapsedMs }) => {
      if (status !== lastStatus) {
        lastStatus = status;
        console.log(`  ${status}… (${Math.round(elapsedMs / 1000)}초)`);
      }
    },
  });

  const elapsed = Math.round((Date.now() - startedAt) / 1000);
  console.log(`\n완료 — 길이 ${video.duration}초, 렌더 ${elapsed}초 소요`);

  // ── 저장 ──
  const stamp = new Date().toISOString().slice(0, 10);
  const outPath = value('out') || join(process.cwd(), 'out', `${stamp}-${video.id}.mp4`);
  await hg.download(video.video_url, outPath);
  console.log(`영상  → ${outPath}`);

  if (!flag('no-subtitle') && video.subtitle_url) {
    const srt = outPath.replace(new RegExp(`${escapeRe(extname(outPath))}$`), '') + '.srt';
    await hg.download(video.subtitle_url, srt);
    console.log(`자막  → ${srt}   (ffmpeg 로 원하는 스타일로 구울 수 있습니다)`);
  }
  if (opts.burnCaption && video.captioned_video_url) {
    const burned = outPath.replace(new RegExp(`${escapeRe(extname(outPath))}$`), '') + '.captioned.mp4';
    await hg.download(video.captioned_video_url, burned);
    console.log(`자막본 → ${burned}`);
  }

  const cost = estimateCost({ engine: usedEngine, avatarType: config.avatar_type, durationSec: video.duration });
  if (cost) {
    console.log(`\n예상 비용 약 $${cost.usd.toFixed(3)} ($${cost.rate}/초 × ${video.duration}초)`);
    console.log('  요금표는 변경될 수 있습니다. 실제 청구는 지갑 잔액 변화로 확인하세요.');
  }
  if (video.video_page_url) console.log(`HeyGen 앱: ${video.video_page_url}`);
}

async function loadConfig() {
  const path = value('config', join(HERE, 'config.json'));
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') {
      throw new Error(`설정 파일이 없습니다: ${path}\n  먼저 실행하세요: node scripts/heygen/setup.mjs`);
    }
    throw e;
  }
}

async function readScript() {
  const file = value('file');
  if (file) return readFile(file, 'utf8');
  const inline = value('script');
  if (inline) return inline;
  if (process.stdin.isTTY) {
    throw new Error('대본이 없습니다. --file <경로> 또는 --script "<내용>" 을 쓰거나 표준입력으로 넘기세요.');
  }
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8');
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
