// GET /api/posts/:id (공개; 로그인 시 숨김글도)  DELETE (세션)  PATCH (세션): 상태토글 또는 전체수정
const { getPost, getPostAny, deletePost, setStatus, updatePost } = require('../../lib/db');
const { isLoggedIn } = require('../../lib/auth');
const { indexPost, unindexPost } = require('../../lib/kb-sync');

module.exports = async (req, res) => {
  const id = parseInt(req.query.id, 10);
  if (!id) return res.status(400).json({ error: 'bad id' });

  if (req.method === 'GET') {
    // 로그인 상태면 숨김 글도 반환(편집 프리필용)
    const p = isLoggedIn(req) ? await getPostAny(id) : await getPost(id);
    return p ? res.json({ post: p }) : res.status(404).json({ error: 'not found' });
  }

  if (!isLoggedIn(req)) return res.status(401).json({ error: 'unauthorized' });

  if (req.method === 'DELETE') {
    await deletePost(id);
    try { await unindexPost(id); } catch (_) {}  // 챗봇 지식에서도 제거
    return res.json({ ok: true });
  }

  if (req.method === 'PATCH') {
    const b = req.body || {};
    // (a) 공개/숨김 상태 토글
    if (b.status !== undefined) {
      if (b.status !== 'published' && b.status !== 'hidden') return res.status(400).json({ error: 'status' });
      await setStatus(id, b.status);
      // 숨김이면 챗봇 지식에서 빼고, 공개면 다시 넣는다
      try {
        if (b.status === 'hidden') await unindexPost(id);
        else { const cur = await getPostAny(id); if (cur) await indexPost({ id, title: cur.title, body: cur.body }); }
      } catch (_) {}
      return res.json({ ok: true });
    }
    // (b) 제목·본문·분류·대표사진 전체 수정
    const category = b.category === 'notice' ? 'notice' : 'post';
    if (!b.title || !String(b.title).trim()) return res.status(400).json({ error: '제목 필요' });
    if (!b.body || !String(b.body).trim()) return res.status(400).json({ error: '본문 필요' });
    const cur = await getPostAny(id);
    if (!cur) return res.status(404).json({ error: 'not found' });
    try {
      await updatePost(id, {
        category,
        title: String(b.title).slice(0, 300),
        body: String(b.body),
        cover_image: b.coverImage || null,
      });
      // 수정 반영 → RAG 재색인
      try { await indexPost({ id, title: String(b.title), body: String(b.body) }); }
      catch (e) { console.warn('kb index(update) 실패:', String((e && e.message) || e)); }
      return res.json({ ok: true, url: `https://ownerskr.com/post/${id}` });
    } catch (e) { return res.status(500).json({ error: String(e.message || e) }); }
  }

  res.status(405).json({ error: 'method' });
};
