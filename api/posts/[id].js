// GET /api/posts/:id (공개)  DELETE (세션)  PATCH {status} (세션)
const { getPost, deletePost, setStatus } = require('../../lib/db');
const { isLoggedIn } = require('../../lib/auth');

module.exports = async (req, res) => {
  const id = parseInt(req.query.id, 10);
  if (!id) return res.status(400).json({ error: 'bad id' });
  if (req.method === 'GET') {
    const p = await getPost(id);
    return p ? res.json({ post: p }) : res.status(404).json({ error: 'not found' });
  }
  if (!isLoggedIn(req)) return res.status(401).json({ error: 'unauthorized' });
  if (req.method === 'DELETE') { await deletePost(id); return res.json({ ok: true }); }
  if (req.method === 'PATCH') {
    const s = (req.body || {}).status;
    if (s !== 'published' && s !== 'hidden') return res.status(400).json({ error: 'status' });
    await setStatus(id, s); return res.json({ ok: true });
  }
  res.status(405).json({ error: 'method' });
};
