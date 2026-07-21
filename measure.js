// 사이트 공통 측정 태그 (GA4 + Meta Pixel).
// 아래 두 ID를 넣으면 활성화되고, 비워두면 아무것도 로드하지 않는다(무해).
// 상담 신청 성공(apSubmitOk 커스텀 이벤트) 시 전환(Lead) 이벤트를 발행한다.
(function () {
  var GA4_ID = '';    // 예: 'G-XXXXXXXXXX'  (GA4 측정 ID)
  var META_ID = '';   // 예: '1234567890123456'  (Meta/페이스북 픽셀 ID)

  if (GA4_ID) {
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA4_ID;
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', GA4_ID);
  }

  if (META_ID) {
    !function (f, b, e, v, n, t, s) {
      if (f.fbq) return;
      n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
      if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = [];
      t = b.createElement(e); t.async = !0; t.src = v;
      s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
    }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
    window.fbq('init', META_ID);
    window.fbq('track', 'PageView');
  }

  // 상담 신청 성공 = 전환(Lead). index.html·cfo.html이 apSubmitOk를 발행한다.
  document.addEventListener('apSubmitOk', function () {
    try { if (window.gtag && GA4_ID) window.gtag('event', 'generate_lead', { form: 'consult' }); } catch (e) {}
    try { if (window.fbq && META_ID) window.fbq('track', 'Lead'); } catch (e) {}
  });
})();
