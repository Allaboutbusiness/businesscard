// SSR 글 페이지 (리라이트 /post/:id → 여기)
const { getPost } = require('../lib/db');
const { renderPostPage } = require('../lib/render');
module.exports = async (req, res) => {
  const id = parseInt(req.query.id, 10);
  let p = null;
  try { p = id ? await getPost(id) : null; } catch (_) {}
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (!p) {
    res.status(404).send('<!DOCTYPE html><meta charset="utf-8"><p style="font-family:sans-serif;padding:40px">글을 찾을 수 없습니다. <a href="/">홈</a></p>');
    return;
  }
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=600');
  res.status(200).send(renderPostPage(p));
};
