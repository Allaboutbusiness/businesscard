// 관리자 1회성 작업. ?secret=INIT_SECRET 필요. (Hobby 함수 12개 한도로 rag-build를 여기 병합)
//   기본            : posts 스키마 생성
//   ?action=rag-build: 코퍼스 임베딩 → pgvector(kb_chunks) 적재(멱등, 재실행 가능)
const path = require('path');
const fs = require('fs');
const { initSchema, initKbSchema, kbClear, kbInsert, kbCount } = require('../lib/db');
const { embedBatch, toVectorLiteral } = require('../lib/rag');

async function ragBuild(res) {
  const p = path.join(__dirname, '..', 'data', 'rag-corpus.json');
  const corpus = JSON.parse(fs.readFileSync(p, 'utf8')).filter((c) => c && c.text && String(c.text).trim());
  if (!corpus.length) return res.status(400).json({ error: '코퍼스 비어있음(data/rag-corpus.json)' });
  await initKbSchema();
  await kbClear();
  const B = 90; // 배치 임베딩(콜당 최대 개수)
  let inserted = 0, embedErrors = 0, firstError = '';
  for (let i = 0; i < corpus.length; i += B) {
    const batch = corpus.slice(i, i + B);
    let vecs = [];
    try { vecs = await embedBatch(batch.map((r) => r.text), 'RETRIEVAL_DOCUMENT'); }
    catch (e) { embedErrors += batch.length; if (!firstError) firstError = String((e && e.message) || e).slice(0, 400); continue; }
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
  return res.json({ ok: true, corpus: corpus.length, inserted, embedErrors, firstError, total: await kbCount() });
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, private');
  if ((req.query.secret || '') !== process.env.INIT_SECRET) {
    return res.status(403).json({ error: 'forbidden' });
  }
  try {
    if ((req.query.action || '') === 'models') {
      const key = process.env.GEMINI_API_KEY || '';
      const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000&key=' + key);
      const j = await r.json();
      const models = (j.models || []).map((m) => ({ name: m.name, methods: m.supportedGenerationMethods }));
      return res.json({ status: r.status, embed: models.filter((m) => (m.methods || []).some((x) => /embed/i.test(x))), gen: models.filter((m) => (m.methods || []).includes('generateContent')).map((m) => m.name) });
    }
    if ((req.query.action || '') === 'rag-build') return await ragBuild(res);
    await initSchema();
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
};
