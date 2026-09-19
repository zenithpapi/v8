(function () {
  if (!('serviceWorker' in navigator)) return;

  const swUrl = new URL('sw.js', window.location.href);

  navigator.serviceWorker.register(swUrl.href).then(reg => {
    console.log('Service worker registered:', reg);

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      console.log('Service worker controller changed — reloading page to use new service worker.');
      try { window.location.reload(); } catch (e) { /* ignore */ }
    });

  }).catch(err => console.warn('Service worker registration failed:', err));
})();
