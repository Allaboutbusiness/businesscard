/**
 * 정부지원사업 매일 매칭 이메일 발송 (Google Apps Script)
 * ────────────────────────────────────────────────────────────
 * 매일 1회, ownerskr.com에서 각 구독자별 '새로 추가된 맞춤 지원사업'을 받아
 * 대표님 Gmail로 발송한다. (Vercel 함수 한도 때문에 발송만 앱스스크립트가 담당)
 *
 * [설치]  (대표님 구글 계정에서 1회, 코드 접근 불필요)
 *  1) https://script.google.com → [새 프로젝트]
 *  2) 이 파일 전체를 붙여넣기
 *  3) 아래 SECRET 에 Vercel의 INIT_SECRET 값 입력
 *     (Vercel → businesscard → Settings → Environment Variables → INIT_SECRET)
 *  4) 저장 → 함수 목록에서 sendDailyMatches 한 번 실행(권한 승인 팝업 → 허용)
 *  5) 왼쪽 [트리거(시계)] → [트리거 추가]
 *       - 함수: sendDailyMatches
 *       - 이벤트 소스: 시간 기반
 *       - 유형: 일 단위 타이머 → 원하는 시간대(예: 오전 8~9시)
 *     저장. 끝. 매일 자동 발송된다.
 *
 * ※ 무료 Gmail은 하루 약 100통 발송 한도. 구독자가 많아지면 Google Workspace(1,500통)
 *    또는 Resend 등 전송 서비스로 확장(코드 알려주시면 전환).
 */

var SECRET = '여기에_INIT_SECRET_붙여넣기';
var ENDPOINT = 'https://ownerskr.com/api/programs?action=daily&secret=';
var SENDER_NAME = '오너스경영연구소';

function sendDailyMatches() {
  var resp = UrlFetchApp.fetch(ENDPOINT + encodeURIComponent(SECRET), { muteHttpExceptions: true });
  if (resp.getResponseCode() !== 200) {
    Logger.log('엔드포인트 실패(' + resp.getResponseCode() + '): ' + resp.getContentText().slice(0, 200));
    return;
  }
  var data = JSON.parse(resp.getContentText());
  var payloads = data.payloads || [];
  var sent = 0;
  for (var i = 0; i < payloads.length; i++) {
    var p = payloads[i];
    try {
      MailApp.sendEmail({ to: p.email, subject: buildSubject(p), htmlBody: buildHtml(p), name: SENDER_NAME });
      sent++;
    } catch (e) { Logger.log('메일 실패 ' + p.email + ': ' + e); }
  }
  Logger.log('구독자 ' + data.subscribers + '명 / 새 매칭 발송 ' + sent + '건');
}

function buildSubject(p) {
  var who = p.company ? p.company + ' — ' : '';
  return '[오너스] ' + who + '오늘 새로 뜬 맞춤 지원사업 ' + p.count + '건';
}

function buildHtml(p) {
  var rows = (p.programs || []).map(function (x) {
    return '<tr><td style="padding:11px 0;border-bottom:1px solid #eee">'
      + '<a href="' + x.link + '" style="color:#0D9A8C;font-weight:700;text-decoration:none;font-size:15px">' + esc(x.name) + '</a>'
      + '<div style="color:#8a9a95;font-size:12.5px;margin-top:3px">마감: ' + esc(x.deadline) + '</div></td></tr>';
  }).join('');
  var more = p.count > (p.programs || []).length
    ? '<p style="color:#8a9a95;font-size:12.5px;text-align:center">외 ' + (p.count - p.programs.length) + '건 — 아래 버튼에서 전체 확인</p>'
    : '';
  return ''
    + '<div style="max-width:600px;margin:0 auto;font-family:\'Apple SD Gothic Neo\',\'Malgun Gothic\',sans-serif;color:#1f2a28;padding:8px">'
    + '<div style="font-size:12px;font-weight:800;letter-spacing:2px;color:#0D9A8C">OWNERS · 정부지원사업 매칭</div>'
    + (p.company ? '<div style="font-size:15px;font-weight:800;color:#1f2a28;margin:10px 0 2px">' + esc(p.company) + ' 님</div>' : '')
    + '<h2 style="font-size:19px;margin:8px 0 4px">오늘 새로 뜬, 회원님 조건에 맞는 지원사업 ' + p.count + '건</h2>'
    + '<p style="color:#8a9a95;font-size:13px;margin:0 0 14px">어제 이후 추가된 공고 중 회원님 업종·지역·관심에 맞는 것만 추렸습니다.</p>'
    + '<table style="width:100%;border-collapse:collapse">' + rows + '</table>'
    + more
    + '<div style="margin:26px 0;text-align:center">'
    + '<a href="' + p.url + '" style="display:inline-block;background:#0D9A8C;color:#fff;text-decoration:none;font-weight:800;padding:15px 30px;border-radius:12px;font-size:15px">지금 열려있는 내 매칭 전체 보기 →</a>'
    + '<div style="color:#8a9a95;font-size:12px;margin-top:8px">이 링크는 항상 현재 진행 중인 전체 매칭을 보여줍니다.</div>'
    + '</div>'
    + '<hr style="border:0;border-top:1px solid #eee;margin:20px 0">'
    + '<p style="color:#aab4b1;font-size:11.5px;line-height:1.6">(주)오너스경영연구소 전문 컨설팅 그룹 · 1668-5033<br>'
    + (p.company ? esc(p.company) + ' · ' : '') + '수신: ' + esc(p.email) + '<br>'
    + '회원님이 신청하신 조건으로 자동 발송되는 메일입니다. '
    + '<a href="' + p.unsubUrl + '" style="color:#aab4b1">구독 해지</a> · '
    + '자세한 상담은 <a href="https://ownerskr.com/#apply" style="color:#0D9A8C">무료 3회 상담</a></p>'
    + '</div>';
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}
