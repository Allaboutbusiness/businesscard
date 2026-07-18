/* ─────────────────────────────────────────────────────────────────────────
 * diag-rules.js — clean-room 진단 규칙 (Type A 부재)
 *
 * ★설계 불변식: 이 파일은 정식사업명·기관실명·지원요율·상한선·심사 컷라인(reasons)·
 *   매칭점수·금액을 "물리적으로" 담지 않는다. 담는 것은 오직
 *   [공개 자기신고 답변키] → [coarse 버킷 boolean + 고정 칩 문자열 + 긴급 템플릿키] 뿐.
 *   → view-source·무인증 차분질의로도 샐 것이 없다(서버 이식보다 안전).
 *
 * 출력은 아래 4항목 리터럴 조립만. matchingLogic의 하위분기(jjgLevel·tier·subcat)를
 *   충실 재현하지 않는다(재현하면 결정트리 단편이 재구성됨).
 * ──────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  // 기술 계열 업종(칩 큐레이션용) — 폼 6버킷 기준
  function isTechSector(s) { return s === 'mfg' || s === 'it'; }

  // 결핍칩 = 고정 큐레이션 목록. 수치·방법·임계·정식명 0. 답변키로만 선택.
  function deficiencies(a) {
    var out = [];
    if (a.sector === 'mfg' || a.sector === 'con') out.push('업종 분류 재정비');
    if (a.sector === 'retail') out.push('업종 인정 근거');
    out.push('사업계획서 설계');
    out.push('신청 순서·타이밍');
    if (a.bizType === 'corp') out.push('법인 자금 개인화');
    if (a.tech && a.tech !== 'notech') out.push('기술 인증 정비');
    if (a.situation === 'decline' || a.situation === 'disaster') out.push('신청 시점 근거');
    // 중복 제거 + 최대 4개
    var seen = {}, uniq = [];
    for (var i = 0; i < out.length; i++) { if (!seen[out[i]]) { seen[out[i]] = 1; uniq.push(out[i]); } }
    return uniq.slice(0, 4);
  }

  // 긴급 템플릿 키(문구는 chatbot.js가 보유). 사용자 답변에 묶인 개인화 손실회피.
  function urgencyKey(a) {
    if (a.bizType === 'corp' && (a.revenue === 'r3080' || a.revenue === 'r80p')) return 'whale';
    if (a.businessAge === 'pre' || a.businessAge === 'lt1') return 'early';
    if (a.situation === 'disaster' || a.situation === 'decline') return 'crisis';
    if (a.ceoAge === 'young') return 'young';
    return 'general';
  }

  /* run(answers) → { buckets, guaranteeOpen, deficiencies, urgencyKey, whale }
   *  buckets: 항상 열리는 3갈래 키(loan·cert·support) — 표시 라벨은 chatbot.js가 매핑
   *  guaranteeOpen: limitation 게이트(정상이면 보증 계열 4번째 언락)
   *  whale: 고LTV(법인 + 상위 매출) — CFO 실무 훅 트리거 */
  function run(a) {
    return {
      buckets: ['loan', 'cert', 'support'],
      guaranteeOpen: (a.limitation === 'none' || a.limitation == null),
      deficiencies: deficiencies(a),
      urgencyKey: urgencyKey(a),
      whale: (a.bizType === 'corp' && (a.revenue === 'r3080' || a.revenue === 'r80p'))
    };
  }

  window.DIAGRULES = { run: run };
})();
