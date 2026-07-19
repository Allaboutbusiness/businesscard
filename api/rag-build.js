// POST/GET /api/rag-build?secret=INIT_SECRET  — 코퍼스를 임베딩해 pgvector에 적재(멱등, 재실행 가능).
// 인증: INIT_SECRET 쿼리 또는 관리자 세션. Gemini 키(GEMINI_API_KEY)는 Vercel 환경변수 사용.
const path = require('path');
const fs = require('fs');
const { embedBatch, toVectorLiteral } = require('../lib/rag');
const { initKbSchema, kbClear, kbInsert, kbCount } = require('../lib/db');
const { isLoggedIn } = require('../lib/auth');

function loadCorpus() {
  const p = path.join(__dirname, '..', 'data', 'rag-corpus.json');
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, private');
  const secret = (req.query && req.query.secret) || '';
  if (!(secret && secret === process.env.INIT_SECRET) && !isLoggedIn(req)) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  try {
    const corpus = loadCorpus().filter((c) => c && c.text && String(c.text).trim());
    if (!corpus.length) return res.status(400).json({ error: '코퍼스가 비어 있음(data/rag-corpus.json)' });

    await initKbSchema();
    await kbClear();

    const B = 90; // 배치 임베딩(콜당 최대 개수)
    let inserted = 0, embedErrors = 0;
    for (let i = 0; i < corpus.length; i += B) {
      const batch = corpus.slice(i, i + B);
      let vecs = [];
      try { vecs = await embedBatch(batch.map((r) => r.text), 'RETRIEVAL_DOCUMENT'); }
      catch (e) { embedErrors += batch.length; continue; }
      for (let j = 0; j < batch.length; j++) {
        if (!vecs[j] || !vecs[j].length) { embedErrors++; continue; }
        await kbInsert({
          category: batch[j].category, topic: batch[j].topic,
          text: batch[j].text, source: batch[j].source,
          vecLiteral: toVectorLiteral(vecs[j]),
        });
        inserted++;
      }
    }
    return res.json({ ok: true, corpus: corpus.length, inserted, embedErrors, total: await kbCount() });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
};
