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
  // 업력 질문(공통 스텝) — 업력별 맞춤 정보(info)
  var AGE_HOOK = {
    pre:'이제 막 시작 단계시면, 처음 세팅을 어떻게 잡느냐가 나중을 다 좌우하거든요.',
    lt1:'1년 차시면 지금부터 준비하는 게 딱 좋은 시기예요. 초기 전용으로 열리는 게 꽤 있거든요.',
    y13:'3년 언더는 사실 선택지가 제일 넓은 구간이거든요. 창업 초기 지원이 지금 다 열려 있어요.',
    y37:'이 시기부턴 초기 혜택은 슬슬 닫히는 대신, 성장 자금이나 R&D·투자 연계 쪽이 열려요.',
    y7p:'업력이 이 정도 쌓이시면 자금 조달보다 절세·가업승계나 기업가치 쪽까지 같이 보는 게 실익이 커요.' };
  var AGE_STEP = { id:'businessAge', store:'businessAge', q:'먼저, 사업 시작하신 지는 얼마나 되셨어요?',
    opts:[{label:'예비창업 (아직 전)',value:'pre'},{label:'1년 미만',value:'lt1'},{label:'1~3년',value:'y13'},{label:'3~7년',value:'y37'},{label:'7년 이상',value:'y7p'}],
    info: AGE_HOOK };
  // 관심사별: intro(클릭1) → 업력(2) → q2(3) → q3(4) → summary+상담(5). 매 클릭 정보 제공, 역할만(실명 X).
  var INTERESTS = {
    policy: { label:'정책자금', consult:[0],
      intro:'정책자금은 크게 융자(대출)랑 보증으로 나뉘는데, 업력이랑 목적에 따라 받을 수 있는 게 확 달라져요.',
      steps:[ AGE_STEP,
        { q:'지금 자금은 어떤 쪽이 필요하세요?', opts:[{label:'운영자금 (돌아가는 돈)',value:'run'},{label:'공장·설비 투자',value:'fac'},{label:'기존 대출 갈아타기',value:'refi'}],
          info:{ run:'운영자금은 ‘경영지원자금’·‘스마트자금’ 계열이 열려 있어요. 매출이 적어도 조건만 맞추면 되는 경우가 많거든요.',
                 fac:'시설자금은 접근이 완전히 달라져요. 공장·설비면 한도가 크게 잡히는 대신 서류가 조금 더 붙어요.',
                 refi:'금리가 세게 나왔다면 더 낮은 정책자금으로 갈아탈 여지가 있어요. 주거래랑 조건만 보면 가능한지 금방 나오거든요.' } },
        { q:'혹시 세금 밀렸거나 대출 연체 이력, 있으세요?', opts:[{label:'없어요, 정상이에요',value:'none'},{label:'조금 있어요',value:'some'}],
          info:{ none:'정상이시면 보증 계열까지 같이 열려서 선택지가 더 넓어요.',
                 some:'그런 게 있어도 보는 자금이 따로 있어요. 순서만 잘 잡으면 되니 걱정 안 하셔도 돼요.' } } ],
      summary:'대표님 상황이면 방향은 대충 잡혔어요. 정확한 한도랑 금리는 경영지도사가 재무제표 보고 딱 짚어드리는데, 상담 한번 받아보실래요?' },
    support: { label:'정부지원사업', consult:[1],
      intro:'정부지원사업은 무상 지원금이랑 R&D, 바우처로 나뉘는데, 업력에 따라 열리는 게 완전히 달라요.',
      steps:[ AGE_STEP,
        { q:'어떤 지원이 제일 끌리세요?', opts:[{label:'무상 지원금 (창업)',value:'grant'},{label:'R&D·기술개발',value:'rd'},{label:'바우처 (마케팅·수출)',value:'vou'}],
          info:{ grant:'창업 단계면 ‘예창’·‘초창’·‘창도’ 라인이 있어요. 사업계획서 설계가 선정의 8할이거든요.',
                 rd:'R&D면 ‘디딤돌’·‘팁스(TIPS)’ 쪽인데, 특허나 연구소를 미리 세팅해두면 훨씬 수월해요.',
                 vou:'마케팅·수출이면 ‘수출지원금’·‘제조지원금’·‘AI지원금’ 바우처가 있어요. 비교적 손이 덜 가는 편이에요.' } },
        { q:'특허나 기업부설연구소, 혹시 갖고 계세요?', opts:[{label:'있어요',value:'have'},{label:'없어요',value:'none'},{label:'준비 중이에요',value:'prep'}],
          info:{ have:'그거 있으면 가점이 붙어서 선정률이 확 올라가요.',
                 none:'없어도 괜찮아요. 특허 하나 정도는 변리사가 금방 잡아드리거든요.',
                 prep:'준비 중이시면 타이밍만 잘 맞추면 돼요. 순서가 중요하거든요.' } } ],
      summary:'대표님이면 지금 준비할 게 뭔지 감이 잡혀요. 인증·R&D 조달은 행정사가, 특허는 변리사가 맡아드리는데, 상담 한번 받아보실래요?' },
    invest: { label:'투자 유치·연계', consult:[0,1],
      intro:'투자는 유치 자체보다 언제·어떻게 받느냐가 훨씬 중요해요. 잘못 받으면 오히려 발목 잡히거든요.',
      steps:[ AGE_STEP,
        { q:'투자는 어떤 상황이세요?', opts:[{label:'자금이 급해서 받아야 해요',value:'urgent'},{label:'미리 밸류만 잡아두고 싶어요',value:'value'},{label:'인증·실적용으로 필요해요',value:'cert'}],
          info:{ urgent:'솔직히 급할 때 받는 게 제일 불리해요. 급한 자금은 융자로 풀고, 투자는 여유 있을 때 받는 게 나아요.',
                 value:'밸류는 지금 시점에 딱 잡아두는 게 깔끔해요. 나중 라운드에 미루면 그때마다 흔들리거든요.',
                 cert:'인증·실적용이면 소액 투자로도 벤처인증 요건이 채워지는 길이 있어요. 개인 말고 조합·AC로 받는 게 안전하고요.' } },
        { q:'지금 주주 구성은 어떻게 되세요?', opts:[{label:'대표 혼자',value:'solo'},{label:'공동대표·가족',value:'fam'},{label:'외부 지분 있음',value:'ext'}],
          info:{ solo:'혼자면 깔끔해서 좋아요. 투자받을 때 협상이 제일 편하거든요.',
                 fam:'가족·공동이면 지분 정리를 미리 해두는 게 나중에 편해요. 볼륨 커지기 전에요.',
                 ext:'외부 지분이 있으면 나중에 큰 투자 들어올 때 걸리는 경우가 많아요. 지금 정리 방향을 잡아두는 게 좋아요.' } } ],
      summary:'대표님 단계면 지금 받을 때인지 받아두기만 할 때인지 판단이 서요. 이건 현직 AC 대표가 직접 봐드리는데, 상담 한번 받아보실래요?' },
    tax: { label:'절세·상속·증여', consult:[4],
      intro:'법인은 돈이 벌려도 통장이랑 서류가 따로 놀거든요. 이걸 미리 정리하느냐가 세금을 크게 가르죠.',
      steps:[ AGE_STEP,
        { q:'어떤 게 제일 고민이세요?', opts:[{label:'세금이 너무 많이 나가요',value:'heavy'},{label:'법인 돈을 개인으로',value:'per'},{label:'자녀에게 물려주기',value:'suc'}],
          info:{ heavy:'세금은 구조를 먼저 봐요. 매출 구간마다 아낄 수 있는 방식이 다르거든요.',
                 per:'법인 돈을 대표님 개인으로 넘기는 합법적인 순서가 있어요. 급여·배당·퇴직금을 어떻게 엮느냐로 갈리거든요.',
                 suc:'상속·증여는 미리 설계할수록 세금이 확 줄어요. 몇 년 앞서 준비하는 게 핵심이에요.' } },
        { q:'지금 법인이세요, 개인사업자세요?', opts:[{label:'법인',value:'corp'},{label:'개인사업자',value:'indiv'},{label:'둘 다 있어요',value:'both'}],
          info:{ corp:'법인이면 쌓이는 이익을 미리 빼두는 설계가 특히 중요해요.',
                 indiv:'개인이시면 법인 전환 타이밍부터 같이 보는 게 절세엔 더 유리할 수 있어요.',
                 both:'둘 다 있으면 나중에 합치는 그림까지 미리 그려두면 세금이 훨씬 줄어요.' } } ],
      summary:'대표님이면 어떤 순서로 푸는 게 유리한지 그림이 나와요. 이건 회계사랑 변호사·세무사가 원스톱으로 봐드리는데, 상담 한번 받아보실래요?' },
    corp: { label:'법인전환·노무·법률', consult:[3],
      intro:'기업은 만들 때가 제일 중요해요. 처음 세팅을 잘 해두면 나중에 고치는 비용이 안 들거든요.',
      steps:[ AGE_STEP,
        { q:'어느 상황에 가까우세요?', opts:[{label:'개인→법인 전환 고민',value:'conv'},{label:'새 법인 하나 더',value:'new'},{label:'정관·업종 손봐야 해요',value:'fix'}],
          info:{ conv:'법인 전환은 매출 구간마다 유불리가 갈려요. 너무 이르면 비용만 늘거든요.',
                 new:'새로 내실 거면 대표 구성이랑 지분부터 잡는 게 순서예요. 나중에 바꾸기 어렵거든요.',
                 fix:'이미 법인이면 정관·업종을 정부 과제 받기 좋게 미리 손보는 게 좋아요.' } },
        { q:'나중에 투자나 정부 R&D 받을 생각도 있으세요?', opts:[{label:'네, 계획 있어요',value:'yes'},{label:'아직 모르겠어요',value:'maybe'},{label:'아니요',value:'no'}],
          info:{ yes:'그럼 정관을 처음부터 그 요건에 맞게 짜야 돼요. 나중에 고치면 돈이 또 들거든요.',
                 maybe:'혹시 몰라도 정관은 여지를 열어두게 잡는 게 안전해요.',
                 no:'그래도 업종이랑 기본 세팅만 잘 잡아두면 나중이 편해요.' } } ],
      summary:'대표님이면 지금 어떻게 세팅할지 방향이 잡혀요. 전환·정관·등기·세무는 변호사·세무사가 한 번에 봐드리는데, 상담 한번 받아보실래요?' },
    diagnose: { label:'뭘 받을 수 있는지 모르겠어요', consult:[0,1],
      intro:'괜찮아요, 처음엔 다 그러세요. 몇 개만 눌러주시면 지금 되는 것부터 짚어드릴게요.',
      steps:[ AGE_STEP,
        { q:'사업은 어느 쪽에 가까우세요?', store:'sector', opts:[{label:'제조·가공',value:'mfg'},{label:'도소매',value:'retail'},{label:'IT·SW',value:'it'},{label:'서비스',value:'svc'},{label:'건설',value:'con'},{label:'기타',value:'etc'}],
          info:{ mfg:'제조는 사실 받을 게 제일 많은 업종이에요. 업종 분류만 잘 잡아도 열리는 게 늘어요.',
                 retail:'유통만 하시면 제조를 살짝 얹는 것만으로 지원이 확 늘어나는 경우가 많아요.',
                 it:'IT·기술 쪽은 기술·인증으로 열리는 지원이 따로 있어요.',
                 svc:'서비스업도 업종에 맞게 열리는 지원이 있어요.',
                 con:'건설은 세부 분야에 따라 갈리는데, 뿌리 쪽이면 열리는 게 많아요.',
                 etc:'우선 큰 틀부터 보면 방향이 잡혀요.' } },
        { q:'지금 제일 급한 건 어느 쪽이세요?', opts:[{label:'당장 자금이 급해요',value:'money'},{label:'세금·구조가 걱정돼요',value:'tax'},{label:'그냥 뭐가 있는지 궁금해요',value:'cur'}],
          info:{ money:'자금이 급하면 정책자금 융자부터 보는 게 빨라요. 조건만 맞으면 바로 나오거든요.',
                 tax:'세금·구조가 걱정이면 절세랑 법인 세팅부터 정리하는 게 실익이 커요.',
                 cur:'뭐가 있는지부터면, 업력이랑 업종만으로도 지금 되는 것과 준비할 것을 나눠드릴 수 있어요.' } } ],
      summary:'대표님 상황이면 지금 되는 것과 준비할 것이 갈려요. 경영지도사·회계사·변리사·변호사가 한 팀으로 붙어서 봐드리는데, 상담 한번 받아보실래요?' }
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
  // 클릭1(관심사) → intro 정보 → 스텝별(업력·q2·q3) 질문+정보 → 마지막 클릭에서 상담 유도
  function runInterest(id) {
    var it = INTERESTS[id]; if (!it) return;
    answers._interest = id;
    say(it.intro).then(function () { runInfoStep(it, 0); });
  }
  function runInfoStep(it, i) {
    if (i >= it.steps.length) {
      setProgress(0.68);
      say(it.summary).then(function () {
        showQuick([
          { label:'네, 받아볼게요', value:'go', strong:true },
          { label:'통화로 바로 상담 ' + TEL, tel:true, href:'tel:' + TEL },
          { label:'좀 더 볼게요', value:'more', ghost:true }
        ], function (cv) {
          clearInput();
          if (cv === 'more') say('네, 편하게 더 둘러보세요.').then(showInterestMenu);
          else startHandoff(it.consult);
        }, { type:false });
      });
      return;
    }
    var s = it.steps[i];
    say(s.q).then(function () {
      showQuick(s.opts, function (v, o) {
        userSay(o.label);
        if (s.store) answers[s.store] = v;
        clearInput(); setProgress(0.2 + (i + 1) * 0.13);
        var info = (s.info && (s.info[v] || s.info._)) || '';
        (info ? say(info) : Promise.resolve()).then(function () { runInfoStep(it, i + 1); });
      }, { back: i > 0 ? null : null });
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
    card.querySelectorAll('[data-region]').forEach(function (b) { b.onclick = function () { answers.region = b.getAttribute('data-region'); renderConfirmCard(); }; });
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

  // 대화 전체를 담당자용 대화록으로 — 접수 시 hidden 필드에 실려 구글시트로 전달
  function buildTranscript() {
    if (!logEl) return '';
    var rows = logEl.querySelectorAll('.jk-row'), lines = [];
    for (var i = 0; i < rows.length; i++) {
      var m = rows[i].querySelector('.jk-msg'); if (!m) continue;
      var txt = (m.textContent || '').replace(/\s+/g, ' ').trim(); if (!txt) continue;
      lines.push((rows[i].className.indexOf('jk-user') > -1 ? '고객: ' : 'AI: ') + txt);
    }
    return lines.join('\n');
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
    var hid = F('entry.1340519393');
    if (hid) {
      var base = (hid.value ? hid.value + ' | ' : '') + buildHidden();
      var tr = buildTranscript();
      var full = tr ? (base + '\n\n[대화 전체]\n' + tr) : base;
      if (full.length > 1800) full = full.slice(0, 1800) + ' …(이하 생략)';
      hid.value = full;
    }
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

  /* ── 자유 텍스트: 상담 메타질문은 즉답(0토큰), 그 외 도메인 질문은 Gemini RAG(/api/chat) ── */
  var FALLBACK_MSG = '그건 대표님 상황부터 봐야 정확하게 짚어드릴 수 있어요. 지금 접수해두시면 담당 전문가가 그 건부터 챙겨드려요.';
  function handleFreeText(text) {
    userSay(text);
    var t = text.replace(/\s/g, '');
    // 상담 자체에 대한 메타 질문만 즉답 — 도메인 질문(정책자금 얼마 등)은 걸리지 않게 좁게
    if (/상담(은|이)?(무료|공짜|비용|수수료|얼마)|(무료|공짜)(상담|인가|예요|인가요)|수수료/.test(t))
      return say('상담은 무료예요. 부담 없이 남겨주시면 돼요.').then(afterDeflect);
    if (/상담.*(시간|얼마나|오래)|얼마나(걸|오래)|상담시간/.test(t))
      return say('통화 5분이면 방향은 나와요.').then(afterDeflect);
    if (/(언제|며칠).*(연락|전화)|연락.*(언제|며칠)|콜.*(언제|며칠)/.test(t))
      return say('담당 전문가가 하루 이틀 안에 연락드려요.').then(afterDeflect);
    if (/개인정보|정보저장|어디저장|보관|처리방침/.test(t))
      return say('구글폼·구글시트에 저장돼요. 자세한 건 <a href="' + PRIVACY + '" target="_blank" rel="noopener">처리방침</a>에서 보시면 돼요.').then(afterDeflect);
    // 그 외 → AI 분석(내 지식베이스 기반) 후 상담 유도
    askAI(text);
  }
  // 봇 말풍선 즉시 출력(모델 응답 텍스트는 이스케이프)
  function botText(txt) {
    var html = esc(txt).replace(/\n+/g, '<br>');
    logEl.appendChild(el('<div class="jk-row jk-bot"><div class="jk-ava"><img src="' + LOGO + '" alt=""></div>' +
      '<div class="jk-msg">' + html + '</div></div>'));
    scrollDown();
  }
  function askAI(text) {
    var typing = node(typingNode());              // 응답 대기 타이핑 표시
    var done = false;
    var finish = function (reply) {
      if (done) return; done = true;
      if (typing && typing.parentNode) logEl.removeChild(typing);
      if (reply && reply.trim()) botText(reply); else botText(FALLBACK_MSG);
      afterDeflect();
    };
    var timer = setTimeout(function () { finish(''); }, 12000); // 12초 타임아웃 → 폴백
    fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: String(text).slice(0, 400) }) })
      .then(function (r) { return r.json(); })
      .then(function (d) { clearTimeout(timer); finish(d && d.reply); })
      .catch(function () { clearTimeout(timer); finish(''); });
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
      '<button class="jk-head-btn" id="jkRestart" aria-label="처음부터 새로 시작" title="처음부터">↺</button>' +
      '<button class="jk-head-btn" id="jkMin" aria-label="최소화">–</button>' +
      '<button class="jk-head-btn" id="jkClose" aria-label="닫기">×</button></div>' +
      '<div class="jk-progress"><div class="jk-progress-fill"></div></div>' +
      '<div class="jk-log" aria-live="polite"></div><div class="jk-input"></div></div>');
    document.body.appendChild(panel);
    logEl = panel.querySelector('.jk-log'); inputEl = panel.querySelector('.jk-input'); progFill = panel.querySelector('.jk-progress-fill');
    panel.querySelector('#jkClose').onclick = closePanel;
    panel.querySelector('#jkMin').onclick = closePanel;
    panel.querySelector('#jkRestart').onclick = restartChat;
  }
  // 처음부터 새로 시작 — 대화·상태 전부 초기화 후 재시작
  function restartChat() {
    answers = {}; picked = { consult: {} }; contact = { tel:'', name:'', company:'' };
    submitted = false; exitIntercepted = false; window.__chatDriven = false;
    if (window.__jkOkTimer) { clearTimeout(window.__jkOkTimer); window.__jkOkTimer = null; }
    if (logEl) logEl.innerHTML = '';
    if (inputEl) inputEl.innerHTML = '';
    setProgress(0);
    startConversation();
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
