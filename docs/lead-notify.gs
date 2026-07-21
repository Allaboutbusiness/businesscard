/**
 * 오너스 상담폼 → 담당자 즉시 통지 (Google Apps Script)
 * ------------------------------------------------------------------
 * 접수 즉시 담당자(또는 대표 이메일)에게 새 상담 내용을 메일로 자동 발송.
 * "접수 후 수동으로 순차 연락"을 없애 응답 속도를 끌어올린다.
 *
 * [설치]  (구글 계정에서 1회, 코드 접근 불필요)
 *  1) 상담 응답이 쌓이는 Google Sheet 열기
 *  2) 상단 메뉴 [확장 프로그램] → [Apps Script]
 *  3) 기본 코드 지우고 이 파일 전체 붙여넣기 → 저장
 *  4) 왼쪽 [트리거(시계 아이콘)] → [트리거 추가]
 *       - 실행할 함수: onFormSubmit
 *       - 이벤트 소스: 스프레드시트에서
 *       - 이벤트 유형: 양식 제출 시
 *     저장(첫 실행 시 권한 승인 팝업 → 허용)
 *  5) 끝. 새 상담이 들어오면 자동으로 메일이 온다.
 *
 * [설정]  아래 NOTIFY / CENTRAL 만 채우면 됨. 안 채워도 시트 소유자 본인에게 옴.
 */

// 담당자별 알림 이메일. 이름은 카드 히든태그 [담당자:이름] 과 일치시킬 것.
// 비워두면 CENTRAL(또는 시트 소유자)에게 발송.
var NOTIFY = {
  '김진기': '',
  '조기열': '',
  '유우선': '',
  '류예주': '',
  '이승원': '',
  '안지수': '',
  '채용현': '',
  '송기훈': ''
};

// 담당자 미지정/미매핑 시 받을 대표 이메일. 비우면 시트 소유자 본인 이메일로 발송.
var CENTRAL = '';

function onFormSubmit(e) {
  var nv = (e && e.namedValues) || {};

  // 모든 응답값을 한 덩어리로 → 담당자/유입코드 파싱(컬럼명과 무관하게 robust)
  var flat = [];
  for (var k in nv) flat.push(nv[k].join(' '));
  var all = flat.join(' \n');

  var ownerMatch = all.match(/\[담당자:([^\]]+)\]/);
  var owner = ownerMatch ? ownerMatch[1].trim() : '';

  var codeMatch = all.match(/\b(POST|PGM|CFO|CARD|CHAT|NB|TH|KT|IG)-[^\s,\n]+/);
  var code = codeMatch ? codeMatch[0] : '';

  // 헤더(질문 제목) 부분일치로 주요 항목 추출
  function pick(keys) {
    for (var h in nv) {
      for (var i = 0; i < keys.length; i++) {
        if (h.indexOf(keys[i]) >= 0) { var v = nv[h].join(', ').trim(); if (v) return v; }
      }
    }
    return '';
  }
  var name    = pick(['성함', '이름']);
  var phone   = pick(['연락처', '전화', '휴대']);
  var company = pick(['업체', '회사', '상호']);
  var region  = pick(['소재지', '지역', '주소']);
  var sales   = pick(['매출']);
  var staff   = pick(['직원', '인원', '규모']);
  var type    = pick(['상담 유형', '상담유형', '유형']);

  var to = (owner && NOTIFY[owner]) ? NOTIFY[owner]
         : (CENTRAL || Session.getEffectiveUser().getEmail());

  var subject = '[상담접수] ' + (name || '(성함미상)')
              + (company ? ' / ' + company : '')
              + (owner ? ' · 담당 ' + owner : '');

  var lines = [
    '새 상담이 접수되었습니다. (자동 알림)',
    '',
    '• 성함: ' + name,
    '• 연락처: ' + phone,
    '• 업체: ' + company,
    '• 소재지: ' + region,
    '• 매출: ' + sales,
    '• 직원/규모: ' + staff,
    '• 상담유형: ' + type,
    '• 담당자: ' + (owner || '(미지정)'),
    '• 유입경로 코드: ' + (code || '(없음)'),
    '',
    '※ 접수 즉시 자동 발송 — 빠른 응답이 무료→구독 전환의 1차 변수입니다.'
  ];

  MailApp.sendEmail(to, subject, lines.join('\n'));
}
