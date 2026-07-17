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

module.exports = async (req, res) => {
  const q = req.query || {};
  const page = String(q.page || '1');
  const keyword = String(q.keyword || '');
  // pageUnit: 클라이언트가 전 공고(약 1,443건)를 한 번에 받도록 허용. 안전 상한 2000.
  let pageUnit = parseInt(q.pageUnit, 10);
  if (!Number.isFinite(pageUnit) || pageUnit < 1) pageUnit = 20;
  if (pageUnit > 2000) pageUnit = 2000;

  const apiKey = process.env.BIZINFO_API_KEY || process.env.NEXT_PUBLIC_BIZINFO_API_KEY;
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

      /* 성공 → CDN 캐시(1시간) + 만료 후 24시간은 stale 서빙하며 백그라운드 갱신 */
      res.setHeader('Cache-Control', 'public, max-age=600, s-maxage=3600, stale-while-revalidate=86400');
      return res.status(200).json(data);
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
