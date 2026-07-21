// GET /api/posts?category=&limit=&offset=  (공개, published)
// POST /api/posts  (세션 또는 토큰) {category,title,body,coverImage?}
const { listPosts, createPost } = require('../../lib/db');
const { canWrite } = require('../../lib/auth');
const { indexPost } = require('../../lib/kb-sync');

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    const category = req.query.category === 'notice' || req.query.category === 'post' ? req.query.category : null;
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    try { res.json({ posts: await listPosts({ category, limit, offset }) }); }
    catch (e) { res.status(500).json({ error: String(e.message || e) }); }
    return;
  }
  if (req.method === 'POST') {
    if (!canWrite(req)) return res.status(401).json({ error: 'unauthorized' });
    const { category, title, body, coverImage } = req.body || {};
    if (category !== 'notice' && category !== 'post') return res.status(400).json({ error: 'category는 notice|post' });
    if (!title || !String(title).trim()) return res.status(400).json({ error: '제목 필요' });
    if (!body || !String(body).trim()) return res.status(400).json({ error: '본문 필요' });
    try {
      const id = await createPost({ category, title: String(title).slice(0, 300), body: String(body), cover_image: coverImage || null });
      // 발행 즉시 RAG(챗봇 지식)에 자동 색인 — 실패해도 발행 자체는 성공 처리
      try { await indexPost({ id, title: String(title), body: String(body) }); }
      catch (e) { console.warn('kb index(create) 실패:', String((e && e.message) || e)); }
      res.json({ id, url: `https://ownerskr.com/post/${id}` });
    } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
    return;
  }
  res.status(405).json({ error: 'method' });
};
