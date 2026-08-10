/**
 * BizInfo(정부지원사업) 프록시 — Vercel 서버리스 함수
 * API 키를 브라우저에 노출하지 않기 위한 서버 프록시.
 * Vercel CDN 캐시(s-maxage=1h + stale-while-revalidate=24h)로
 * BizInfo 장애 시에도 마지막 성공 응답을 계속 서빙한다.
 *
 * 필요 환경변수: BIZINFO_API_KEY  (Vercel 프로젝트 Settings → Environment Variables)
 */
const BIZINFO_URL = 'https://www.bizinfo.go.kr/uss/rss/bizinfoApi.do';
const TIMEOUT_MS = 25000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 매칭 이메일 구독: 함수 한도(12) 때문에 이 프록시에 병합. (POST 구독 / ?sub 조회 / ?unsub 해지 / ?action=daily 다이제스트)
const { initSubscribers, createSubscriber, getSubscriberByToken, listActiveSubscribers, updateSubscriberSeen, deactivateSubscriber } = require('../lib/db');
const { matchProgram, extractEndDate, isActiveProgram } = require('../lib/match-server');
const crypto = require('crypto');

// 다이제스트용: BizInfo 전 공고를 JSON 배열로 가져온다(프록시와 별개 경로)
async function fetchProgramsJson() {
  const apiKey = process.env.BIZINFO_API_KEY;
  if (!apiKey) throw new Error('BIZINFO_API_KEY 미설정');
  const params = new URLSearchParams({ crtfcKey: apiKey, dataType: 'json', pageUnit: '2000', pageIndex: '1' });
  const r = await fetch(`${BIZINFO_URL}?${params}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  const text = await r.text();
  if (text.trimStart().startsWith('<')) throw new Error('BizInfo HTML 응답');
  const data = JSON.parse(text);
  return Array.isArray(data.jsonArray) ? data.jsonArray : [];
}

module.exports = async (req, res) => {
  const q = req.query || {};

  // ── 구독 신청(POST {email, sector, sub, region, needs}) → 매일 매칭 이메일용 저장 ──
  if (req.method === 'POST') {
    try {
      const b = req.body || {};
      const email = String(b.email || '').trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: '이메일 형식이 올바르지 않습니다' });
      const needs = Array.isArray(b.needs) ? b.needs.slice(0, 20).map(String) : [];
      const token = crypto.randomBytes(9).toString('base64url');
      await initSubscribers();
      await createSubscriber({ email, token,
        company: String(b.company || '').trim().slice(0, 80) || null,
        sector: String(b.sector || '').slice(0, 60) || null,
        sub: String(b.sub || '').slice(0, 60) || null,
        region: String(b.region || '').slice(0, 20) || null,
        needs });
      return res.status(200).json({ ok: true, token, url: `https://ownerskr.com/programs?sub=${token}` });
    } catch (e) { return res.status(500).json({ error: String((e && e.message) || e) }); }
  }

  // ── 구독자 조건 조회(?sub=token): 업체별 URL에서 조건 자동 세팅 ──
  if (q.sub) {
    try {
      const s = await getSubscriberByToken(String(q.sub));
      if (!s) return res.status(404).json({ error: '구독 정보를 찾을 수 없습니다' });
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ ok: true, sector: s.sector, sub: s.sub, region: s.region, needs: s.needs || [] });
    } catch (e) { return res.status(500).json({ error: String((e && e.message) || e) }); }
  }

  // ── 구독 해지(?unsub=token) ──
  if (q.unsub) {
    try { await deactivateSubscriber(String(q.unsub)); } catch (_) {}
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send('<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif;padding:48px;text-align:center;color:#222">매칭 이메일 구독이 해지되었습니다.<br>필요하시면 언제든 다시 신청하실 수 있어요.</body>');
  }

  // ── 매일 다이제스트(?action=daily&secret=INIT_SECRET): 앱스스크립트가 호출 ──
  //     각 구독자별로 오늘 기준 활성 매칭을 구하고, 이전에 보낸 것 제외한 '새 매칭'만 payload로 반환.
  if (q.action === 'daily') {
    if (String(q.secret || '') !== process.env.INIT_SECRET) return res.status(403).json({ error: 'forbidden' });
    try {
      await initSubscribers();
      const [subs, programs] = await Promise.all([listActiveSubscribers(), fetchProgramsJson()]);
      const today = new Date().toISOString().slice(0, 10);
      const active = programs.filter((p) => isActiveProgram(p, today));
      const out = [];
      for (const s of subs) {
        const profile = { region: s.region, needs: s.needs || [] };
        const matched = active.filter((p) => matchProgram(p, profile).ok);
        const seen = new Set((s.seen_ids || []).map(String));
        const fresh = matched.filter((p) => !seen.has(String(p.pblancId || p.pblancNm)));
        if (fresh.length) {
          out.push({
            email: s.email,
            company: s.company || '',
            url: `https://ownerskr.com/programs?sub=${s.token}`,
            unsubUrl: `https://ownerskr.com/api/programs?unsub=${s.token}`,
            count: fresh.length,
            programs: fresh.slice(0, 15).map((p) => ({
              name: p.pblancNm || '(제목 없음)',
              deadline: extractEndDate(p.reqstBeginEndDe) || '상시/공고 확인',
              link: p.pblancUrl || `https://www.bizinfo.go.kr/web/lay1/bbs/S1T122C128/AS/74/view.do?pblancId=${p.pblancId || ''}`,
            })),
          });
        }
        try { await updateSubscriberSeen(s.id, matched.map((p) => String(p.pblancId || p.pblancNm))); } catch (_) {}
      }
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ ok: true, subscribers: subs.length, emails: out.length, payloads: out });
    } catch (e) { return res.status(500).json({ error: String((e && e.message) || e) }); }
  }

  // ── 기본: BizInfo 프록시 (기존 로직) ──
  const page = String(q.page || '1');
  const keyword = String(q.keyword || '');
  // pageUnit: 클라이언트가 전 공고(약 1,443건)를 한 번에 받도록 허용. 안전 상한 2000.
  let pageUnit = parseInt(q.pageUnit, 10);
  if (!Number.isFinite(pageUnit) || pageUnit < 1) pageUnit = 20;
  if (pageUnit > 2000) pageUnit = 2000;

  // 서버 전용 시크릿. (NEXT_PUBLIC_ 접두 폴백은 브라우저 노출 위험이 있어 제거함)
  const apiKey = process.env.BIZINFO_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'BIZINFO_API_KEY 환경변수가 설정되지 않았습니다' });
  }

  const params = new URLSearchParams({
    crtfcKey: apiKey,
    dataType: 'json',
    pageUnit: String(pageUnit),
    pageIndex: page,
  });
  if (keyword) params.set('searchKeyword', keyword);

  let lastError = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(`${BIZINFO_URL}?${params}`, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const text = await r.text();

      /* BizInfo가 HTML을 반환(점검·키 오류 등) */
      if (text.trimStart().startsWith('<')) {
        if (attempt < 2) { await sleep(1000 * (attempt + 1)); continue; }
        return res.status(503).json({
          error: 'BizInfo가 HTML을 반환했습니다 — 점검 중이거나 API 키 오류일 수 있습니다',
        });
      }

      let data;
      try {
        data = JSON.parse(text);
      } catch {
        return res.status(500).json({ error: 'API 응답 파싱 실패', raw: text.slice(0, 200) });
      }

      /* 완전성 텔레메트리: 반환 건수가 pageUnit 상한에 근접하면 잘림 위험 경고.
         (공고가 pageUnit(최대 2000)을 넘어서면 뒷건이 조용히 누락되고 페이로드가
         Vercel 서버리스 응답 한계(~4.5MB)에 근접하므로 데이터 증가를 추적한다) */
      const arr = Array.isArray(data.jsonArray) ? data.jsonArray : [];
      const totCnt = Number(arr[0]?.totCnt) || arr.length;
      if (totCnt > pageUnit || arr.length >= pageUnit) {
        console.warn(`[bizinfo] 잘림 가능성: totCnt=${totCnt} 반환=${arr.length} pageUnit=${pageUnit}`);
      }

      /* 성공 → CDN 캐시(1시간) + 만료 후 24시간은 stale 서빙하며 백그라운드 갱신.
         원본 text를 그대로 전송해 ~3.3MB 페이로드 재직렬화(JSON.stringify) 비용을 없앤다. */
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=600, s-maxage=3600, stale-while-revalidate=86400');
      return res.status(200).send(text);
    } catch (e) {
      lastError = e;
      if (attempt < 2) await sleep(1000 * (attempt + 1));
    }
  }

  const isTimeout = lastError && lastError.name === 'TimeoutError';
  return res.status(503).json({
    error: isTimeout
      ? 'BizInfo API 응답 시간 초과 — 잠시 후 다시 시도해주세요'
      : 'BizInfo 서버에 연결할 수 없습니다 — 잠시 후 다시 시도해주세요',
  });
};
