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

// ── 게시글 분류(카테고리 키워드) → 6개 그룹 색상 매핑 ────────────────────
// 자동발행 제목이 "키워드 + 핵심요약" 형식이라 제목 앞 키워드로 그룹을 결정.
const CATEGORY_GROUPS = {
  fund: ['소상공인정책자금', '중소기업정책자금', '정책자금', '개인사업자대출', '사업자대출', '소상공인대출', '정부지원사업', '정부지원금', '운전자금', '시설자금', '창업지원금', '창업자금'],
  tax: ['종합소득세', '증여세', '상속세', '노란우산', '가업승계', '법인전환', '절세', '세금'],
  mfg: ['스마트공장', '제조혁신', '뿌리기업', '소부장', '공장자동화'],
  cert: ['기업부설연구소', '벤처인증', '이노비즈', '메인비즈'],
  labor: ['고용지원금', '두루누리'],
  rnd: ['수출바우처', '바우처', 'R&D', 'TIPS', 'RIPS'],
};
// 그룹 한글명(칩·필터 라벨)
const GROUP_KO = { all: '전체', fund: '자금', tax: '세무', mfg: '제조·혁신', cert: '인증', labor: '고용', rnd: 'R&D·수출', etc: '기타' };
// startsWith 판정을 위해 긴 키워드 우선(예: 소상공인정책자금 > 정책자금)
const KEYWORDS = Object.values(CATEGORY_GROUPS).flat().sort((a, b) => b.length - a.length);

// "스마트공장 컨설팅 지원사업 마감 임박" → {category:'스마트공장', display:'컨설팅 지원사업 마감 임박'}
function parseTitle(raw) {
  const t = String(raw || '').trim();
  const m = t.match(/^\[(.+?)\]\s*(.*)$/);
  if (m) return { category: m[1], display: m[2] || m[1] };
  const hit = KEYWORDS.find((k) => t.startsWith(k));
  return hit ? { category: hit, display: t.slice(hit.length).replace(/^[\s:·\-–—]+/, '') || hit } : { category: null, display: t };
}
// 카테고리 키워드 → 그룹키
function resolveGroup(cat) {
  if (!cat) return 'etc';
  const e = Object.entries(CATEGORY_GROUPS).find(([, list]) => list.some((k) => cat.includes(k)));
  return e ? e[0] : 'etc';
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
.post-cta{margin-top:22px;background:linear-gradient(135deg,rgba(13,154,140,.24),rgba(20,184,166,.1));border:1px solid rgba(20,184,166,.38);border-radius:18px;padding:28px 24px;text-align:center}
.post-cta-txt{font-size:16px;font-weight:600;color:#fff;line-height:1.6;margin-bottom:16px}
.post-cta-txt b{color:var(--teal-l)}
.post-cta-btn{display:inline-block;background:var(--teal);color:#fff;font-size:15px;font-weight:700;padding:14px 30px;border-radius:50px;text-decoration:none;box-shadow:0 6px 22px rgba(13,154,140,.45)}
.post-cta-tel{display:block;margin-top:12px;font-size:13px;color:rgba(245,243,237,.55);text-decoration:none}
.post-cta-links{display:flex;flex-wrap:wrap;gap:8px 18px;justify-content:center;margin-top:14px}
.post-cta-links a{color:var(--teal-l);text-decoration:none;font-size:13.5px;font-weight:700}
.post-cta-links a:hover{text-decoration:underline}
.backhome{margin:22px 0 0;text-align:center}
.backhome a{color:var(--teal-l);text-decoration:none;font-size:14px;font-weight:600}
.footer{background:#0a0b09;padding:32px 22px 44px;margin-top:34px}
.footer-inner{max-width:820px;margin:0 auto}
.footer-nav{text-align:center;margin-bottom:16px}
.footer-nav a{color:rgba(245,243,237,.6);text-decoration:none;font-size:13px;font-weight:600;margin:0 8px}
.footer-nav a:hover{color:var(--teal-l)}
.footer-copy{font-size:11px;color:rgba(245,243,237,.3);text-align:center;line-height:1.6}
.footer-copy a{color:rgba(245,243,237,.5)}
/* ── 게시글 그리드/분류/검색 ─────────────────────────── */
.g-all{--gc:#14B8A6}.g-fund{--gc:#5B9BD5}.g-tax{--gc:#3FBF8F}.g-mfg{--gc:#A99BEA}
.g-cert{--gc:#E0B25A}.g-labor{--gc:#E58A7E}.g-rnd{--gc:#4FBFC7}.g-etc{--gc:#9FB0C3}
.cat-badge{display:inline-block;font-size:11px;font-weight:800;line-height:1;color:var(--gc,#14B8A6);
  background:rgba(255,255,255,.06);border:1px solid var(--gc,#14B8A6);border-radius:999px;padding:4px 10px}
.filterbar{margin:14px 0 4px}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px}
.chip{display:inline-flex;align-items:center;gap:7px;font-size:13px;font-weight:700;padding:8px 14px;border-radius:999px;
  cursor:pointer;color:rgba(245,243,237,.72);background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14);
  transition:color .15s,background .15s,border-color .15s;white-space:nowrap;font-family:inherit}
.chip:hover{color:#fff;border-color:rgba(255,255,255,.3)}
.chip .dot{width:8px;height:8px;border-radius:50%;background:var(--gc);flex:none}
.chip.active{color:#0a0b09;background:var(--gc);border-color:var(--gc);box-shadow:0 4px 14px rgba(0,0,0,.32)}
.chip.active .dot{background:rgba(10,11,9,.55)}
.searchwrap{position:relative;margin-bottom:8px}
.searchwrap input{width:100%;padding:12px 16px 12px 44px;border-radius:12px;border:1px solid rgba(255,255,255,.14);
  background:rgba(255,255,255,.06);color:#F5F3ED;font-size:15px;font-family:inherit;outline:none}
.searchwrap input:focus{border-color:var(--teal-l);background:rgba(255,255,255,.09)}
.searchwrap input::placeholder{color:rgba(245,243,237,.4)}
.searchwrap .si{position:absolute;left:16px;top:50%;transform:translateY(-50%);width:17px;height:17px;opacity:.5;pointer-events:none}
.count{font-size:13px;color:rgba(245,243,237,.5);margin:6px 2px 2px}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin-top:14px}
@media(max-width:820px){.grid{grid-template-columns:repeat(2,1fr)}}
@media(max-width:540px){.grid{grid-template-columns:1fr}.chips{flex-wrap:nowrap;overflow-x:auto;padding-bottom:4px}}
.card{position:relative;background:rgba(17,19,17,.66);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);
  border:1px solid rgba(255,255,255,.08);border-radius:16px;overflow:hidden;display:flex;flex-direction:column;
  transition:transform .18s,box-shadow .18s,border-color .18s}
.card:hover{transform:translateY(-3px);box-shadow:0 18px 44px rgba(0,0,0,.42);border-color:rgba(20,184,166,.35)}
.card-link{display:flex;flex-direction:column;text-decoration:none;color:inherit;flex:1}
.card-thumb{position:relative;aspect-ratio:16/9;overflow:hidden;background:linear-gradient(135deg,var(--gc,#14B8A6),rgba(10,11,9,.55))}
.card-thumb img{width:100%;height:100%;object-fit:cover;transition:transform .3s}
.card:hover .card-thumb img{transform:scale(1.04)}
.card-thumb .ph{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:0 14px;
  font-size:18px;font-weight:800;color:rgba(255,255,255,.9);text-align:center;text-shadow:0 2px 10px rgba(0,0,0,.4)}
.card-in{padding:14px 16px 16px;display:flex;flex-direction:column;gap:9px;flex:1}
.card-ttl{font-size:16px;font-weight:700;line-height:1.42;color:#F5F3ED;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.card:hover .card-ttl{color:var(--teal-l)}
.card-ex{font-size:13px;line-height:1.6;color:rgba(245,243,237,.55);
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.card-meta{margin-top:auto;font-size:12px;color:rgba(245,243,237,.42)}
.card-admin{display:none;gap:8px;padding:0 16px 14px}
.card-admin.show{display:flex}
.card-admin a,.card-admin button{font-size:12px;font-weight:700;padding:6px 12px;border-radius:8px;text-decoration:none;
  cursor:pointer;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.06);color:#F5F3ED;font-family:inherit}
.card-admin .card-del{color:#ff9b9b;border-color:rgba(255,107,107,.32);background:rgba(255,107,107,.08)}
.noresult{color:rgba(245,243,237,.5);padding:44px 0;text-align:center}
.admin-bar{display:none;gap:8px;margin-bottom:14px}
.admin-bar.show{display:flex}
.admin-bar a,.admin-bar button{font-size:13px;font-weight:700;padding:7px 14px;border-radius:9px;text-decoration:none;
  cursor:pointer;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.07);color:#F5F3ED;font-family:inherit}
.admin-bar .ab-del{color:#ff9b9b;border-color:rgba(255,107,107,.3);background:rgba(255,107,107,.08)}
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
    <a class="nav-link hide-sm" href="/cfo">정기 CFO</a>
    <a class="nav-cta" href="/#apply">상담문의</a>
  </nav>
</header>
<main><div class="wrap">${bodyHtml}</div></main>
<footer class="footer"><div class="footer-inner">
  <div class="footer-nav"><a href="/">홈</a> · <a href="/notice">공지사항</a> · <a href="/posts">게시글</a> · <a href="/cfo">정기 CFO 파트너십</a> · <a href="/#apply">상담문의</a></div>
  <div class="footer-copy">© 2026 (주)오너스경영연구소 전문 컨설팅 그룹 · 김진기 · 1668-5033 · <a href="/privacy">개인정보처리방침</a></div>
  <div class="footer-copy" style="margin-top:7px;font-size:10.5px">※ 게시된 사례·수치는 특정 기업의 결과이며 모든 기업에 동일하게 적용되지 않습니다.</div>
</div></footer>
<script>(function(){try{var p=location.pathname;if(p.slice(0,6)==='/card/'){var r=p.slice(6);sessionStorage.setItem('ownerCard',r.split('/')[0].split('?')[0].split('#')[0]);return;}if(p==='/'||p===''){sessionStorage.removeItem('ownerCard');return;}var slug=sessionStorage.getItem('ownerCard');if(!slug)return;var run=function(){var as=document.getElementsByTagName('a');for(var i=0;i<as.length;i++){var h=as[i].getAttribute('href');if(!h)continue;if(h.charAt(0)==='/'&&h.charAt(1)==='#'){as[i].setAttribute('href','/card/'+slug+h.slice(1));}else if(h==='/'){as[i].setAttribute('href','/card/'+slug);}}};if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',run);}else{run();}}catch(e){}})();</script>
</body></html>`;
}

function renderPostPage(p) {
  const catKo = p.category === 'notice' ? '공지사항' : '게시글';
  const listPath = p.category === 'notice' ? '/notice' : '/posts';
  // 유입 추적 코드 + 인텐트 분기(공고성 글이면 AI 매칭도 안내)
  const code = 'POST-' + p.id;
  const grp = p.category === 'notice' ? 'etc' : resolveGroup(parseTitle(p.title).category);
  const isPgm = ['fund', 'rnd', 'mfg', 'cert', 'labor'].indexOf(grp) >= 0;
  const canonical = `https://ownerskr.com/post/${p.id}`;
  const desc = excerpt(p.body, 150);
  const jsonld = { '@context': 'https://schema.org', '@type': 'Article', headline: p.title,
    datePublished: new Date(p.created_at).toISOString(), dateModified: new Date(p.updated_at).toISOString(),
    author: { '@type': 'Organization', name: '오너스경영연구소 전문 컨설팅 그룹' },
    image: p.cover_image || undefined, mainEntityOfPage: canonical };
  const body = `
  <div class="crumbs"><a href="${listPath}">${catKo}</a> ›</div>
  <div class="admin-bar" id="adminBar">
    <a class="ab-edit" href="/write?id=${p.id}">✎ 수정</a>
    <button class="ab-del" data-id="${p.id}" type="button">🗑 삭제</button>
  </div>
  <article class="panel">
    <h1 class="title"><span class="badge">${catKo}</span>${esc(p.title)}</h1>
    <div class="meta">${fmtDate(p.created_at)}</div>
    ${p.cover_image ? `<img class="cover" src="${esc(p.cover_image)}" alt="${esc(p.title)}">` : ''}
    <div class="content">${bodyToHtml(p.body)}</div>
  </article>
  <div class="post-cta">
    <div class="post-cta-txt">정책자금·정부지원사업·절세, 어디서부터 시작할지 막막하신가요?<br><b>전문가가 무료로 방향을 짚어드립니다.</b></div>
    <a class="post-cta-btn" href="/?code=${code}#apply">3회 무료 상담 신청 →</a>
    <div class="post-cta-links">
      ${isPgm ? `<a href="/programs?code=${code}">이 분야 지원사업 AI 매칭(무료) →</a>` : ''}
      <a href="/cfo?code=${code}">매달 관리받는 정기 CFO 파트너십 →</a>
    </div>
    <a class="post-cta-tel" href="tel:1668-5033">또는 전화 상담 1668-5033</a>
  </div>
  <div class="backhome"><a href="${listPath}">← ${catKo} 목록</a></div>
  <script>
  fetch('/api/me?_='+Date.now(),{cache:'no-store'}).then(function(r){return r.json()}).then(function(m){
    if(!m||!m.loggedIn)return;
    var b=document.getElementById('adminBar'); if(b)b.classList.add('show');
    var d=document.querySelector('.ab-del');
    if(d)d.onclick=function(){ if(!confirm('이 글을 삭제할까요?'))return;
      fetch('/api/posts/'+d.dataset.id,{method:'DELETE'}).then(function(r){
        if(r.ok)location.href='${listPath}'; else alert('삭제 실패'); }); };
  }).catch(function(){});
  </script>`;
  return layout({ title: `${p.title} | 오너스경영연구소`, description: desc, canonical, ogImage: p.cover_image, jsonld, bodyHtml: body });
}

// 카드 1장 HTML(그리드용). 게시글은 제목에서 분류·요약을 파생, 공지는 통짜 표시.
function cardHtml(r, isNotice) {
  let group = 'etc', badge = '공지사항', display = r.title;
  if (!isNotice) {
    const pt = parseTitle(r.title);
    group = resolveGroup(pt.category);
    badge = pt.category || '소식';
    display = pt.display || r.title;
  }
  const ex = excerpt(r.body_head || '', 90);
  const search = esc((`${r.title} ${badge} ${ex}`).toLowerCase());
  const thumb = r.cover_image
    ? `<img src="${esc(r.cover_image)}" alt="${esc(display)}" loading="lazy">`
    : `<div class="ph">${esc(badge)}</div>`;
  return `<article class="card g-${group}" data-group="${group}" data-search="${search}">
    <a class="card-link" href="/post/${r.id}">
      <div class="card-thumb">${thumb}</div>
      <div class="card-in">
        <div><span class="cat-badge">${esc(badge)}</span></div>
        <div class="card-ttl">${esc(display)}</div>
        ${ex ? `<div class="card-ex">${esc(ex)}</div>` : ''}
        <div class="card-meta">📅 ${fmtDate(r.created_at)}</div>
      </div>
    </a>
    <div class="card-admin">
      <a href="/write?id=${r.id}">✎ 수정</a>
      <button class="card-del" data-id="${r.id}" type="button">🗑 삭제</button>
    </div>
  </article>`;
}

function renderListPage(category, rows) {
  const isNotice = category === 'notice';
  const catKo = isNotice ? '공지사항' : '게시글';
  const canonical = `https://ownerskr.com/${isNotice ? 'notice' : 'posts'}`;
  const sub = isNotice ? '오너스경영연구소 공지사항' : '정책자금·정부지원사업·절세 등 대표님께 필요한 소식';

  // 게시글: 그룹별 개수를 세어 글이 있는 그룹의 칩만 노출
  let filterbar = '';
  if (!isNotice && rows.length) {
    const counts = {};
    rows.forEach((r) => { const g = resolveGroup(parseTitle(r.title).category); counts[g] = (counts[g] || 0) + 1; });
    const order = ['fund', 'tax', 'mfg', 'cert', 'labor', 'rnd', 'etc'];
    const chips = ['all'].concat(order.filter((g) => counts[g]))
      .map((g) => `<button class="chip g-${g}${g === 'all' ? ' active' : ''}" data-group="${g}" type="button"><span class="dot"></span>${GROUP_KO[g]}</button>`)
      .join('');
    filterbar = `<div class="filterbar">
      <div class="chips">${chips}</div>
      <div class="searchwrap">
        <svg class="si" viewBox="0 0 24 24" fill="none" stroke="#F5F3ED" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/></svg>
        <input id="q" type="search" placeholder="주제·키워드로 검색 (예: 정책자금, 스마트공장, 절세)" autocomplete="off">
      </div>
    </div>`;
  } else if (isNotice && rows.length) {
    filterbar = `<div class="filterbar"><div class="searchwrap">
      <svg class="si" viewBox="0 0 24 24" fill="none" stroke="#F5F3ED" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/></svg>
      <input id="q" type="search" placeholder="공지 검색" autocomplete="off">
    </div></div>`;
  }

  const grid = rows.length
    ? `<div class="count" id="count"></div>
       <div class="grid" id="grid">${rows.map((r) => cardHtml(r, isNotice)).join('')}</div>
       <p class="noresult" id="noresult" hidden>검색 결과가 없습니다.</p>`
    : `<p class="empty">아직 등록된 글이 없습니다.</p>`;

  const body = `<h1 class="page">${catKo}</h1><div class="page-sub">${sub}</div>
  ${filterbar}${grid}
  <script>
  (function(){
    var chips=[].slice.call(document.querySelectorAll('.chip'));
    var q=document.getElementById('q');
    var countEl=document.getElementById('count');
    var emptyEl=document.getElementById('noresult');
    var cards=[].slice.call(document.querySelectorAll('.card'));
    var state={group:'all',q:''};
    var params=new URLSearchParams(location.search);
    if(params.get('group'))state.group=params.get('group');
    if(params.get('q'))state.q=params.get('q');
    if(q)q.value=state.q;
    function apply(){
      var kw=state.q.trim().toLowerCase();
      var n=0;
      cards.forEach(function(c){
        var okG=state.group==='all'||c.getAttribute('data-group')===state.group;
        var okQ=!kw||(c.getAttribute('data-search')||'').indexOf(kw)>=0;
        var show=okG&&okQ; c.style.display=show?'':'none'; if(show)n++;
      });
      if(countEl)countEl.textContent=n+'개의 글';
      if(emptyEl)emptyEl.hidden=n!==0;
      chips.forEach(function(ch){ch.classList.toggle('active',ch.getAttribute('data-group')===state.group);});
      var p=new URLSearchParams();
      if(state.group!=='all')p.set('group',state.group);
      if(kw)p.set('q',state.q);
      history.replaceState(null,'',location.pathname+(p.toString()?'?'+p.toString():''));
    }
    chips.forEach(function(ch){ch.onclick=function(){state.group=ch.getAttribute('data-group');apply();};});
    var t; if(q)q.oninput=function(){clearTimeout(t);t=setTimeout(function(){state.q=q.value;apply();},200);};
    apply();
    fetch('/api/me?_='+Date.now(),{cache:'no-store'}).then(function(r){return r.json()}).then(function(m){
      if(!m||!m.loggedIn)return;
      document.querySelectorAll('.card-admin').forEach(function(el){el.classList.add('show');});
      document.querySelectorAll('.card-del').forEach(function(b){b.onclick=function(e){
        e.preventDefault();e.stopPropagation();
        if(!confirm('이 글을 삭제할까요?'))return;
        fetch('/api/posts/'+b.dataset.id,{method:'DELETE'}).then(function(r){
          if(r.ok){var card=b.closest('.card');if(card){cards=cards.filter(function(x){return x!==card});card.parentNode.removeChild(card);}apply();}
          else alert('삭제 실패');});
      };});
    }).catch(function(){});
  })();
  </script>`;
  return layout({ title: `${catKo} | 오너스경영연구소`, description: sub, canonical, bodyHtml: body });
}

module.exports = { renderPostPage, renderListPage, esc, fmtDate, excerpt, bodyToHtml };
