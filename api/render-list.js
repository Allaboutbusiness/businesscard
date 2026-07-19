// SSR 목록 페이지 (리라이트 /notice, /posts → 여기)
const { listPostsForGrid } = require('../lib/db');
const { renderListPage } = require('../lib/render');
module.exports = async (req, res) => {
  const category = req.query.category === 'notice' ? 'notice' : 'post';
  let rows = [];
  try { rows = await listPostsForGrid({ category, limit: 60, offset: 0 }); } catch (_) {}
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=600');
  res.status(200).send(renderListPage(category, rows));
};
