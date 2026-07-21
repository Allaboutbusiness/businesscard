// 동적 사이트맵 (리라이트 /sitemap.xml → 여기) — 정적 페이지 + 전체 published 글
const { allPublished } = require('../lib/db');
module.exports = async (req, res) => {
  const base = 'https://ownerskr.com';
  const cardSlugs = ['jinki', 'anjisu', 'chaeyonghyun', 'jokiyeol', 'leeseungwon', 'ryuyeju', 'songgihoon', 'yuwooseon'];
  const staticUrls = [['/', '1.0'], ['/programs', '0.8'], ['/cfo', '0.8'], ['/notice', '0.6'], ['/posts', '0.7']]
    .concat(cardSlugs.map((s) => ['/card/' + s, '0.5']));
  let rows = [];
  try { rows = await allPublished(); } catch (_) {}
  const urls = staticUrls.map(([u, p]) => `<url><loc>${base}${u}</loc><priority>${p}</priority></url>`)
    .concat(rows.map((r) => `<url><loc>${base}/post/${r.id}</loc><lastmod>${new Date(r.updated_at).toISOString()}</lastmod><priority>0.6</priority></url>`));
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');
  res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>`);
};
