/* ════════════════════════════════════════════════════════════════════════════
   ownerskr.com 상담폼 → studio 병행 전송
   ────────────────────────────────────────────────────────────────────────────
   index.html 의 </body> 직전, 기존 #apForm 핸들러 <script> **다음에** 넣습니다.
   별도 파일로 두고 <script src="/ownerskr-intake.js" defer></script> 로 불러도 됩니다.

   ★ 설계 원칙 — 기존 흐름을 절대 건드리지 않는다 ★
   구글폼 제출(form.submit → 숨은 iframe)이 지금 유일하게 동작하는 접수 경로이고
   유일한 백업입니다. 이 스크립트는 거기에 **끼어들지 않습니다.**
     · preventDefault 를 부르지 않습니다
     · 유효성 검사를 다시 하지 않습니다 (기존 핸들러가 이미 막습니다)
     · 우리 서버가 죽어도 catch 로 삼키고 끝냅니다
   submit 이벤트에 리스너를 하나 더 붙이는 것뿐입니다. 순서상 기존 핸들러가
   먼저 등록돼 있으므로, 기존 핸들러가 preventDefault 를 걸면 여기도 안 보냅니다.

   ★ 같은 출처입니다 ★
   대시보드는 ownerskr.com/admin 으로 서비스되므로 접수구도 같은 출처입니다.
   CORS 도, preflight 도, 출처 검사도 필요 없습니다.
   Content-Type 은 text/plain 그대로 둡니다 — 서버가 그렇게 파싱하고,
   혹시 나중에 다른 도메인에서 부르게 되더라도 preflight 가 안 붙습니다.
   ════════════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* 대시보드가 ownerskr.com/admin 으로 서비스되므로 **같은 출처**다.
     상대 경로를 쓰면 CORS 도, preflight 도, 출처 검사도 전부 필요 없어진다. */
  var ENDPOINT = '/admin/api/intake';

  var form = document.getElementById('apForm');
  if (!form) return;

  /* 허니팟 — 봇은 채우고 사람은 못 본다.
     display:none 이 아니라 화면 밖으로 밀어야 일부 봇 필터를 통과한다.

     ⚠️ 필드명을 `website` 로 하면 안 된다.
        `website`/`url` 은 브라우저 자동완성이 실제로 채우는 표준 토큰이라,
        자동완성이 켜진 사람의 **정상 신청이 봇으로 오인돼 조용히 버려진다.**
        상담 한 건이 아쉬운데 그렇게 잃으면 원인도 안 남는다.
        자동완성 사전에 없는 이름을 쓴다. */
  var pot = document.createElement('input');
  pot.type = 'text';
  pot.name = 'ap_hp';
  pot.tabIndex = -1;
  pot.autocomplete = 'off';
  pot.setAttribute('aria-hidden', 'true');
  pot.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px;opacity:0';
  form.appendChild(pot);

  form.addEventListener('submit', function (ev) {
    /* 기존 핸들러가 preventDefault 했으면(필수값 누락·동의 미체크) 폼은 안 나간다.
       그때는 우리도 보내면 안 된다. 기존 핸들러가 먼저 등록돼 있으므로
       이 시점에는 이미 defaultPrevented 가 세팅돼 있다. */
    if (ev.defaultPrevented) return;

    try {
      var fd = new FormData(form);
      var body = Object.create(null);

      fd.forEach(function (v, k) {
        if (Object.prototype.hasOwnProperty.call(body, k)) {
          if (!Array.isArray(body[k])) body[k] = [body[k]];
          body[k].push(v);
        } else {
          body[k] = v;
        }
      });

      /* 상담유형은 체크박스 다중이라 1개만 골라도 배열이어야 한다 */
      var TOPIC = 'entry.1210990703';
      if (body[TOPIC] && !Array.isArray(body[TOPIC])) body[TOPIC] = [body[TOPIC]];

      body.gform_ok = true;     /* 구글폼으로도 나갔다는 표시 */
      body.ap_hp = pot.value;   /* 허니팟 값 그대로 전달 */

      fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify(body),
        keepalive: true,        /* 페이지가 바뀌어도 전송을 마친다 */
        credentials: 'same-origin',
      }).catch(function () { /* 우리 쪽 실패는 조용히 넘긴다 */ });
    } catch (e) {
      /* 어떤 예외도 구글폼 제출을 막으면 안 된다 */
    }
  });

  /* 챗봇이 폼을 대신 채워 제출하는 경로(window.__chatDriven)도 같은 submit 을
     타므로 별도 처리가 필요 없다. source 구분이 필요하면 아래를 켜세요.
     document.addEventListener('apSubmitOk', function () { ... }); */
})();
