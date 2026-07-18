// SSR 공용: 브랜드 레이아웃, 마크다운→정화 HTML, 목록/글 페이지
const MarkdownIt = require('markdown-it');
const sanitizeHtml = require('sanitize-html');
const md = new MarkdownIt({ html: false, linkify: true, breaks: true });

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function fmtDate(d) {
  const t = new Date(d);
  return `${t.getUTCFullYear()}.${String(t.getUTCMonth() + 1).padStart(2, '0')}.${String(t.getUTCDate()).padStart(2, '0')}`;
}
function bodyToHtml(markdown) {
  return sanitizeHtml(md.render(String(markdown || '')), {
    allowedTags: ['h1','h2','h3','h4','p','a','ul','ol','li','blockquote','strong','em','code','pre','img','br','hr','table','thead','tbody','tr','th','td'],
    allowedAttributes: { a: ['href','title','target','rel'], img: ['src','alt'] },
    allowedSchemes: ['https','http','mailto'],
    transformTags: { a: (t, a) => ({ tagName: 'a', attribs: { ...a, target: '_blank', rel: 'noopener nofollow' } }) },
  });
}
function excerpt(markdown, n = 150) {
  const plain = String(markdown || '').replace(/[#>*`\-\[\]!()]/g, '').replace(/\s+/g, ' ').trim();
  return plain.length > n ? plain.slice(0, n) + '…' : plain;
}

const CSS = `
:root{--teal:#0D9A8C;--ink:#111;--muted:#667}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Pretendard,-apple-system,sans-serif;color:var(--ink);line-height:1.7;background:#fff}
a{color:inherit}
.wrap{max-width:760px;margin:0 auto;padding:0 20px}
.topbar{border-bottom:1px solid #eee;padding:16px 0}
.topbar a{font-weight:800;color:var(--teal);text-decoration:none;font-size:15px}
.crumbs{font-size:13px;color:var(--muted);margin:22px 0 6px}
h1.title{font-size:26px;line-height:1.35;margin:6px 0 8px}
.meta{color:var(--muted);font-size:13px;margin-bottom:18px}
.cover{width:100%;border-radius:12px;margin:8px 0 20px}
.content{font-size:16px}
.content h2{font-size:20px;margin:26px 0 10px}
.content h3{font-size:18px;margin:20px 0 8px}
.content p{margin:12px 0}
.content img{max-width:100%;border-radius:10px;margin:12px 0}
.content ul,.content ol{margin:12px 0 12px 22px}
.content a{color:var(--teal)}
.list{list-style:none;margin:18px 0 40px}
.list li{border-bottom:1px solid #f0f0f0}
.list a{display:flex;gap:14px;padding:16px 2px;text-decoration:none;align-items:center}
.list .th{width:76px;height:56px;border-radius:8px;object-fit:cover;background:#f3f5f5;flex:none}
.list .t{font-weight:600;font-size:16px}
.list .d{color:var(--muted);font-size:12px;margin-top:3px}
.badge{display:inline-block;font-size:11px;color:#fff;background:var(--teal);border-radius:4px;padding:1px 6px;margin-right:6px;vertical-align:1px}
.foot{border-top:1px solid #eee;margin-top:40px;padding:22px 0;color:var(--muted);font-size:13px}
.empty{color:var(--muted);padding:40px 0}
h1.page{font-size:22px;margin:22px 0 4px}
`;

function layout({ title, description, canonical, ogImage, jsonld, bodyHtml }) {
  return `<!DOCTYPE html><html lang="ko"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(canonical)}">
<meta name="robots" content="index, follow">
<meta property="og:type" content="article"><meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${esc(canonical)}">
${ogImage ? `<meta property="og:image" content="${esc(ogImage)}">` : ''}
<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css">
<style>${CSS}</style>
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld)}</script>` : ''}
</head><body>
<div class="topbar"><div class="wrap"><a href="/">← 김진기 CFO | 오너스경영연구소</a></div></div>
<div class="wrap">${bodyHtml}</div>
<div class="foot"><div class="wrap">(주)오너스경영연구소 전문 컨설팅 그룹 · <a href="/">홈</a> · <a href="/notice">공지사항</a> · <a href="/posts">게시글</a></div></div>
</body></html>`;
}

function renderPostPage(p) {
  const catKo = p.category === 'notice' ? '공지사항' : '게시글';
  const canonical = `https://ownerskr.com/post/${p.id}`;
  const desc = excerpt(p.body, 150);
  const jsonld = { '@context': 'https://schema.org', '@type': 'Article', headline: p.title,
    datePublished: new Date(p.created_at).toISOString(), dateModified: new Date(p.updated_at).toISOString(),
    author: { '@type': 'Organization', name: '오너스경영연구소 전문 컨설팅 그룹' },
    image: p.cover_image || undefined, mainEntityOfPage: canonical };
  const body = `
  <div class="crumbs"><a href="/${p.category === 'notice' ? 'notice' : 'posts'}">${catKo}</a></div>
  <h1 class="title"><span class="badge">${catKo}</span>${esc(p.title)}</h1>
  <div class="meta">${fmtDate(p.created_at)}</div>
  ${p.cover_image ? `<img class="cover" src="${esc(p.cover_image)}" alt="${esc(p.title)}">` : ''}
  <div class="content">${bodyToHtml(p.body)}</div>`;
  return layout({ title: `${p.title} | 오너스경영연구소`, description: desc, canonical, ogImage: p.cover_image, jsonld, bodyHtml: body });
}

function renderListPage(category, rows) {
  const catKo = category === 'notice' ? '공지사항' : '게시글';
  const canonical = `https://ownerskr.com/${category === 'notice' ? 'notice' : 'posts'}`;
  const items = rows.length ? `<ul class="list">${rows.map((r) => `
    <li><a href="/post/${r.id}">
      ${r.cover_image ? `<img class="th" src="${esc(r.cover_image)}" alt="">` : `<span class="th"></span>`}
      <span><span class="t">${esc(r.title)}</span><span class="d">${fmtDate(r.created_at)}</span></span>
    </a></li>`).join('')}</ul>` : `<p class="empty">아직 등록된 글이 없습니다.</p>`;
  const body = `<h1 class="page">${catKo}</h1>${items}`;
  return layout({ title: `${catKo} | 오너스경영연구소`, description: `${catKo} 목록`, canonical, bodyHtml: body });
}

module.exports = { renderPostPage, renderListPage, esc, fmtDate, excerpt, bodyToHtml };
