/* ─────────────────────────────────────────────────────────────────────────
 * card.js — 구성원 개인 명함 페이지. /card/<이름> (또는 ?p=<이름>) 접속 시
 *   ① 히어로(이름·직책·태그라인·사진·경력·태그) 교체
 *   ② PROFESSIONALS: 본인 팀을 TEAM 01로, 팀 내 본인을 앞으로(유우선 특례)
 *   ③ 담당 박스 개인화 + 상담폼 히든필드에 [담당자:이름] 태그(페이지폼·챗봇 공통)
 * 메인페이지(슬러그 없음)는 전혀 변경하지 않음.
 * ──────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  var MEMBERS = {
    '조기열': { role: '경영지도사', photo: '/card-jokiyeol.jpg',
      tagline: '재무 진단부터 정책자금까지,<br>기업의 자금 조달을 설계합니다',
      career: ['경영지도사', '정책자금 전문팀 총괄', '재무제표 평가·분석 전문'],
      tags: ['정책자금', '재무진단', '운영자금', '시설자금'] },
    '유우선': { role: '수석 경영컨설턴트', photo: '/card-yuwooseon.jpg',
      tagline: '정책자금의 시작부터 사후관리까지,<br>기업의 자금을 책임집니다',
      career: ['수석 경영컨설턴트', '정책자금 총괄 운영 관리', '자금 활용 효율 극대화'],
      tags: ['정책자금', '운영관리', '자금집행', '사후관리'],
      order: ['조기열', '유우선', '김진기'] },   // 특례: 조기열 → 유우선 → 김진기
    '류예주': { role: 'AC 대표', photo: '/card-ryuyeju.jpg',
      tagline: '투자 유치부터 정부지원사업까지,<br>기업의 성장을 설계합니다',
      career: ['AC 대표', '투자 유치·정부지원사업 총괄', '성장단계별 투자 전략'],
      tags: ['투자유치', '정부지원', 'R&D', '밸류업'] },
    '이승원': { role: '행정사', photo: '/card-leeseungwon.jpg',
      tagline: '인증부터 R&D 지원금까지,<br>정부지원 성장 전략을 설계합니다',
      career: ['행정사', '인증·사업화·R&D 지원금 총괄', '벤처·이노비즈 인증 전문'],
      tags: ['기업인증', 'R&D', '사업화', '정부지원'] },
    '안지수': { role: '변리사', photo: '/card-anjisu.jpg',
      tagline: '핵심 기술을 특허로,<br>기업의 지식재산을 지킵니다',
      career: ['변리사', '특허·지식재산권 총괄', 'IP 포트폴리오 관리'],
      tags: ['특허', '상표', '지식재산', 'IP'] },
    '채용현': { role: '변호사 · 세무사 · 변리사', photo: '/card-chaeyonghyun.jpg',
      tagline: '법률부터 세무·IP까지,<br>기업 리스크를 통합 관리합니다',
      career: ['변호사 · 세무사 · 변리사', '조세·법률·IP 통합 자문', '상속·기업분쟁 전문'],
      tags: ['법률', '세무', '상속', '분쟁'] },
    '송기훈': { role: '회계사', photo: '/card-songgihoon.jpg',
      tagline: '세무기장부터 고난도 절세까지,<br>기업의 재무를 최적화합니다',
      career: ['회계사', '회계·조세 전문', '세무기장·절세 솔루션'],
      tags: ['회계', '절세', '세무기장', '경정청구'] },
    '김진기': { role: '사외 CFO', photo: '/photo_crop.png?v716', vd: true,
      tagline: '자금부터 절세까지,<br>기업의 모든 돈 문제를 해결합니다',
      career: ['서울시립대학교 졸업', '대한민국 육군 중위 전역', '제조·유통 전문 컨설턴트'],
      tags: ['정책자금', '투자', 'R&D', '상속·증여'] }
  };

  // slug: /card/<이름> 우선, 없으면 ?p=<이름>
  function getSlug() {
    var m = location.pathname.match(/^\/card\/([^\/?#]+)/);
    if (m) { try { return decodeURIComponent(m[1]); } catch (e) { return m[1]; } }
    try { var q = new URLSearchParams(location.search).get('p'); if (q) return q; } catch (e) {}
    return '';
  }

  var slug = getSlug();
  if (!slug || !MEMBERS[slug]) return;   // 메인페이지 → 변경 없음
  var me = MEMBERS[slug];

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]); }); }

  function apply() {
    // ① 히어로
    var nameEl = document.querySelector('.hero-name'); if (nameEl) nameEl.textContent = slug;
    var cfoEl = document.querySelector('.hero-cfo'); if (cfoEl) cfoEl.textContent = me.role;
    var tagEl = document.querySelector('.hero-tagline'); if (tagEl) tagEl.innerHTML = me.tagline;

    var photo = document.querySelector('.hero-photo');
    if (photo) {
      if (me.vd) photo.classList.add('vd'); else photo.classList.remove('vd'); // 배경 있는 프로필 → 액자형
      photo.setAttribute('src', me.photo);
      photo.setAttribute('alt', slug + ' ' + me.role);
      photo.removeAttribute('srcset');
    }
    var career = document.querySelector('.hero-career');
    if (career && me.career) career.innerHTML = me.career.map(function (c) { return '<div class="hero-career-item">' + esc(c) + '</div>'; }).join('');
    var tagsWrap = document.querySelector('.hero-tags');
    if (tagsWrap && me.tags) tagsWrap.innerHTML = me.tags.map(function (t) { return '<span class="hero-tag">' + esc(t) + '</span>'; }).join('');

    try { document.title = slug + ' ' + me.role + ' | 오너스경영연구소'; } catch (e) {}

    // ② PROFESSIONALS 팀 순서
    reorderTeams();

    // ③ 담당 박스
    [].slice.call(document.querySelectorAll('.ap-info .ap-card')).forEach(function (c) {
      var k = c.querySelector('.k'), v = c.querySelector('.v');
      if (k && v && k.textContent.trim() === '담당') v.innerHTML = esc(slug) + ' · ' + esc(me.role) + '<br>오너스경영연구소';
    });

    // ④ 상담폼 담당자 태그(페이지폼·챗봇 제출 모두 반영)
    var hid = document.querySelector('#apForm input[name="entry.1340519393"]');
    if (hid) hid.value = '[담당자:' + slug + ']' + (hid.value ? ' ' + hid.value : '');
    window.__cardOwner = slug;
  }

  function reorderTeams() {
    var blocks = [].slice.call(document.querySelectorAll('.team-sec .team-block'));
    if (!blocks.length) return;
    var container = blocks[0].parentNode;

    var mineBlock = null;
    blocks.forEach(function (b) {
      var names = [].slice.call(b.querySelectorAll('.member-name')).map(function (n) { return n.textContent.trim(); });
      if (names.indexOf(slug) > -1) mineBlock = b;
    });
    if (!mineBlock) return;

    container.insertBefore(mineBlock, container.firstChild);   // 본인 팀 맨 앞
    // 라벨 재번호(TEAM 01, 02, …)
    [].slice.call(container.querySelectorAll('.team-block .team-label')).forEach(function (lb, i) {
      lb.textContent = 'TEAM ' + ('0' + (i + 1)).slice(-2);
    });

    // 팀 내 멤버 재정렬
    var grid = mineBlock.querySelector('.team-grid'); if (!grid) return;
    var cards = [].slice.call(grid.querySelectorAll('.member'));
    var byName = {};
    cards.forEach(function (c) { var n = c.querySelector('.member-name'); if (n) byName[n.textContent.trim()] = c; });

    var order;
    if (me.order) {
      order = me.order.slice();
      // 팀에 있는데 order에 빠진 멤버는 뒤에 보존
      cards.forEach(function (c) { var n = c.querySelector('.member-name'); var nm = n ? n.textContent.trim() : ''; if (nm && order.indexOf(nm) < 0) order.push(nm); });
    } else {
      order = [slug];   // 본인 먼저, 나머지는 원래 순서
      cards.forEach(function (c) { var n = c.querySelector('.member-name'); var nm = n ? n.textContent.trim() : ''; if (nm && nm !== slug) order.push(nm); });
    }
    order.forEach(function (nm) { if (byName[nm]) grid.appendChild(byName[nm]); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply);
  else apply();
})();
