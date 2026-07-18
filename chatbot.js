/* ─────────────────────────────────────────────────────────────────────────
 * chatbot.js — 김진기 사외 CFO 상담유도 챗봇 (카카오톡형 · MVP)
 * 설계: design_v4. 불변식 = ①Type A 비공개 ②핸드오프 무결성 ③정적 실현성.
 * - 정식사업명·기관실명·지원요율·상한선·심사컷라인·금액 문자열 0 (이 파일 어디에도).
 * - 상담유형 checkbox는 .value를 절대 읽지 않고 인덱스+하드코딩 라벨로만 처리.
 * - 프리필은 실제 <option> value/.checked만. 제출은 기존 #apForm 재사용 + 단일 소유권.
 * 의존: window.DIAGRULES (diag-rules.js), 기존 #apForm/#apSink/#apAgree.
 * ──────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  if (window.__jkChatInit) return; window.__jkChatInit = true;

  var AP_OK_EVENT = 'apSubmitOk';
  var LOGO = '/logogo.png?v=20260718d';  // ?v= 필수: 이전 404가 브라우저에 캐시돼 있어 쿼리로 우회
  var TEL = '1668-5033';
  var PRIVACY = '/privacy';
  var reduce = false;
  try { reduce = window.matchMedia && matchMedia('(prefers-reduced-motion:reduce)').matches; } catch (e) {}

  /* ── 폼 매핑(옵션 원문과 바이트 일치) ── */
  var SECTOR_FORM = { mfg:'제조업', retail:'도소매업', it:'IT개발업', svc:'서비스업', con:'건설업', etc:'기타' };
  var SECTOR_KO   = { mfg:'제조·가공', retail:'도소매', it:'IT·SW', svc:'서비스', con:'건설', etc:'기타' };
  var EMP_FORM    = { one:'5인 미만', two4:'5인 미만', five9:'5~9인', ten49:'10인 이상', fifty:'10인 이상' };
  var EMP_KO      = { one:'나 혼자', two4:'2~4명', five9:'5~9명', ten49:'10~49명', fifty:'50명 이상' };
  var REV_FORM    = { r3:'3억 미만', r310:'3~10억', r1030:'10~30억', r3080:'30~80억', r80p:'80억 이상' };
  var BIZ_FORM    = { indiv:'개인사업자', corp:'법인사업자', pre:'예비사업자' };
  var BIZ_KO      = { indiv:'개인사업자', corp:'법인사업자', pre:'예비·준비중' };
  var AGE_KO      = { pre:'예비창업', lt1:'1년 미만', y13:'1~3년', y37:'3~7년', y7p:'7년 이상' };
  var TAX_FORM    = { none:'세금체납 없음', tax:'세금체납 중' }; // credit → 미기입
  var REGION_FORM = { seoul:'서울', metro:'경기·인천', other:'그 외 지역' };
  var REGION_KO   = { seoul:'서울', metro:'경기·인천', other:'그 외' };
  // 상담유형 체크박스 인덱스(#apply 순서 고정) — .value는 절대 읽지 않음
  var CONSULT_LABELS = ['정책자금','정부지원사업','기업 인증','법인전환·법률·노무','재무·절세','복지몰·사내근로복지기금','컨설팅 협업'];

  /* ── 상태 ── */
  var answers = {};
  var picked = { consult: {} };   // consult: {index:true}
  var contact = { tel:'', name:'', company:'' };
  var submitted = false, badgesShown = false, exitIntercepted = false;

  /* ── DOM refs ── */
  var apForm = document.getElementById('apForm');
  var apAgree = document.getElementById('apAgree');
  var panel, logEl, inputEl, progFill, launcher, teaserEl;

  function F(name) { return apForm ? apForm.querySelector('[name="' + name + '"]') : null; }

  /* ── 유틸 ── */
  function el(html) { var d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstChild; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]); }); }
  function scrollDown() { if (logEl) logEl.scrollTop = logEl.scrollHeight; }

  /* ── 메시지 엔진 ── */
  function typingNode() {
    return el('<div class="jk-row jk-bot"><div class="jk-ava"><img src="' + LOGO + '" alt=""></div>' +
      '<div class="jk-typing" aria-hidden="true"><i></i><i></i><i></i></div></div>');
  }
  function say(html, delay) {
    return new Promise(function (resolve) {
      var d = reduce ? 0 : (delay == null ? 340 : delay);
      var t = typingNode(); logEl.appendChild(t); scrollDown();
      setTimeout(function () {
        logEl.removeChild(t);
        var row = el('<div class="jk-row jk-bot"><div class="jk-ava"><img src="' + LOGO + '" alt=""></div>' +
          '<div class="jk-msg">' + html + '</div></div>');
        logEl.appendChild(row); scrollDown();
        resolve();
      }, d);
    });
  }
  function userSay(text) {
    logEl.appendChild(el('<div class="jk-row jk-user"><div class="jk-msg">' + esc(text) + '</div></div>'));
    scrollDown();
  }
  function node(n) { logEl.appendChild(n); scrollDown(); return n; }

  function logMark() { return logEl.children.length; }
  function logTruncate(n) { while (logEl.children.length > n) logEl.removeChild(logEl.lastChild); }

  /* 입력영역: 퀵리플라이 + (옵션) 직접입력 토글 */
  function clearInput() { inputEl.innerHTML = ''; }
  function showQuick(options, onPick, opts) {
    opts = opts || {};
    clearInput();
    var wrap = el('<div class="jk-quick"></div>');
    options.forEach(function (o) {
      var b = el('<button type="button" class="jk-qbtn' + (o.strong ? ' jk-strong' : '') + (o.ghost ? ' jk-ghost' : '') + (o.tel ? ' jk-tel' : '') + '">' + esc(o.label) + '</button>');
      if (o.href) { b.onclick = function () { window.location.href = o.href; }; }
      else b.onclick = function () { onPick(o.value, o); };
      wrap.appendChild(b);
    });
    inputEl.appendChild(wrap);
    if (opts.back) {
      var bk = el('<div class="jk-back"><button type="button">↩ 이전으로</button></div>');
      bk.firstChild.onclick = opts.back; inputEl.appendChild(bk);
    }
    if (opts.type !== false) addTypeToggle();
  }
  function addTypeToggle() {
    var t = el('<div class="jk-typetoggle"><button type="button">✎ 직접 입력하기</button></div>');
    t.firstChild.onclick = function () { showTypebar('궁금한 걸 편하게 적어주세요', function (v) { handleFreeText(v); }); };
    inputEl.appendChild(t);
  }
  function showTypebar(placeholder, onSend, autofocus, inputmode) {
    var bar = el('<div class="jk-typebar"><input type="text" placeholder="' + esc(placeholder) + '"' +
      (inputmode ? ' inputmode="' + inputmode + '"' : '') + '><button type="button" class="jk-send" aria-label="보내기">↑</button></div>');
    var input = bar.querySelector('input'), send = bar.querySelector('.jk-send');
    function go() { var v = input.value.trim(); if (!v) return; onSend(v); }
    send.onclick = go;
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); go(); } });
    inputEl.appendChild(bar);
    if (autofocus && !reduce) { try { input.focus(); } catch (e) {} }
    return input;
  }

  /* ── 진단 스텝 정의 ── */
  var STEPS = [
    { id:'sector', q:'대표님, 어떤 사업 하고 계세요?', opts:[
      {label:'제조·가공', value:'mfg'},{label:'도소매', value:'retail'},{label:'IT·SW', value:'it'},
      {label:'서비스', value:'svc'},{label:'건설', value:'con'},{label:'기타', value:'etc'}],
      react:function(v){ return ({ mfg:'제조, 제가 기준 짤 때 제일 공들인 자리예요.', retail:'도소매는 업종 인정에서 갈리는 분이 많더라고요.',
        it:'IT는 기술 쪽 갈래가 따로 열리거든요.', svc:'서비스도 보이는 갈래가 있어요.', con:'건설은 뿌리 쪽이면 갈래가 또 달라지고요.', etc:'네, 우선 큰 틀부터 볼게요.' })[v]; } },
    { id:'employees', q:'직원은 몇 분이세요?', sub:'대표님 빼고 상시 근로자 기준이에요.', opts:[
      {label:'나 혼자', value:'one'},{label:'2~4명', value:'two4'},{label:'5~9명', value:'five9'},{label:'10~49명', value:'ten49'},{label:'50명 이상', value:'fifty'}],
      react:function(v){ return (v==='one') ? '1인이시면 1인 전용으로 열리는 갈래가 있어요.' : '이 인원대가 딱 지원제도 갈리는 구간이거든요.'; } },
    { id:'businessAge', q:'창업하신 지는 얼마나 되셨어요?', opts:[
      {label:'예비창업', value:'pre'},{label:'1년 미만', value:'lt1'},{label:'1~3년', value:'y13'},{label:'3~7년', value:'y37'},{label:'7년 이상', value:'y7p'}],
      react:function(v){ return (v==='pre'||v==='lt1') ? '초기엔 초기 전용 갈래가 따로 있거든요.' : (v==='y7p' ? '업력 있으시면 또 다른 쪽이 열려요.' : '이 시기가 선택지가 제일 넓은 구간이에요.'); } },
    { id:'ceoAge', q:'대표님 연령대만 살짝 여쭤볼게요.', opts:[
      {label:'네, 청년이에요 (39세 이하)', value:'young'},{label:'40세 이상이에요', value:'adult'}],
      react:function(v){ return (v==='young') ? '청년 전용 갈래가 하나 더 열리네요.' : '네, 확인했어요.'; } },
    { id:'bizType', q:'사업자 형태는 어떻게 되세요?', opts:[
      {label:'개인사업자', value:'indiv'},{label:'법인사업자', value:'corp'},{label:'예비·준비중', value:'pre'}],
      react:function(v){ return (v==='corp') ? '법인이시면 자금 말고도 볼 게 더 있어요.' : '네, 확인했어요.'; } },
    { id:'revenue', q:'연 매출은 어느 구간이세요?', opts:[
      {label:'3억 미만', value:'r3'},{label:'3~10억', value:'r310'},{label:'10~30억', value:'r1030'},{label:'30~80억', value:'r3080'},{label:'80억 이상', value:'r80p'}],
      react:function(v){ return (v==='r3080'||v==='r80p') ? '이 구간이면 저는 자금보다 절세·증여 쪽을 먼저 봐요.' : '네, 이 구간에서 보이는 갈래가 있어요.'; } },
    { id:'situation', q:'지금 사업 상황은 어떠세요?', opts:[
      {label:'정상 운영 중', value:'normal'},{label:'매출이 줄었어요', value:'decline'},{label:'재해 피해', value:'disaster'},{label:'폐업 후 재창업', value:'relaunch'},{label:'사업 전환 준비', value:'pivot'}],
      react:function(v){ return (v==='decline') ? '그럴 때 오히려 보는 자금이 따로 있거든요.' : (v==='disaster' ? '재해 쪽은 신청 기간이 짧아서 타이밍이 중요해요.' : '네, 확인했어요.'); } },
    { id:'tech', q:'기술이나 특허, 해당되는 게 있으세요?', sub:'가장 가까운 것 하나만요.', opts:[
      {label:'특허·실용신안 있음', value:'patent'},{label:'정부 R&D 완료', value:'rd'},{label:'기업부설연구소', value:'lab'},{label:'해당 없음', value:'notech', ghost:true}],
      react:function(v){ return (v==='notech') ? '없어도 괜찮아요, 다른 갈래로 봐요.' : '오, 그거 있으면 가점 갈래가 생겨요.'; } }
  ];

  function labelOf(step, value) {
    for (var i = 0; i < step.opts.length; i++) if (step.opts[i].value === value) return step.opts[i].label;
    return value;
  }

  /* ── 진단 드라이버(마커 기반 되돌아가기) ── */
  function runDiagnosis() {
    var i = 0, marks = [];
    setProgress(0);
    function step() {
      if (i >= STEPS.length) { return showResult(); }
      var s = STEPS[i];
      marks[i] = logMark();
      var intro = s.q + (s.sub ? '<br><span style="color:#8391a0;font-size:12px">' + s.sub + '</span>' : '');
      say(intro).then(function () {
        showQuick(s.opts, function (v) {
          userSay(labelOf(s, v));
          answers[s.id] = v;
          setProgress((i + 1) / STEPS.length);
          clearInput();
          var r = s.react && s.react(v);
          var done = function () { i++; step(); };
          if (r) say(r, 260).then(done); else done();
        }, { back: i > 0 ? function () { i--; logTruncate(marks[i]); setProgress(i / STEPS.length); step(); } : null });
      });
    }
    step();
  }
  function setProgress(p) { if (progFill) progFill.style.width = Math.round(Math.max(0, Math.min(1, p)) * 100) + '%'; }

  /* ── 3막: Type B 티저 결과 (clean-room) ── */
  function bucketReason(bucketKey) {
    if (bucketKey === 'loan') {
      var m = { mfg:'제조업은 여기서 업종 하나 때문에 놓치는 분이 많거든요.', retail:'도소매는 업종 인정만 잡아도 열리는 쪽이에요.',
        it:'기술 쪽이면 융자 조건이 또 달라지고요.', con:'건설은 세부 분야에 따라 갈려요.' };
      return m[answers.sector] || '조건만 맞추면 열리는 쪽이에요.';
    }
    if (bucketKey === 'cert') return '인증은 미리 세팅해두면 다른 갈래 점수까지 같이 올라가거든요.';
    if (bucketKey === 'support') return '무상·바우처 쪽은 공고 타이밍이 8할이에요.';
    return '';
  }
  var BUCKET_TITLE = { loan:'정책자금 융자', cert:'기업 인증', support:'정부지원사업(무상·바우처)', guarantee:'보증' };
  var DEF_BRIDGE = {
    '업종 분류 재정비':'업종 하나 바로잡으면 열리는 자금이 있어요.',
    '업종 인정 근거':'업종 인정만 받아도 갈래가 늘어요.',
    '사업계획서 설계':'계획서 순서만 잡아도 선정이 갈려요.',
    '신청 순서·타이밍':'타이밍만 맞춰도 되는 갈래가 있거든요.',
    '법인 자금 개인화':'법인 자금, 대표님 개인으로 넘기는 합법 순서가 있어요.',
    '기술 인증 정비':'기술 인증을 정비하면 가점이 붙어요.',
    '신청 시점 근거':'신청 시점 근거만 갖춰도 통과율이 달라져요.'
  };
  var URGENCY = {
    early:'사업자 내기 직전이나 직후에만 열리는 갈래가 있거든요. 순서가 지나면 그 갈래는 닫혀요.',
    crisis:'재해나 경영 어려움 겪으실 땐 신청 기간이 짧거든요. 사유 생긴 시점 기준이라 타이밍이 중요해요.',
    young:'청년 전용 갈래는 나이 요건 지나면 아예 안 열려요.',
    whale:'이 매출 구간은 올해 예산이 제일 빨리 소진되는 자리이기도 하고요.',
    general:'정책자금은 예산 한정 선착순이거든요. 지금 이 순간에도 마감되는 공고가 있고요.'
  };

  function showResult() {
    var r = window.DIAGRULES.run(answers);
    answers._def = r.deficiencies; answers._urg = r.urgencyKey; answers._whale = r.whale;
    setProgress(0.62);
    say('자, 대표님 조건 정리해봤어요.').then(function () {
      return say('크게 <b>세 갈래</b>가 지금 열려 있어요.');
    }).then(function () {
      // 3갈래 계열 + 이유
      var cards = ['loan', 'cert', 'support'].map(function (k) {
        return '<div class="jk-def"><b>' + BUCKET_TITLE[k] + ' 계열</b><br>' + bucketReason(k) + '</div>';
      }).join('');
      node(el('<div class="jk-defs">' + cards + '</div>'));
      // 결핍칩(이득다리)
      return say('근데 진짜는 지금부터거든요.');
    }).then(function () {
      var chips = (answers._def || []).map(function (d) {
        return '<div class="jk-def">' + (DEF_BRIDGE[d] || d) + '</div>';
      }).join('');
      if (chips) node(el('<div class="jk-defs">' + chips + '</div>'));
      // 숫자 앵커(직원)
      var empKo = EMP_KO[answers.employees];
      if (answers.employees && answers.employees !== 'one') {
        return say(empKo + ' 쓰신다고 하셨죠?').then(function () {
          return say('그중 한 명 일 년 월급이 통째로 뜬 경우도 봤거든요.');
        }).then(function () { return say('물론 정확한 규모는 서류 봐야 나와요.'); });
      }
      return Promise.resolve();
    }).then(function () {
      // 고래 CFO 훅
      if (answers._whale) {
        return say('매출 이 구간 법인이면, 저는 자금보다 절세·증여·상속 쪽을 먼저 봐요.');
      }
      return Promise.resolve();
    }).then(function () {
      // limitation 언락
      return say('마지막으로 갈래 하나만 더 열어볼게요.');
    }).then(function () {
      return say('지금 세금 밀렸거나 대출 연체 걸린 거, 혹시 있으신 건 아니죠? 있어도 보는 자금이 따로 있거든요.');
    }).then(function () {
      showQuick([
        { label:'없어요, 정상이에요', value:'none' },
        { label:'세금이 좀…', value:'tax' },
        { label:'대출 연체가…', value:'credit' }
      ], function (v) {
        answers.limitation = v; userSay(v === 'none' ? '없어요, 정상이에요' : (v === 'tax' ? '세금이 좀…' : '대출 연체가…'));
        clearInput();
        afterLimitation(v);
      }, { type:false });
    });
  }

  function afterLimitation(v) {
    setProgress(0.72);
    var p;
    if (v === 'none') {
      p = say('그럼 보증까지 네 갈래네요.').then(function () {
        node(el('<div class="jk-defs"><div class="jk-def"><b>보증 계열</b><br>정상 운영이시면 이 갈래가 바로 열려요.</div></div>'));
        return say(URGENCY[answers._urg] || URGENCY.general);
      });
    } else {
      p = say('이럴 때가 오히려 사람이 봐야 하는 자리예요.').then(function () {
        return say('지금 접수해두시면 그 순서부터 잡아드릴게요.');
      });
    }
    p.then(function () { return showBadges(); }).then(function () { return bridgeToCTA(); });
  }

  function showBadges() {
    if (badgesShown) return Promise.resolve();
    badgesShown = true;
    return say('제가 이 일만 3년 봐왔는데요.').then(function () {
      node(el('<ul class="jk-badges">' +
        '<li>2,000개 이상 기업 정책자금 컨설팅</li>' +
        '<li>정부 정책자금 100억 이상 실행</li>' +
        '<li>기업인증 총 60건 이상 인증 완료</li>' +
        '<li class="jk-badges-sub">연간 200명 이상 대표님과 상담</li></ul>'));
    });
  }

  function bridgeToCTA() {
    say('여기까지가 방향이고요.').then(function () {
      return say('대표님 실제 숫자는 통화 5분이면 나와요.');
    }).then(function () {
      return say('이 부분들, 혼자 하시면 시간도 선정 확률도 떨어지거든요. 제가 3회는 무료로 같이 봐드릴게요.');
    }).then(function () {
      showQuick([
        { label:'무료 상담 신청할게요', value:'apply', strong:true },
        { label:'📞 통화로 바로 상담 ' + TEL, tel:true, href:'tel:' + TEL }
      ], function () { clearInput(); startHandoff(); }, { type:false });
    });
  }

  /* ── 4막: 핸드오프 ── */
  function defaultConsult() {
    picked.consult = {}; picked.consult[0] = true; picked.consult[1] = true; picked.consult[2] = true; // 정책자금·정부지원사업·기업인증
  }
  function startHandoff() {
    setProgress(0.82);
    defaultConsult();
    say('좋아요. 이대로 맞나 한 번만 봐주세요.').then(function () {
      renderConfirmCard();
    });
  }

  function renderConfirmCard() {
    // 기존 카드 제거(재렌더)
    var old = logEl.querySelector('.jk-card'); if (old) old.parentNode.removeChild(old);
    var rows = [
      ['업종', SECTOR_KO[answers.sector], 'sector'],
      ['직원', EMP_KO[answers.employees], 'employees'],
      ['매출', REV_FORM[answers.revenue], 'revenue'],
      ['사업자', BIZ_KO[answers.bizType], 'bizType']
    ];
    var rowsHtml = rows.map(function (r) {
      return '<div class="jk-card-row"><span class="k">' + r[0] + '</span><span class="v">' + esc(r[1] || '-') +
        '<button class="jk-edit" data-edit="' + r[2] + '">수정</button></span></div>';
    }).join('');
    // 지역칩
    var regHtml = '<div class="jk-card-row"><span class="k">지역</span><span class="v" id="jkRegionV">' +
      (answers.region ? esc(REGION_KO[answers.region]) : '<span style="color:#b23">선택해주세요</span>') + '</span></div>' +
      '<div class="jk-quick" style="margin-top:6px" id="jkRegionChips">' +
      [['seoul','서울'],['metro','경기·인천'],['other','그 외']].map(function (x) {
        return '<button type="button" class="jk-qbtn' + (answers.region === x[0] ? ' jk-strong' : ' jk-ghost') + '" data-region="' + x[0] + '">' + x[1] + '</button>';
      }).join('') + '</div>';
    // 상담유형 토글칩
    var consultHtml = '<div style="margin-top:9px;font-size:11px;font-weight:700;color:#7c8a86">상담 유형 (눌러서 켜고 끄기)</div>' +
      '<div class="jk-quick" style="margin-top:6px" id="jkConsultChips">' +
      CONSULT_LABELS.map(function (lbl, idx) {
        var on = !!picked.consult[idx];
        return '<button type="button" class="jk-qbtn' + (on ? ' jk-strong' : ' jk-ghost') + '" data-cidx="' + idx + '">' + esc(lbl) + '</button>';
      }).join('') + '</div>';
    var card = el('<div class="jk-card"><h4>이대로 접수할게요</h4>' + rowsHtml + regHtml + consultHtml + '</div>');
    node(card);
    // 이벤트
    card.querySelectorAll('[data-edit]').forEach(function (b) { b.onclick = function () { editField(b.getAttribute('data-edit')); }; });
    card.querySelectorAll('[data-region]').forEach(function (b) { b.onclick = function () {
      answers.region = b.getAttribute('data-region'); renderConfirmCard(); maybeShowContact();
    }; });
    card.querySelectorAll('[data-cidx]').forEach(function (b) { b.onclick = function () {
      var idx = +b.getAttribute('data-cidx'); if (picked.consult[idx]) delete picked.consult[idx]; else picked.consult[idx] = true;
      b.classList.toggle('jk-strong'); b.classList.toggle('jk-ghost');
    }; });
    // 고래 제안(자동 아님)
    if (answers._whale && !answers._whaleSuggested) {
      answers._whaleSuggested = true;
      say('매출 구간 보니, 재무·절세랑 법인 쪽도 같이 봐드릴까요?').then(function () {
        showQuick([
          { label:'네, 그것도 봐주세요', value:'yes', strong:true },
          { label:'일단 자금부터요', value:'no', ghost:true }
        ], function (v) { if (v === 'yes') { picked.consult[4] = true; picked.consult[3] = true; renderConfirmCard(); } clearInput(); maybeShowContact(); }, { type:false });
      });
    } else {
      maybeShowContact();
    }
  }

  function editField(id) {
    var s = null; for (var i = 0; i < STEPS.length; i++) if (STEPS[i].id === id) s = STEPS[i];
    if (!s) return;
    say(s.q).then(function () {
      showQuick(s.opts, function (v) { userSay(labelOf(s, v)); answers[id] = v; clearInput(); renderConfirmCard(); }, { type:false });
    });
  }

  function maybeShowContact() {
    if (!answers.region) { return; } // 지역 미선택 시 대기
    if (document.getElementById('jkMini')) return; // 이미 노출
    // 안심 문구 선행
    say('번호는 제가 직접 연락드릴 때만 써요. 무료고, 상담 목적 외엔 안 씁니다.').then(function () {
      return say('처리방침은 <a href="' + PRIVACY + '" target="_blank" rel="noopener">여기</a>서 보실 수 있어요.');
    }).then(function () {
      return say('연락처만 남겨주세요. 그다음부턴 제가 직접 봅니다.');
    }).then(function () {
      renderMiniForm();
    });
  }

  function renderMiniForm() {
    clearInput();
    var box = el('<div id="jkMini">' +
      '<div class="jk-mini-lbl">연락처 (필수)</div>' +
      '<div class="jk-typebar"><input id="jkTel" type="tel" inputmode="tel" autocomplete="tel" placeholder="010-0000-0000"></div>' +
      '<div class="jk-mini-lbl" style="margin-top:10px">성함 (선택)</div>' +
      '<div class="jk-typebar"><input id="jkName" type="text" autocomplete="name" placeholder="대표님"></div>' +
      '<div class="jk-quick" style="margin-top:12px">' +
      '<button type="button" class="jk-qbtn jk-strong" id="jkSubmit" style="flex:1">무료 상담 신청 완료</button>' +
      '</div>' +
      '<div class="jk-quick" style="margin-top:7px">' +
      '<button type="button" class="jk-qbtn jk-tel" id="jkTel2" style="flex:1">📞 통화로 바로 상담 ' + TEL + '</button>' +
      '</div>' +
      '<div class="jk-back" id="jkErr" style="color:#c0392b;display:none;margin-top:8px"></div>' +
      '</div>');
    inputEl.appendChild(box);
    var telI = box.querySelector('#jkTel'), nameI = box.querySelector('#jkName');
    box.querySelector('#jkTel2').onclick = function () { window.location.href = 'tel:' + TEL; };
    box.querySelector('#jkSubmit').onclick = function () {
      contact.tel = telI.value.trim(); contact.name = nameI.value.trim();
      submitConsult(box.querySelector('#jkErr'));
    };
    if (!reduce) { try { telI.focus(); } catch (e) {} }
  }

  function buildHidden() {
    var consultKo = Object.keys(picked.consult).map(function (i) { return CONSULT_LABELS[i]; });
    var parts = ['[챗봇진단]',
      '업종:' + (SECTOR_KO[answers.sector] || ''),
      '직원:' + (EMP_FORM[answers.employees] || ''),
      '매출:' + (REV_FORM[answers.revenue] || ''),
      '사업자:' + (BIZ_KO[answers.bizType] || ''),
      '업력:' + (AGE_KO[answers.businessAge] || ''),
      '관심:' + consultKo.join(','),
      '어려움:' + (answers._def || []).join(',')];
    return parts.join(' · ');
  }

  function submitConsult(errEl) {
    if (submitted) return;
    if (!contact.tel) {
      if (errEl) { errEl.style.display = 'block'; errEl.textContent = '연락처만 입력해주시면 바로 접수돼요.'; }
      return;
    }
    if (!apForm) { window.location.href = 'tel:' + TEL; return; }
    // 셀렉트 프리필 (실제 option value)
    var set = function (name, val) { var e = F(name); if (e && val != null) e.value = val; };
    set('entry.328779733', SECTOR_FORM[answers.sector]);
    set('entry.2056091753', EMP_FORM[answers.employees]);
    set('entry.1322791980', REV_FORM[answers.revenue]);
    set('entry.518507044', BIZ_FORM[answers.bizType]);
    set('entry.2062142960', REGION_FORM[answers.region]);
    if (TAX_FORM[answers.limitation]) set('entry.1949056294', TAX_FORM[answers.limitation]);
    // 텍스트
    set('entry.8982561', contact.tel);
    set('entry.195368683', contact.name || '대표님');
    set('entry.806238115', contact.company || '(상담 시 확인)');
    // 상담유형 — 인덱스로만 .checked (value 미읽기)
    var boxes = apForm.querySelectorAll('input[name="entry.1210990703"]');
    Object.keys(picked.consult).forEach(function (i) { if (boxes[i]) boxes[i].checked = true; });
    if (!Object.keys(picked.consult).length && boxes[0]) boxes[0].checked = true;
    // hidden (?code 보존 + 진단요약)
    var hid = F('entry.1340519393'); if (hid) hid.value = (hid.value ? hid.value + ' | ' : '') + buildHidden();
    // 동의 + 단일 소유권 제출
    if (apAgree) apAgree.checked = true;
    window.__chatDriven = true; submitted = true;
    setProgress(1);
    try { apForm.requestSubmit ? apForm.requestSubmit() : apForm.submit(); } catch (e) { try { apForm.submit(); } catch (_) {} }
    // 타임아웃 폴백
    clearInput();
    say('접수 중이에요…', 0);
    var t = setTimeout(function () {
      say('혹시 접수가 늦으면, ' + TEL + '로 바로 전화 주셔도 돼요.');
    }, 8000);
    window.__jkOkTimer = t;
  }

  function onSubmitOk() {
    if (window.__jkOkTimer) { clearTimeout(window.__jkOkTimer); window.__jkOkTimer = null; }
    say('접수됐습니다, 대표님. 이제부턴 제가 직접 봐요.', 300).then(function () {
      return say('하루 이틀 안에 제가 연락드릴게요.');
    }).then(function () {
      clearInput();
      inputEl.appendChild(el('<div class="jk-back"><button type="button">닫기</button></div>'));
      inputEl.querySelector('button').onclick = closePanel;
    });
  }

  /* ── 자유 텍스트 디플렉션(옵션 A · 로컬) ── */
  function handleFreeText(text) {
    userSay(text);
    var t = text.replace(/\s/g, '');
    // 절차 FAQ 직답
    if (/무료|공짜|비용|얼마|가격/.test(t)) { say('네, 상담은 무료예요. 부담 없이 남겨주세요.').then(afterDeflect); return; }
    if (/시간|얼마나걸|소요|오래/.test(t)) { say('통화는 5분이면 방향 나와요.').then(afterDeflect); return; }
    if (/언제|연락|전화올|콜/.test(t)) { say('제가 하루 이틀 안에 직접 연락드려요.').then(afterDeflect); return; }
    if (/개인정보|정보저장|어디저장|보관/.test(t)) { say('구글폼·구글시트에 저장돼요. 처리방침은 <a href="' + PRIVACY + '" target="_blank" rel="noopener">여기</a>서 보실 수 있어요.').then(afterDeflect); return; }
    // how-to 흡수
    if (/어떻게|방법|작성법|절차|서류|준비물|필요서류/.test(t)) { say('그건 순서가 있어서 제가 직접 봐야 정확하거든요.').then(afterDeflect); return; }
    // 고의도(특정 지원금/기관/금액) — 자격확정 없이 계열로만
    say('그건 제가 직접 봐야 정확하게 짚어드릴 수 있어요.').then(function () {
      return say('지금 접수해두시면 그 건부터 챙길게요.');
    }).then(afterDeflect);
  }
  function afterDeflect() {
    showQuick([
      { label:'무료 상담 신청할게요', value:'apply', strong:true },
      { label:'📞 통화 ' + TEL, tel:true, href:'tel:' + TEL }
    ], function () { clearInput(); startHandoff(); }, { type:false });
  }

  /* ── 시작 인사 ── */
  function startConversation() {
    if (logEl.children.length) return; // 이미 시작됨(재오픈)
    say('대표님, 혹시 작년에 받을 수 있던 자금, 그냥 넘기신 건 아니시겠죠?', reduce ? 0 : 500).then(function () {
      showQuick([
        { label:'짚어주세요', value:'go', strong:true },
        { label:'그냥 궁금한 게 있어요', value:'ask', ghost:true }
      ], function (v) {
        userSay(v === 'go' ? '짚어주세요' : '그냥 궁금한 게 있어요'); clearInput();
        if (v === 'ask') {
          say('정책자금은 예산 한정 선착순이라, 타이밍이 8할이거든요.').then(function () {
            showQuick([{ label:'그럼 정확히 짚어볼게요', value:'go', strong:true }], function () { clearInput(); introThenDiagnose(); }, { type:false });
          });
        } else { introThenDiagnose(); }
      }, { type:false });
    });
  }
  function introThenDiagnose() {
    say('복잡한 건 안 여쭤봐요. 톡톡 눌러만 주시면 지금 놓치는 갈래부터 짚어드릴게요.').then(runDiagnosis);
  }

  /* ── 패널 열기/닫기 ── */
  function openPanel() {
    if (teaserEl) teaserEl.hidden = true;
    launcher.hidden = true;
    if (!panel) buildPanel();
    panel.hidden = false;
    if (!reduce) { panel.classList.remove('jk-anim'); void panel.offsetWidth; panel.classList.add('jk-anim'); }
    startConversation();
  }
  function closePanel() {
    if (panel) panel.hidden = true;
    launcher.hidden = false;
    // 이탈 소프트 인터셉트(1회, 진행 중이고 미제출)
    if (!submitted && !exitIntercepted && logEl && logEl.children.length > 4) {
      exitIntercepted = true;
      if (teaserEl) { teaserEl.hidden = false; teaserEl.querySelector('.jk-teaser-txt').innerHTML = '여기까지 갈래가 보이기 시작했어요.<br>결과 보고 가실래요?'; }
    }
  }

  function buildPanel() {
    panel = el('<div class="jk-panel" role="dialog" aria-label="AI챗봇 상담" hidden>' +
      '<div class="jk-head">' +
      '<div class="jk-head-logo"><img src="' + LOGO + '" alt=""></div>' +
      '<div class="jk-head-name"><b>AI챗봇</b><span>온라인 상담</span></div>' +
      '<button class="jk-head-btn" id="jkMin" aria-label="최소화">–</button>' +
      '<button class="jk-head-btn" id="jkClose" aria-label="닫기">×</button>' +
      '</div>' +
      '<div class="jk-progress"><div class="jk-progress-fill"></div></div>' +
      '<div class="jk-log" aria-live="polite"></div>' +
      '<div class="jk-input"></div></div>');
    document.body.appendChild(panel);
    logEl = panel.querySelector('.jk-log');
    inputEl = panel.querySelector('.jk-input');
    progFill = panel.querySelector('.jk-progress-fill');
    panel.querySelector('#jkClose').onclick = closePanel;
    panel.querySelector('#jkMin').onclick = closePanel;
  }

  /* ── 런처 + 티저 ── */
  function buildLauncher() {
    launcher = el('<button class="jk-launcher" aria-label="AI챗봇 상담 열기">' +
      '<span class="jk-launcher-logo"><img src="' + LOGO + '" alt=""></span>' +
      '<span class="jk-launcher-label"><b>AI챗봇</b><span>무엇이든 물어보세요</span></span>' +
      '</button>');
    var seen = false; try { seen = localStorage.getItem('jk_seen') === '1'; } catch (e) {}
    if (!seen) launcher.appendChild(el('<span class="jk-launcher-dot"><span class="jk-sr">읽지 않은 메시지 1개</span></span>'));
    launcher.onclick = function () { try { localStorage.setItem('jk_seen', '1'); } catch (e) {} var d = launcher.querySelector('.jk-launcher-dot'); if (d) d.remove(); openPanel(); };
    document.body.appendChild(launcher);
    if (!reduce) { launcher.classList.add('jk-anim'); }

    // 티저(스크롤 40%에서 1회)
    teaserEl = el('<div class="jk-teaser" hidden><button class="jk-teaser-x" aria-label="닫기">×</button>' +
      '<div class="jk-teaser-txt">대표님, 아는 사람만 <b>매번</b> 조용히 챙겨가는 자금이 있거든요.<br>질문 몇 개만 눌러보시면 지금 놓치는 갈래부터 짚어드릴게요 →</div></div>');
    document.body.appendChild(teaserEl);
    teaserEl.querySelector('.jk-teaser-x').onclick = function (e) { e.stopPropagation(); teaserEl.hidden = true; };
    teaserEl.onclick = function () { openPanel(); };
    var teased = false;
    try { teased = sessionStorage.getItem('jk_teased') === '1'; } catch (e) {}
    if (!teased) {
      var onScroll = function () {
        if (window.scrollY > (window.innerHeight * 0.4) && launcher && !launcher.hidden) {
          teaserEl.hidden = false; try { sessionStorage.setItem('jk_teased', '1'); } catch (e) {}
          window.removeEventListener('scroll', onScroll);
          setTimeout(function () { if (teaserEl && !panel) teaserEl.hidden = true; }, 9000);
        }
      };
      window.addEventListener('scroll', onScroll, { passive: true });
    }
  }

  /* ── 초기화 ── */
  function init() {
    if (!apForm) return; // 폼 없으면 챗봇 미탑재(안전)
    document.addEventListener(AP_OK_EVENT, onSubmitOk);
    buildLauncher();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
