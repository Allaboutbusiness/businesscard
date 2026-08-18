/* ══════════════════════════════════════════════════════════
   CONSULTING 두 번째 탭 — 성장 로드맵 시네마틱 트랙
   섹션 높이를 항목 수만큼 늘려 두고, 그 구간을 지나는 동안
   sticky 로 고정된 화면 안에서 트랙을 가로로 밀어준다.
   현재 단계 카드는 .on 이 붙어 흰 바탕으로 켜진다.

   ⚠ index.html 전역에 onScroll/tick/start/p 등이 이미 있으므로
     전체를 IIFE 로 감싸 이름이 새어 나가지 않게 한다.
   ══════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var root = document.querySelector('.rm-sec');
  if (!root) return;

  /* ── 데이터 ── */
  var PHASES = [
    { k: '설립기', e: 'FOUNDATION' },
    { k: '성장기', e: 'GROWTH' },
    { k: '확장기', e: 'EXPANSION' },
    { k: '승계 · EXIT', e: 'EXIT' }
  ];
  var GROWTH = [
    { p: 0, t: '법인설립',        d: ['정관검토', '지분구조 및 임원구성', '급여 · 배당 설정', '창업기업확인 및 감면혜택 세팅'] },
    { p: 0, t: '연구소설립',      d: ['기업부설연구소 / 연구개발전담부서', '기술 특허 개발', '연구노트 컨설팅 & 정기신고'] },
    { p: 1, t: '자금조달',        d: ['청년전용창업자금', '직접대출 — 중진공, 소진공', '대리대출 — 기보, 신보, 재단'] },
    { p: 1, t: '수출 판로 & 지원금', d: ['수출 판로개척 / 수출 바우처', '업력별 무상지원금 / 고용지원금', '바우처 사업 — 혁신(제조)'] },
    { p: 1, t: '기업인증',        d: ['벤처기업인증 — 3년 미만', '이노비즈, 메인비즈 — 3년 이후', '기타인증 — ISO, 여성, 소부장, 뿌리'] },
    { p: 2, t: '사옥매입',        d: ['토지매입', '사옥매입', '공장매입'] },
    { p: 3, t: '상속 & 증여',     d: ['가업승계', '기업가치평가'] },
    { p: 3, t: '세무회계',        d: ['자본금증자 및 이익잉여금 관리', '재무제표 관리 및 기업보험', '세무조사 대비'] },
    { p: 3, t: 'M&A EXIT',       d: ['IPO', 'M&A'] }
  ];
  /* c = 어두운 바탕용, cd = 흰 바탕용(대비 확보) */
  var CAT = {
    s: { n: '지원사업', c: '#3B7BF0', cd: '#1D4ED8' },
    i: { n: '투자유치', c: '#14B8A6', cd: '#0B7C71' },
    l: { n: '융자',    c: '#93AABF', cd: '#46617A' },
    t: { n: 'TIPS',    c: '#9A8DF2', cd: '#5A48C9' }
  };
  var SSTAGE = [
    { k: '창업 준비', e: 'PREP' }, { k: '초기 자금', e: 'EARLY' },
    { k: '도약', e: 'SCALE' }, { k: '스케일업', e: 'GROWTH' }
  ];
  var STARTUP = [
    { n: 1,  s: 0, k: 's', t: '아이디어 · 검증',     d: '창업교육 · 메이커스페이스' },
    { n: 2,  s: 0, k: 's', t: '예비창업패키지',      d: 'MVP · 고객검증' },
    { n: 3,  s: 0, k: 's', t: '사업자등록 · 법인설립', d: '법인설립 · 벤처인증' },
    { n: 4,  s: 0, k: 's', t: '청년창업사관학교',     d: 'BM검증 · 제조창업' },
    { n: 5,  s: 0, k: 's', t: '초기창업패키지',      d: '사업화자금 · 3년 이내' },
    { n: 6,  s: 1, k: 't', t: 'Pre-TIPS',          d: '5천만 ~ 1억원' },
    { n: 7,  s: 1, k: 'i', t: 'AC · 컴퍼니빌더',     d: '3천만 ~ 1억원' },
    { n: 8,  s: 1, k: 'l', t: '융자 · 보증',         d: '신용보증 · 기술보증' },
    { n: 9,  s: 1, k: 'i', t: 'Seed 투자',          d: '1억 ~ 5억원' },
    { n: 10, s: 2, k: 's', t: 'R&D',               d: '창업성장 기술개발' },
    { n: 11, s: 2, k: 't', t: 'TIPS',              d: '8억원' },
    { n: 12, s: 2, k: 'i', t: 'Pre-A 투자',         d: '5억 ~ 15억원' },
    { n: 13, s: 2, k: 's', t: '창업도약패키지',      d: '스케일업 · 사업화자금' },
    { n: 14, s: 3, k: 't', t: '딥테크 TIPS',        d: '15억원' },
    { n: 15, s: 3, k: 'i', t: 'Series A',          d: '20억 ~ 40억원' },
    { n: 16, s: 3, k: 's', t: 'Growth · 글로벌 자금', d: '데이터 / AI바우처, 스마트공장' }
  ];

  function pad(n) { return String(n).padStart(2, '0'); }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
  function $(id) { return document.getElementById(id); }

  /* ── 렌더 ── */
  $('rm-tk-growth').innerHTML = GROWTH.map(function (g, i) {
    return '<article class="rm-card' + (i === GROWTH.length - 1 ? ' last' : '') + '">' +
      '<div class="rm-num">' + pad(i + 1) + '</div>' +
      '<span class="rm-ph">' + PHASES[g.p].k + '</span>' +
      '<h4>' + esc(g.t) + '</h4><ul>' +
      g.d.map(function (d, j) { return '<li style="--i:' + j + '"><i></i>' + esc(d) + '</li>'; }).join('') +
      '</ul><span class="rm-tick"></span></article>';
  }).join('');

  $('rm-tk-startup').innerHTML = STARTUP.map(function (x) {
    var c = CAT[x.k];
    return '<article class="rm-scard" style="--cc:' + c.c + ';--ccd:' + c.cd + '">' +
      '<div class="rm-num">' + pad(x.n) + '</div>' +
      '<h4>' + esc(x.t) + '</h4>' +
      '<div class="rm-amt">' + esc(x.d) + '</div>' +
      '<span class="rm-tg">' + c.n + '</span>' +
      '<span class="rm-tick"></span></article>';
  }).join('');

  $('rm-sg-growth').innerHTML = PHASES.map(function (p) { return '<span>' + p.e + '</span>'; }).join('');
  $('rm-sg-startup').innerHTML = SSTAGE.map(function (s) { return '<span>' + s.e + '</span>'; }).join('');
  $('rm-legend').innerHTML = Object.keys(CAT).map(function (k) {
    var c = CAT[k];
    return '<span class="rm-lg" data-c="' + c.n + '" style="--cc:' + c.c + '"><span class="rm-sw"></span>' + c.n + '</span>';
  }).join('');

  /* ── 트랙 엔진 ── */
  var mqStack = window.matchMedia('(max-width:900px)');
  var mqMotion = window.matchMedia('(prefers-reduced-motion:reduce)');

  function makeTrack(o) {
    var pin = $(o.pin), track = $(o.track);
    var cards = Array.prototype.slice.call(track.children);
    var fill = $(o.fill), orb = $(o.orb), cntEl = $(o.count), phEl = $(o.phase);
    var segs = Array.prototype.slice.call($(o.seg).children);
    var cur = -1, centers = [];

    function layout() {
      if (mqStack.matches || mqMotion.matches) { pin.style.height = ''; track.style.transform = ''; return; }
      pin.style.height = (100 + cards.length * o.vh) + 'vh';
      /* 카드 중심을 뷰포트 왼쪽 기준으로 실측한다.
         .rm-track 에 transform 이 걸리면 그 자신이 offsetParent 가 되어
         offsetLeft 가 트랙의 화면상 위치를 빼먹으므로 offsetLeft 는 쓰지 않는다. */
      var vp = track.parentElement;
      var prevX = track.style.transform, prevT = track.style.transition;
      track.style.transition = 'none'; track.style.transform = 'none';
      void track.offsetWidth;
      var vpL = vp.getBoundingClientRect().left;
      centers = cards.map(function (c) { var b = c.getBoundingClientRect(); return b.left - vpL + b.width / 2; });
      track.style.transform = prevX; void track.offsetWidth; track.style.transition = prevT;
    }

    function setActive(i) {
      if (i === cur) return;
      cur = i;
      cards.forEach(function (c, j) {
        c.classList.toggle('on', j === i);
        c.classList.toggle('near', Math.abs(j - i) === 1);
      });
      cntEl.textContent = pad(i + 1);
      var gi = o.groupOf(i);
      if (phEl.dataset.g !== String(gi)) {
        phEl.dataset.g = String(gi);
        phEl.classList.add('sw');
        setTimeout(function () { phEl.textContent = o.groupName(gi); phEl.classList.remove('sw'); }, 200);
      }
      segs.forEach(function (s, j) { s.classList.toggle('on', j <= gi); });
      if (o.legendOf) {
        var nm = o.legendOf(i);
        Array.prototype.forEach.call(document.querySelectorAll('#rm-legend .rm-lg'), function (l) {
          l.classList.toggle('on', l.dataset.c === nm);
        });
      }
    }

    function frame() {
      if (mqStack.matches || mqMotion.matches) {
        // 스택 폴백: 화면 중앙에 가장 가까운 카드를 현재 단계로
        var mid = window.innerHeight * 0.45, best = 0, bd = Infinity;
        cards.forEach(function (c, j) {
          var r = c.getBoundingClientRect();
          var d = Math.abs(r.top + r.height / 2 - mid);
          if (d < bd) { bd = d; best = j; }
        });
        var q = cards.length > 1 ? best / (cards.length - 1) : 0;
        fill.style.width = (q * 100) + '%'; orb.style.left = (q * 100) + '%';
        setActive(best);
        return;
      }
      var r2 = pin.getBoundingClientRect();
      var total = pin.offsetHeight - window.innerHeight;
      var prog = Math.min(1, Math.max(0, (-r2.top) / (total || 1)));
      // 진행도를 "몇 번째 카드"로 환산해 그 카드의 중심을 화면 중앙에 맞춘다
      var f = prog * (cards.length - 1);
      var i0 = Math.floor(f), i1 = Math.min(cards.length - 1, i0 + 1);
      var cx = centers.length ? centers[i0] + (centers[i1] - centers[i0]) * (f - i0) : 0;
      track.style.transform = 'translate3d(' + (-(cx - track.parentElement.clientWidth / 2)) + 'px,0,0)';
      fill.style.width = (prog * 100) + '%'; orb.style.left = (prog * 100) + '%';
      setActive(Math.round(f));
    }

    var ticking = false;
    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () { frame(); ticking = false; });
    }, { passive: true });
    window.addEventListener('resize', function () { layout(); frame(); });
    if (mqStack.addEventListener) mqStack.addEventListener('change', function () { layout(); frame(); });
    // 웹폰트가 늦게 오면 카드 폭이 바뀌므로 로드 후 한 번 더 실측
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { layout(); frame(); });
    layout(); frame();
  }

  makeTrack({
    pin: 'rm-pin-growth', track: 'rm-tk-growth', fill: 'rm-fl-growth', orb: 'rm-or-growth',
    count: 'rm-cn-growth', phase: 'rm-ph-growth', seg: 'rm-sg-growth', vh: 40,
    groupOf: function (i) { return GROWTH[i].p; },
    groupName: function (g) { return PHASES[g].k; }
  });
  makeTrack({
    pin: 'rm-pin-startup', track: 'rm-tk-startup', fill: 'rm-fl-startup', orb: 'rm-or-startup',
    count: 'rm-cn-startup', phase: 'rm-ph-startup', seg: 'rm-sg-startup', vh: 26,
    groupOf: function (i) { return STARTUP[i].s; },
    groupName: function (g) { return SSTAGE[g].k; },
    legendOf: function (i) { return CAT[STARTUP[i].k].n; }
  });
})();
