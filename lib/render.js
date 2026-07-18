// SSR 공용: 메인 사이트(index.html)와 동일한 다크 디자인(bg.jpg+오버레이·헤더·푸터·색·폰트),
// 마크다운→안전 HTML(markdown-it html:false). sanitize-html은 htmlparser2 ESM 충돌로 미사용.
const MarkdownIt = require('markdown-it');
const md = new MarkdownIt({ html: false, linkify: true, breaks: true });

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function fmtDate(d) {
  const t = new Date(d);
  return `${t.getUTCFullYear()}.${String(t.getUTCMonth() + 1).padStart(2, '0')}.${String(t.getUTCDate()).padStart(2, '0')}`;
}
function bodyToHtml(markdown) {
  return md.render(String(markdown || ''));
}
function excerpt(markdown, n = 150) {
  const plain = String(markdown || '').replace(/[#>*`\-\[\]!()]/g, '').replace(/\s+/g, ' ').trim();
  return plain.length > n ? plain.slice(0, n) + '…' : plain;
}

// 메인 사이트와 동일 토큰: --teal #0D9A8C, 크림 텍스트 #F5F3ED, bg.jpg 고정 배경.
const CSS = `
:root{--teal:#0D9A8C;--teal-l:#14B8A6;--amber:#F59E0B;--cream:#FBFAF4}
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
html{scroll-behavior:smooth}
body{font-family:'Apple SD Gothic Neo','Noto Sans KR','Malgun Gothic',sans-serif;color:#F5F3ED;-webkit-font-smoothing:antialiased;overflow-x:hidden;min-height:100vh}
a{color:inherit}
.fixed-bg{position:fixed;inset:0;z-index:-2;background:url('/bg.jpg') center top/cover no-repeat}
.fixed-bg-overlay{position:fixed;inset:0;z-index:-1;background:linear-gradient(180deg,rgba(5,7,5,.64) 0%,rgba(7,9,7,.8) 55%,rgba(8,10,8,.9) 100%)}
.wrap{width:100%;max-width:820px;margin-inline:auto;padding:0 22px}
.site-header{position:fixed;top:0;left:0;right:0;z-index:1000;display:flex;align-items:center;justify-content:space-between;padding:12px 22px;background:rgba(10,12,11,.85);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border-bottom:1px solid rgba(255,255,255,.08)}
.nav-brand{font-size:15px;font-weight:800;color:#fff;text-decoration:none;letter-spacing:-.3px;white-space:nowrap}
.nav-links{display:flex;align-items:center;gap:20px}
.nav-link{font-size:14px;font-weight:600;color:rgba(255,255,255,.85);text-decoration:none;white-space:nowrap;transition:color .2s}
.nav-link:hover{color:var(--teal-l)}
.nav-cta{font-size:13px;font-weight:700;color:#fff;background:var(--teal);padding:9px 16px;border-radius:10px;text-decoration:none;white-space:nowrap;box-shadow:0 4px 16px rgba(13,154,140,.4)}
@media(max-width:640px){.nav-brand{font-size:12px;letter-spacing:-.5px}.nav-links{gap:12px}.hide-sm{display:none}.nav-cta{padding:8px 12px;font-size:12px}}
main{padding:86px 0 10px}
.crumbs{font-size:13px;color:rgba(245,243,237,.5);margin-bottom:12px}
.crumbs a{color:var(--teal-l);text-decoration:none}
.badge{display:inline-block;font-size:11px;font-weight:700;color:#fff;background:var(--teal);border-radius:5px;padding:2px 8px;margin-right:8px;vertical-align:2px}
.panel{background:rgba(17,19,17,.66);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);border:1px solid rgba(255,255,255,.08);border-radius:18px;padding:32px 30px;box-shadow:0 20px 60px rgba(0,0,0,.35)}
@media(max-width:640px){.panel{padding:24px 18px;border-radius:14px}}
h1.title{font-size:25px;line-height:1.42;font-weight:800;margin:2px 0 10px;color:#fff}
.meta{color:rgba(245,243,237,.45);font-size:13px;margin-bottom:20px}
.cover{width:100%;border-radius:12px;margin:6px 0 22px}
.content{font-size:16px;line-height:1.85;color:rgba(245,243,237,.92)}
.content h2{font-size:20px;font-weight:800;margin:28px 0 10px;color:#fff}
.content h3{font-size:17px;font-weight:700;margin:22px 0 8px;color:#fff}
.content p{margin:14px 0}
.content a{color:var(--teal-l);text-decoration:underline}
.content strong{color:#fff}
.content img{max-width:100%;border-radius:10px;margin:14px 0}
.content ul,.content ol{margin:12px 0 12px 22px}
.content li{margin:5px 0}
.content blockquote{border-left:3px solid var(--teal);padding-left:14px;margin:14px 0;color:rgba(245,243,237,.7)}
.content code{background:rgba(255,255,255,.1);padding:2px 6px;border-radius:5px;font-size:.92em}
.content hr{border:0;border-top:1px solid rgba(255,255,255,.12);margin:22px 0}
h1.page{font-size:24px;font-weight:800;color:#fff;margin-bottom:4px}
.page-sub{color:rgba(245,243,237,.45);font-size:14px;margin-bottom:8px}
.list{list-style:none}
.list li{border-bottom:1px solid rgba(255,255,255,.08)}
.list li:last-child{border-bottom:0}
.list a{display:flex;gap:16px;align-items:center;padding:17px 4px;text-decoration:none;transition:color .15s}
.list .th{width:84px;height:60px;border-radius:8px;object-fit:cover;background:rgba(255,255,255,.06);flex:none}
.list .t{font-weight:600;font-size:16px;color:#F5F3ED;display:block}
.list .d{color:rgba(245,243,237,.4);font-size:12px;margin-top:4px;display:block}
.list a:hover .t{color:var(--teal-l)}
.empty{color:rgba(245,243,237,.45);padding:46px 0;text-align:center}
.backhome{margin:22px 0 0;text-align:center}
.backhome a{color:var(--teal-l);text-decoration:none;font-size:14px;font-weight:600}
.footer{background:#0a0b09;padding:32px 22px 44px;margin-top:34px}
.footer-inner{max-width:820px;margin:0 auto}
.footer-nav{text-align:center;margin-bottom:16px}
.footer-nav a{color:rgba(245,243,237,.6);text-decoration:none;font-size:13px;font-weight:600;margin:0 8px}
.footer-nav a:hover{color:var(--teal-l)}
.footer-copy{font-size:11px;color:rgba(245,243,237,.3);text-align:center;line-height:1.6}
.footer-copy a{color:rgba(245,243,237,.5)}
`;

function layout({ title, description, canonical, ogImage, jsonld, bodyHtml }) {
  return `<!DOCTYPE html><html lang="ko"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(canonical)}">
<meta name="robots" content="index, follow">
<meta name="theme-color" content="#0a0b09">
<meta property="og:type" content="article"><meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${esc(ogImage || 'https://ownerskr.com/og-image.jpg')}">
<meta property="og:site_name" content="김진기 CFO | 전문 컨설팅 그룹">
<link rel="icon" href="/favicon.ico" sizes="any"><link rel="apple-touch-icon" href="/icon-192.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>${CSS}</style>
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld)}</script>` : ''}
</head><body>
<div class="fixed-bg"></div><div class="fixed-bg-overlay"></div>
<header class="site-header">
  <a class="nav-brand" href="/">(주)오너스경영연구소 전문 컨설팅 그룹</a>
  <nav class="nav-links">
    <a class="nav-link hide-sm" href="/#company">회사소개</a>
    <a class="nav-link" href="/notice">공지사항</a>
    <a class="nav-link" href="/posts">게시글</a>
    <a class="nav-cta" href="/#apply">상담문의</a>
  </nav>
</header>
<main><div class="wrap">${bodyHtml}</div></main>
<footer class="footer"><div class="footer-inner">
  <div class="footer-nav"><a href="/">홈</a> · <a href="/notice">공지사항</a> · <a href="/posts">게시글</a> · <a href="/#apply">상담문의</a></div>
  <div class="footer-copy">© 2026 (주)오너스경영연구소 전문 컨설팅 그룹 · 김진기 · 1668-5033 · <a href="/privacy">개인정보처리방침</a></div>
  <div class="footer-copy" style="margin-top:7px;font-size:10.5px">※ 게시된 사례·수치는 특정 기업의 결과이며 모든 기업에 동일하게 적용되지 않습니다.</div>
</div></footer>
</body></html>`;
}

function renderPostPage(p) {
  const catKo = p.category === 'notice' ? '공지사항' : '게시글';
  const listPath = p.category === 'notice' ? '/notice' : '/posts';
  const canonical = `https://ownerskr.com/post/${p.id}`;
  const desc = excerpt(p.body, 150);
  const jsonld = { '@context': 'https://schema.org', '@type': 'Article', headline: p.title,
    datePublished: new Date(p.created_at).toISOString(), dateModified: new Date(p.updated_at).toISOString(),
    author: { '@type': 'Organization', name: '오너스경영연구소 전문 컨설팅 그룹' },
    image: p.cover_image || undefined, mainEntityOfPage: canonical };
  const body = `
  <div class="crumbs"><a href="${listPath}">${catKo}</a> ›</div>
  <article class="panel">
    <h1 class="title"><span class="badge">${catKo}</span>${esc(p.title)}</h1>
    <div class="meta">${fmtDate(p.created_at)}</div>
    ${p.cover_image ? `<img class="cover" src="${esc(p.cover_image)}" alt="${esc(p.title)}">` : ''}
    <div class="content">${bodyToHtml(p.body)}</div>
  </article>
  <div class="backhome"><a href="${listPath}">← ${catKo} 목록</a></div>`;
  return layout({ title: `${p.title} | 오너스경영연구소`, description: desc, canonical, ogImage: p.cover_image, jsonld, bodyHtml: body });
}

function renderListPage(category, rows) {
  const catKo = category === 'notice' ? '공지사항' : '게시글';
  const canonical = `https://ownerskr.com/${category === 'notice' ? 'notice' : 'posts'}`;
  const sub = category === 'notice' ? '오너스경영연구소 공지사항' : '정책자금·정부지원사업·절세 소식';
  const items = rows.length ? `<ul class="list">${rows.map((r) => `
    <li><a href="/post/${r.id}">
      ${r.cover_image ? `<img class="th" src="${esc(r.cover_image)}" alt="">` : `<span class="th"></span>`}
      <span><span class="t">${esc(r.title)}</span><span class="d">${fmtDate(r.created_at)}</span></span>
    </a></li>`).join('')}</ul>` : `<p class="empty">아직 등록된 글이 없습니다.</p>`;
  const body = `<h1 class="page">${catKo}</h1><div class="page-sub">${sub}</div><div class="panel">${items}</div>`;
  return layout({ title: `${catKo} | 오너스경영연구소`, description: sub, canonical, bodyHtml: body });
}

module.exports = { renderPostPage, renderListPage, esc, fmtDate, excerpt, bodyToHtml };
