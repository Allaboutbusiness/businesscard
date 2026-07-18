/* ─────────────────────────────────────────────────────────────────────────
 * chatbot.js — AI챗봇 (실제 상담 화법 반영 · 관심사 선택형 · 전문가 상담 유도)
 * 화법: 대표님 호칭·저희 낮춤 · ~거든요/~더라고요/~하시면 돼요 · 반론 뒤집기
 *       · 헤지(100%는 없다) · 익명 사례 · 이모지 없음 · 한 턴=한 말풍선(2~3문장).
 * ★공개 금지선: 심사지위로 유리함 암시·내부 수익구조·특정 고객/브랜드·정식 정책명/요율/상한
 *   ·허위 외관 노출 금지. Type B 방향·헤지된 표현까지만.
 * 핸드오프: #apply 구글폼에 실제 option value/.checked 프리필 + 단일소유권 제출(검증됨).
 * ──────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  if (window.__jkChatInit) return; window.__jkChatInit = true;

  var AP_OK_EVENT = 'apSubmitOk';
  var LOGO = '/logogo.png?v=20260718d';
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
  var REGION_FORM = { seoul:'서울', metro:'경기·인천', other:'그 외 지역' };
  var REGION_KO   = { seoul:'서울', metro:'경기·인천', other:'그 외' };
  // 상담유형 체크박스 인덱스(#apply 순서 고정) — .value는 절대 읽지 않음
  var CONSULT_LABELS = ['정책자금', '정부지원사업', '기업 인증', '법인전환·법률·노무', '재무·절세', '복지몰·사내근로복지기금', '컨설팅 협업'];

  /* ── 상태 ── */
  var answers = {};
  var picked = { consult: {} };
  var contact = { tel:'', name:'', company:'' };
  var submitted = false, exitIntercepted = false;

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
      var d = reduce ? 0 : (delay == null ? 380 : delay);
      var t = typingNode(); logEl.appendChild(t); scrollDown();
      setTimeout(function () {
        logEl.removeChild(t);
        logEl.appendChild(el('<div class="jk-row jk-bot"><div class="jk-ava"><img src="' + LOGO + '" alt=""></div>' +
          '<div class="jk-msg">' + html + '</div></div>'));
        scrollDown(); resolve();
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
  function setProgress(p) { if (progFill) progFill.style.width = Math.round(Math.max(0, Math.min(1, p)) * 100) + '%'; }

  function clearInput() { inputEl.innerHTML = ''; }
  function showQuick(options, onPick, opts) {
    opts = opts || {}; clearInput();
    var wrap = el('<div class="jk-quick"></div>');
    options.forEach(function (o) {
      var b = el('<button type="button" class="jk-qbtn' + (o.strong ? ' jk-strong' : '') + (o.ghost ? ' jk-ghost' : '') + (o.tel ? ' jk-tel' : '') + '">' + esc(o.label) + '</button>');
      if (o.href) b.onclick = function () { window.location.href = o.href; };
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
    var t = el('<div class="jk-typetoggle"><button type="button">직접 입력하기</button></div>');
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

  /* ── 접수용 확인 스텝(핸드오프 qualify에서만 사용) ── */
  var STEPS = [
    { id:'sector', q:'먼저 대표님 사업은 어느 쪽에 가까우세요?', opts:[
      {label:'제조·가공', value:'mfg'},{label:'도소매', value:'retail'},{label:'IT·SW', value:'it'},
      {label:'서비스', value:'svc'},{label:'건설', value:'con'},{label:'기타', value:'etc'}] },
    { id:'bizType', q:'지금 개인사업자세요, 법인이세요?', opts:[
      {label:'개인사업자', value:'indiv'},{label:'법인사업자', value:'corp'},{label:'예비·준비중', value:'pre'}] },
    { id:'revenue', q:'올해 예상 매출은 어느 구간이세요?', opts:[
      {label:'3억 미만', value:'r3'},{label:'3~10억', value:'r310'},{label:'10~30억', value:'r1030'},{label:'30~80억', value:'r3080'},{label:'80억 이상', value:'r80p'}] },
    { id:'employees', q:'직원은 몇 분이세요? 대표님 빼고요.', opts:[
      {label:'나 혼자', value:'one'},{label:'2~4명', value:'two4'},{label:'5~9명', value:'five9'},{label:'10~49명', value:'ten49'},{label:'50명 이상', value:'fifty'}] }
  ];
  function labelOf(step, value) {
    for (var i = 0; i < step.opts.length; i++) if (step.opts[i].value === value) return step.opts[i].label;
    return value;
  }
  function runSteps(list, onDone, pFrom, pTo) {
    pFrom = pFrom || 0; pTo = pTo || 0;
    var i = 0, marks = [];
    function step() {
      if (i >= list.length) return onDone();
      var s = list[i]; marks[i] = logMark();
      say(s.q).then(function () {
        showQuick(s.opts, function (v) {
          userSay(labelOf(s, v)); answers[s.id] = v;
          if (pTo > pFrom) setProgress(pFrom + ((i + 1) / list.length) * (pTo - pFrom));
          clearInput(); i++; step();
        }, { back: i > 0 ? function () { i--; logTruncate(marks[i]); step(); } : null });
      });
    }
    step();
  }

  /* ── 관심사 분기 (녹취 화법 반영 · Type B 안전판) ── */
  // 업력 질문(공통) — 관심사 선택 후 먼저 물어봄
  var AGE_STEP = { id:'businessAge', q:'먼저, 사업 시작하신 지는 얼마나 되셨어요?', opts:[
    {label:'예비창업 (아직 전)', value:'pre'},{label:'1년 미만', value:'lt1'},{label:'1~3년', value:'y13'},{label:'3~7년', value:'y37'},{label:'7년 이상', value:'y7p'}] };
  // 업력별 맞춤 한 마디(주제 무관 · 앞에 붙임)
  var AGE_HOOK = {
    pre:'이제 막 시작 단계시면, 처음 세팅을 어떻게 잡느냐가 나중을 다 좌우하거든요.',
    lt1:'1년 차시면 지금부터 준비하는 게 딱 좋은 시기예요.',
    y13:'3년 언더는 사실 선택지가 제일 넓은 구간이거든요.',
    y37:'이 시기부터는 초기 혜택은 슬슬 닫히는 대신, 성장 단계에 맞는 게 열려요.',
    y7p:'업력이 이 정도 쌓이시면, 볼 수 있는 폭이 또 달라지거든요.' };
  // 관심사별: 어떤 업무를 어떤 전문가가 어떻게(역할만, 실명 없음)
  var INTERESTS = {
    policy:   { label:'정책자금', consult:[0], expert:'정책자금은 경영지도사가 재무제표를 정밀 진단해서, 신청부터 심사 대응, 받은 뒤 운영관리까지 밀착으로 봐드려요.' },
    support:  { label:'정부지원사업', consult:[1], expert:'지원사업은 행정사가 인증·R&D 지원금 조달을 맡고, 필요하면 변리사가 특허·IP까지 같이 잡아드려요.' },
    invest:   { label:'투자 유치·연계', consult:[0,1], expert:'투자는 현직 AC 대표가 성장 단계에 맞는 전략·유치부터 정부지원 연계까지 직접 봐드려요.' },
    tax:      { label:'절세·상속·증여', consult:[4], expert:'세금 쪽은 회계사랑 변호사·세무사가 세무기장·조세·상속까지 원스톱으로 풀어드려요.' },
    corp:     { label:'법인전환·노무·법률', consult:[3], expert:'법인 쪽은 변호사·세무사가 전환·정관·등기·세무까지 한 번에 진단해드려요.' },
    diagnose: { label:'뭘 받을 수 있는지 모르겠어요', consult:[0,1], expert:'이런 건 경영지도사·회계사·변리사·변호사가 한 팀으로 붙어서, 지금 되는 것과 준비할 것을 나눠드려요.' }
  };

  /* ── 시작 인사 + 관심사 선택 ── */
  function startConversation() {
    if (logEl.children.length) return;
    say('안녕하세요, 대표님. 어떤 게 제일 궁금하세요? 눌러서 골라주시면 바로 짚어드릴게요.', reduce ? 0 : 450).then(showInterestMenu);
  }
  function showInterestMenu() {
    var order = ['policy', 'support', 'invest', 'tax', 'corp', 'diagnose'];
    showQuick(order.map(function (k) { return { label: INTERESTS[k].label, value: k, strong: k === 'policy', ghost: k === 'diagnose' }; }),
      function (v, o) { userSay(o.label); clearInput(); setProgress(0.2); runInterest(v); });
  }
  function runInterest(id) {
    var it = INTERESTS[id]; if (!it) return;
    answers._interest = id;
    // 1) 업력 먼저 물어봄
    say(AGE_STEP.q).then(function () {
      showQuick(AGE_STEP.opts, function (v, o) {
        userSay(o.label); answers.businessAge = v; clearInput(); setProgress(0.42);
        // 2) 업력에 맞는, 필요할 것 같은 상담 내용 알려줌
        say(AGE_HOOK[v] + ' ' + it.expert).then(function () {
          // 3) 이 내용으로 상담받을지 물어봄
          return say('이 내용으로 전문가 상담 한번 받아보실래요?');
        }).then(function () {
          showQuick([
            { label:'네, 받아볼게요', value:'go', strong:true },
            { label:'통화로 바로 상담 ' + TEL, tel:true, href:'tel:' + TEL },
            { label:'좀 더 볼게요', value:'more', ghost:true }
          ], function (cv) {
            clearInput();
            // 4) 상담으로 연결
            if (cv === 'more') say('네, 편하게 더 둘러보세요.').then(showInterestMenu);
            else startHandoff(it.consult);
          }, { type:false });
        });
      });
    });
  }

  /* ── 4막: 핸드오프 ── */
  var QUALIFY_IDS = ['sector', 'bizType', 'revenue', 'employees'];
  function startHandoff(consultIndices) {
    picked.consult = {};
    (consultIndices || [0]).forEach(function (idx) { picked.consult[idx] = true; });
    var need = QUALIFY_IDS.filter(function (id) { return !answers[id]; })
      .map(function (id) { for (var i = 0; i < STEPS.length; i++) if (STEPS[i].id === id) return STEPS[i]; }).filter(Boolean);
    var toCard = function () { setProgress(0.82); say('이대로 접수할게요. 한 번만 확인해 주세요.').then(renderConfirmCard); };
    if (!need.length) return toCard();
    say('전문가 상담 연결 전에 딱 몇 가지만 확인할게요.').then(function () { runSteps(need, toCard, 0.55, 0.8); });
  }

  function renderConfirmCard() {
    var old = logEl.querySelector('.jk-card'); if (old) old.parentNode.removeChild(old);
    var rows = [['업종', SECTOR_KO[answers.sector], 'sector'], ['직원', EMP_KO[answers.employees], 'employees'],
      ['매출', REV_FORM[answers.revenue], 'revenue'], ['사업자', BIZ_KO[answers.bizType], 'bizType']];
    var rowsHtml = rows.map(function (r) {
      return '<div class="jk-card-row"><span class="k">' + r[0] + '</span><span class="v">' + esc(r[1] || '-') +
        '<button class="jk-edit" data-edit="' + r[2] + '">수정</button></span></div>';
    }).join('');
    var regHtml = '<div class="jk-card-row"><span class="k">지역</span><span class="v" id="jkRegionV">' +
      (answers.region ? esc(REGION_KO[answers.region]) : '<span class="jk-need">선택해주세요</span>') + '</span></div>' +
      '<div class="jk-quick jk-cardchips" id="jkRegionChips">' +
      [['seoul','서울'],['metro','경기·인천'],['other','그 외']].map(function (x) {
        return '<button type="button" class="jk-qbtn' + (answers.region === x[0] ? ' jk-strong' : ' jk-ghost') + '" data-region="' + x[0] + '">' + x[1] + '</button>';
      }).join('') + '</div>';
    var consultHtml = '<div class="jk-card-lbl">상담 유형 <span>눌러서 켜고 끄기</span></div>' +
      '<div class="jk-quick jk-cardchips" id="jkConsultChips">' +
      CONSULT_LABELS.map(function (lbl, idx) {
        return '<button type="button" class="jk-qbtn' + (picked.consult[idx] ? ' jk-strong' : ' jk-ghost') + '" data-cidx="' + idx + '">' + esc(lbl) + '</button>';
      }).join('') + '</div>';
    var card = el('<div class="jk-card"><h4>접수 정보</h4>' + rowsHtml + regHtml + consultHtml + '</div>');
    node(card);
    card.querySelectorAll('[data-edit]').forEach(function (b) { b.onclick = function () { editField(b.getAttribute('data-edit')); }; });
    card.querySelectorAll('[data-region]').forEach(function (b) { b.onclick = function () { answers.region = b.getAttribute('data-region'); renderConfirmCard(); maybeShowContact(); }; });
    card.querySelectorAll('[data-cidx]').forEach(function (b) { b.onclick = function () {
      var idx = +b.getAttribute('data-cidx'); if (picked.consult[idx]) delete picked.consult[idx]; else picked.consult[idx] = true;
      b.classList.toggle('jk-strong'); b.classList.toggle('jk-ghost');
    }; });
    maybeShowContact();
  }
  function editField(id) {
    var s = null; for (var i = 0; i < STEPS.length; i++) if (STEPS[i].id === id) s = STEPS[i];
    if (!s) return;
    say(s.q).then(function () {
      showQuick(s.opts, function (v) { userSay(labelOf(s, v)); answers[id] = v; clearInput(); renderConfirmCard(); }, { type:false });
    });
  }
  function maybeShowContact() {
    if (!answers.region) return;
    if (document.getElementById('jkMini')) return;
    say('연락처만 남겨주시면 담당 전문가가 직접 보고 하루 이틀 안에 연락드려요. 무료고, 상담 목적 외엔 안 써요. (<a href="' + PRIVACY + '" target="_blank" rel="noopener">처리방침</a>)')
      .then(renderMiniForm);
  }
  function renderMiniForm() {
    clearInput();
    var box = el('<div id="jkMini">' +
      '<div class="jk-mini-lbl">연락처 (필수)</div>' +
      '<div class="jk-typebar"><input id="jkTel" type="tel" inputmode="tel" autocomplete="tel" placeholder="010-0000-0000"></div>' +
      '<div class="jk-mini-lbl">성함 (선택)</div>' +
      '<div class="jk-typebar"><input id="jkName" type="text" autocomplete="name" placeholder="대표님"></div>' +
      '<div class="jk-quick"><button type="button" class="jk-qbtn jk-strong jk-full" id="jkSubmit">무료 상담 신청</button></div>' +
      '<div class="jk-quick"><button type="button" class="jk-qbtn jk-tel jk-full" id="jkTel2">통화로 바로 상담 ' + TEL + '</button></div>' +
      '<div class="jk-err" id="jkErr"></div></div>');
    inputEl.appendChild(box);
    var telI = box.querySelector('#jkTel'), nameI = box.querySelector('#jkName');
    box.querySelector('#jkTel2').onclick = function () { window.location.href = 'tel:' + TEL; };
    box.querySelector('#jkSubmit').onclick = function () { contact.tel = telI.value.trim(); contact.name = nameI.value.trim(); submitConsult(box.querySelector('#jkErr')); };
    if (!reduce) { try { telI.focus(); } catch (e) {} }
  }

  function buildHidden() {
    var consultKo = Object.keys(picked.consult).map(function (i) { return CONSULT_LABELS[i]; });
    var it = answers._interest && INTERESTS[answers._interest];
    return ['[챗봇]', '문의:' + (it ? it.label : '진단'),
      '업력:' + (answers.businessAge ? labelOf(AGE_STEP, answers.businessAge) : ''),
      '업종:' + (SECTOR_KO[answers.sector] || ''), '직원:' + (EMP_FORM[answers.employees] || ''),
      '매출:' + (REV_FORM[answers.revenue] || ''), '사업자:' + (BIZ_KO[answers.bizType] || ''),
      '관심:' + consultKo.join(',')].join(' · ');
  }
  function submitConsult(errEl) {
    if (submitted) return;
    if (!contact.tel) { if (errEl) { errEl.style.display = 'block'; errEl.textContent = '연락처만 입력해주시면 바로 접수돼요.'; } return; }
    if (!apForm) { window.location.href = 'tel:' + TEL; return; }
    var set = function (name, val) { var e = F(name); if (e && val != null) e.value = val; };
    set('entry.328779733', SECTOR_FORM[answers.sector]);
    set('entry.2056091753', EMP_FORM[answers.employees]);
    set('entry.1322791980', REV_FORM[answers.revenue]);
    set('entry.518507044', BIZ_FORM[answers.bizType]);
    set('entry.2062142960', REGION_FORM[answers.region]);
    set('entry.8982561', contact.tel);
    set('entry.195368683', contact.name || '대표님');
    set('entry.806238115', contact.company || '(상담 시 확인)');
    var boxes = apForm.querySelectorAll('input[name="entry.1210990703"]');
    Object.keys(picked.consult).forEach(function (i) { if (boxes[i]) boxes[i].checked = true; });
    if (!Object.keys(picked.consult).length && boxes[0]) boxes[0].checked = true;
    var hid = F('entry.1340519393'); if (hid) hid.value = (hid.value ? hid.value + ' | ' : '') + buildHidden();
    if (apAgree) apAgree.checked = true;
    window.__chatDriven = true; submitted = true; setProgress(1);
    try { apForm.requestSubmit ? apForm.requestSubmit() : apForm.submit(); } catch (e) { try { apForm.submit(); } catch (_) {} }
    clearInput(); say('접수 중이에요.', 0);
    window.__jkOkTimer = setTimeout(function () { say('혹시 접수가 늦으면 ' + TEL + '로 바로 전화 주셔도 돼요.'); }, 8000);
  }
  function onSubmitOk() {
    if (window.__jkOkTimer) { clearTimeout(window.__jkOkTimer); window.__jkOkTimer = null; }
    say('접수됐습니다, 대표님. 담당 전문가가 보고 하루 이틀 안에 연락드릴게요.', 300).then(function () {
      clearInput();
      inputEl.appendChild(el('<div class="jk-back"><button type="button">닫기</button></div>'));
      inputEl.querySelector('button').onclick = closePanel;
    });
  }

  /* ── 자유 텍스트(로컬 규칙 · Type A 미노출) ── */
  function handleFreeText(text) {
    userSay(text);
    var t = text.replace(/\s/g, '');
    if (/무료|공짜|비용|얼마|가격/.test(t)) return say('상담은 무료예요. 부담 없이 남겨주시면 돼요.').then(afterDeflect);
    if (/시간|얼마나걸|소요|오래/.test(t)) return say('통화 5분이면 방향은 나와요.').then(afterDeflect);
    if (/언제|연락|전화올|콜/.test(t)) return say('담당 전문가가 하루 이틀 안에 연락드려요.').then(afterDeflect);
    if (/개인정보|정보저장|어디저장|보관/.test(t)) return say('구글폼·구글시트에 저장돼요. 자세한 건 <a href="' + PRIVACY + '" target="_blank" rel="noopener">처리방침</a>에서 보시면 돼요.').then(afterDeflect);
    if (/어떻게|방법|작성법|절차|서류|준비물|필요서류/.test(t)) return say('그건 순서가 있어서, 담당 전문가가 서류 보고 짚어드려야 정확하거든요.').then(afterDeflect);
    say('그건 대표님 상황부터 봐야 정확하게 짚어드릴 수 있어요. 지금 접수해두시면 담당 전문가가 그 건부터 챙겨드려요.').then(afterDeflect);
  }
  function afterDeflect() {
    showQuick([{ label:'무료 상담 신청', value:'apply', strong:true }, { label:'통화 ' + TEL, tel:true, href:'tel:' + TEL }],
      function () { clearInput(); startHandoff([0, 1]); }, { type:false });
  }

  /* ── 패널/런처 ── */
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
    if (!submitted && !exitIntercepted && logEl && logEl.children.length > 4) {
      exitIntercepted = true;
      if (teaserEl) { teaserEl.hidden = false; teaserEl.querySelector('.jk-teaser-txt').textContent = '여기까지 보셨는데, 방향만 잡고 가실래요?'; }
    }
  }
  function buildPanel() {
    panel = el('<div class="jk-panel" role="dialog" aria-label="AI챗봇 상담" hidden>' +
      '<div class="jk-head"><div class="jk-head-logo"><img src="' + LOGO + '" alt=""></div>' +
      '<div class="jk-head-name"><b>AI챗봇</b><span>온라인 상담</span></div>' +
      '<button class="jk-head-btn" id="jkMin" aria-label="최소화">–</button>' +
      '<button class="jk-head-btn" id="jkClose" aria-label="닫기">×</button></div>' +
      '<div class="jk-progress"><div class="jk-progress-fill"></div></div>' +
      '<div class="jk-log" aria-live="polite"></div><div class="jk-input"></div></div>');
    document.body.appendChild(panel);
    logEl = panel.querySelector('.jk-log'); inputEl = panel.querySelector('.jk-input'); progFill = panel.querySelector('.jk-progress-fill');
    panel.querySelector('#jkClose').onclick = closePanel;
    panel.querySelector('#jkMin').onclick = closePanel;
  }
  function buildLauncher() {
    launcher = el('<button class="jk-launcher" aria-label="AI챗봇 상담 열기">' +
      '<span class="jk-launcher-logo"><img src="' + LOGO + '" alt=""></span>' +
      '<span class="jk-launcher-label"><b>AI챗봇</b><span>무엇이든 물어보세요</span></span></button>');
    var seen = false; try { seen = localStorage.getItem('jk_seen') === '1'; } catch (e) {}
    if (!seen) launcher.appendChild(el('<span class="jk-launcher-dot"><span class="jk-sr">읽지 않은 메시지 1개</span></span>'));
    launcher.onclick = function () { try { localStorage.setItem('jk_seen', '1'); } catch (e) {} var d = launcher.querySelector('.jk-launcher-dot'); if (d) d.remove(); openPanel(); };
    document.body.appendChild(launcher);
    if (!reduce) launcher.classList.add('jk-anim');

    teaserEl = el('<div class="jk-teaser" hidden><button class="jk-teaser-x" aria-label="닫기">×</button>' +
      '<div class="jk-teaser-txt">대표님, 지금 놓치는 자금·지원 있는지 눌러서 확인해 보세요.</div></div>');
    document.body.appendChild(teaserEl);
    teaserEl.querySelector('.jk-teaser-x').onclick = function (e) { e.stopPropagation(); teaserEl.hidden = true; };
    teaserEl.onclick = function () { openPanel(); };
    var teased = false; try { teased = sessionStorage.getItem('jk_teased') === '1'; } catch (e) {}
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

  function init() {
    if (!apForm) return;
    document.addEventListener(AP_OK_EVENT, onSubmitOk);
    buildLauncher();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
