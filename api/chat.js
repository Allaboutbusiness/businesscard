// POST /api/chat  {message} → RAG 답변. 토큰 최소화:
//  (1) 로컬 가드레일 0토큰 차단 → (2) 통과 시 질문 1회 임베딩+검색 → (3) 생성 1회(짧은 출력).
// 실패/차단 시에도 deflect:true로 기존 상담연결 흐름을 이어가게 함.
const { localGuard, embed, generate, buildUserPrompt, SYSTEM_PROMPT, toVectorLiteral, naverSearch, inDomainScope } = require('../lib/rag');
const { kbSearch } = require('../lib/db');

// best-effort 인메모리 IP 스로틀(따뜻한 인스턴스 한정) — Gemini 쿼터 남용 방지
const HITS = new Map();
function throttled(ip) {
  const now = Date.now(), win = 60000, max = 20;
  const arr = (HITS.get(ip) || []).filter((t) => now - t < win);
  arr.push(now); HITS.set(ip, arr);
  if (HITS.size > 5000) HITS.clear();
  return arr.length > max;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, private');
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });

  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'x';
  if (throttled(ip)) return res.json({ reply: '잠시 후 다시 시도해 주세요. 급하시면 1668-5033으로 전화 주셔도 돼요.', deflect: true });

  const q = String((req.body || {}).message || '').trim();

  // 1) 0토큰 로컬 방어 (인젝션·불법·빈값·과길이)
  const g = localGuard(q);
  if (!g.ok) return res.json({ reply: g.reply, deflect: true, blocked: g.kind });

  try {
    // 2) 질문 임베딩 → 지식베이스 top-k 검색(검색 실패해도 생성은 시도)
    let chunks = [];
    try {
      const vec = await embed(q, 'RETRIEVAL_QUERY');
      chunks = await kbSearch(toVectorLiteral(vec), 4);
    } catch (_) { chunks = []; }
    chunks = (chunks || []).filter((c) => c.score == null || Number(c.score) >= 0.62);

    // 2.5) 허용범위(정책자금·지원사업·세무·인증·투자 등) 질문일 때만 네이버 검색으로 최신정보 보강.
    //      범위 밖 질문엔 검색조차 안 함. 자격증명 없거나 실패해도 무시(RAG만으로 진행).
    let web = [];
    if (inDomainScope(q)) {
      try { web = await naverSearch(q); } catch (_) { web = []; }
    }

    // 3) 생성 1회(짧은 답변) — 웹 결과는 참고용으로만, 범위 밖 답변 금지 규칙은 SYSTEM_PROMPT가 강제
    const answer = await generate(SYSTEM_PROMPT, buildUserPrompt(chunks, q, web), 240);
    if (!answer) return res.json({ reply: '', deflect: true, empty: true });
    return res.json({ reply: answer, deflect: true, grounded: chunks.length, web: web.length });
  } catch (e) {
    // Gemini 오류 → 빈 reply로 폴백(클라이언트가 기존 안내로 대체)
    return res.json({ reply: '', deflect: true, error: 'gen' });
  }
};
