(function () {
  // pwa-install.js
  // Shows an install overlay that blocks interaction until the webapp is installed

  function isAppInstalled() {
    // Check common signals for PWA install
    try {
      if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true;
      if (window.navigator.standalone === true) return true; // iOS Safari
      if (document.referrer && document.referrer.indexOf('android-app://') === 0) return true;
      // fallback to local flag if appinstalled event fired previously
      if (localStorage.getItem('pwa_installed') === '1') return true;
    } catch (e) {
      // ignore
    }
    return false;
  }

  let deferredPrompt = null;
  let overlayEl = null;

  function createOverlay(hasPromptSupport) {
    if (overlayEl) return overlayEl;

    const overlay = document.createElement('div');
    overlay.id = 'pwa-install-overlay';
    Object.assign(overlay.style, {
      position: 'fixed', top: '0', left: '0', right: '0', bottom: '0',
      background: 'rgba(255,255,255,0.98)', zIndex: '2147483646',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px', boxSizing: 'border-box', textAlign: 'center',
      fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      color: '#111'
    });

    const card = document.createElement('div');
    Object.assign(card.style, { maxWidth: '560px', width: '100%', padding: '22px', borderRadius: '12px', boxShadow: '0 10px 30px rgba(0,0,0,0.12)' });

    const title = document.createElement('h2');
    title.textContent = 'Install the app';
    Object.assign(title.style, { margin: '0 0 8px', fontSize: '20px' });

    const p = document.createElement('p');
    p.textContent = 'For security and the best experience, install this app to your device before signing in or creating an account.';
    Object.assign(p.style, { margin: '0 0 16px', color: '#333', lineHeight: '1.4' });

    const btnWrap = document.createElement('div');
    btnWrap.style.display = 'flex';
    btnWrap.style.justifyContent = 'center';
    btnWrap.style.gap = '12px';

    const installBtn = document.createElement('button');
    installBtn.type = 'button';
    installBtn.textContent = hasPromptSupport ? 'Install App' : 'How to install';
    Object.assign(installBtn.style, { padding: '10px 16px', borderRadius: '8px', border: 'none', background: '#1a73e8', color: '#fff', fontSize: '15px', cursor: 'pointer' });

    const infoBtn = document.createElement('button');
    infoBtn.type = 'button';
    infoBtn.textContent = 'Close';
    Object.assign(infoBtn.style, { padding: '10px 16px', borderRadius: '8px', border: '1px solid #ddd', background: '#fff', color: '#111', fontSize: '15px', cursor: 'pointer' });

    btnWrap.appendChild(installBtn);
    btnWrap.appendChild(infoBtn);

    card.appendChild(title);
    card.appendChild(p);
    card.appendChild(btnWrap);
    overlay.appendChild(card);

    // Prevent tabbing outside
    overlay.addEventListener('keydown', function (e) {
      if (e.key === 'Tab') e.preventDefault();
    });

    installBtn.addEventListener('click', async function () {
      if (deferredPrompt) {
        try {
          deferredPrompt.prompt();
          const choice = await deferredPrompt.userChoice;
          if (choice && choice.outcome === 'accepted') {
            // user installed via prompt
            markInstalled();
            removeOverlay();
          } else {
            // user dismissed; show manual instructions next time
            showManualInstallInstructions();
          }
        } catch (e) {
          showManualInstallInstructions();
        }
      } else {
        showManualInstallInstructions();
      }
    });

    infoBtn.addEventListener('click', function () {
      // allow user to close overlay (but still block interaction by keeping it visible?)
      // Here we remove overlay but we don't mark installed — this lets user inspect the page but they won't be able to sign in until installed.
      removeOverlay();
    });

    overlayEl = overlay;
    return overlay;
  }

  function showOverlay(hasPromptSupport) {
    if (isAppInstalled()) return;
    if (document.getElementById('pwa-install-overlay')) return;
    const overlay = createOverlay(hasPromptSupport);
    document.body.appendChild(overlay);
    // lock page scrolling and pointer
    document.documentElement.style.overflow = 'hidden';
    document.body.style.pointerEvents = 'none';
    overlay.style.pointerEvents = 'auto';
  }

  function removeOverlay() {
    const o = document.getElementById('pwa-install-overlay');
    if (o) o.remove();
    document.documentElement.style.overflow = '';
    document.body.style.pointerEvents = '';
  }

  function markInstalled() {
    localStorage.setItem('pwa_installed', '1');
  }

  function showManualInstallInstructions(containerEl) {
    // Show simple manual instructions in the overlay or a provided container
    const o = containerEl || document.getElementById('pwa-install-overlay');
    if (!o) return;
    const card = (o.querySelector && o.querySelector('div')) || o;
    if (!card) return;
    card.innerHTML = '';
    const title = document.createElement('h2');
    title.textContent = 'Manual install instructions';
    const p = document.createElement('p');
    p.innerHTML = 'Use your browser menu and tap "Add to Home screen" (Android/Chrome) or use the Share menu and tap "Add to Home Screen" (Safari on iOS). After installing, return to the app.';
    const ok = document.createElement('button');
    ok.textContent = 'Open instructions';
    Object.assign(ok.style, { padding: '10px 14px', borderRadius: '8px', border: 'none', background: '#1a73e8', color: '#fff', cursor: 'pointer' });
    ok.addEventListener('click', function () {
      alert('Follow the platform instructions: use the browser menu > Add to Home screen (Android/Chrome) or Share > Add to Home Screen (Safari).');
    });
    const close = document.createElement('button');
    close.textContent = 'Close';
    Object.assign(close.style, { marginLeft: '10px', padding: '10px 14px', borderRadius: '8px', border: '1px solid #ddd', background: '#fff', color: '#111', cursor: 'pointer' });
    close.addEventListener('click', function () {
      // remove overlay if it exists, otherwise remove any message element inside container
      if (o.id === 'pwa-install-overlay') removeOverlay();
      else if (card && card.parentElement) card.parentElement.removeChild(card);
    });
    card.appendChild(title);
    card.appendChild(p);
    const wrap = document.createElement('div');
    wrap.style.marginTop = '12px';
    wrap.appendChild(ok);
    wrap.appendChild(close);
    card.appendChild(wrap);
  }

  // Create a small persistent install button instead of full blocking overlay
  let installBtnEl = null;
  function createInstallButton(hasPromptSupport) {
    if (installBtnEl) return installBtnEl;
    const btn = document.createElement('button');
    btn.id = 'pwa-install-button';
    btn.title = 'Install app';
    btn.textContent = 'Install App';
    Object.assign(btn.style, {
      position: 'fixed', right: '14px', bottom: '14px', zIndex: '2147483647',
      padding: '10px 14px', borderRadius: '999px', border: 'none', background: '#1a73e8', color: '#fff',
      boxShadow: '0 8px 20px rgba(0,0,0,0.12)', cursor: 'pointer', fontSize: '14px'
    });

    btn.addEventListener('click', async function (e) {
      e.preventDefault();
      if (deferredPrompt) {
        try {
          deferredPrompt.prompt();
          const choice = await deferredPrompt.userChoice;
          if (choice && choice.outcome === 'accepted') {
            markInstalled();
            removeInstallButton();
          } else {
            showManualInstallInstructions(document.body);
          }
        } catch (err) {
          showManualInstallInstructions(document.body);
        }
      } else {
        // show small non-blocking instruction box
        showManualInstallInstructions(document.body);
      }
    });

    installBtnEl = btn;
    return btn;
  }

  function showInstallButton(hasPromptSupport) {
    if (isAppInstalled()) return;
    if (document.getElementById('pwa-install-button')) return;
    const btn = createInstallButton(hasPromptSupport);
    document.body.appendChild(btn);
    // Add listener to block login/register navigation while not installed
    document.addEventListener('click', blockLoginNavigation, true);
    document.addEventListener('submit', blockLoginFormSubmission, true);
  }

  function removeInstallButton() {
    if (installBtnEl && installBtnEl.parentElement) installBtnEl.parentElement.removeChild(installBtnEl);
    installBtnEl = null;
    document.removeEventListener('click', blockLoginNavigation, true);
    document.removeEventListener('submit', blockLoginFormSubmission, true);
  }

  function isLoginTarget(el) {
    if (!el) return false;
    try {
      const href = (el.getAttribute && el.getAttribute('href')) || '';
      const action = (el.getAttribute && el.getAttribute('action')) || '';
      const dataPage = el.getAttribute && el.getAttribute('data-page');
      if (/login|signin|register|signup|create-account/i.test(href)) return true;
      if (/login|signin|register|signup|create-account/i.test(action)) return true;
      if (dataPage && /login|register|signin|signup/i.test(dataPage)) return true;
      // also check onclick that calls openPage('login')
      const onclick = el.getAttribute && el.getAttribute('onclick');
      if (onclick && /openPage\(['\"]?(login|signin|register|signup)['\"]?/i.test(onclick)) return true;
    } catch (e) {}
    return false;
  }

  function blockLoginNavigation(e) {
    if (isAppInstalled()) return;
    const target = e.target;
    // walk up to find a clickable ancestor
    let node = target;
    while (node && node !== document) {
      if (isLoginTarget(node)) {
        e.preventDefault();
        e.stopPropagation();
        // focus the install button and show install instructions
        const btn = document.getElementById('pwa-install-button');
        if (btn) {
          btn.focus();
          // briefly pulse the button to draw attention
          btn.animate([{ boxShadow: '0 8px 20px rgba(0,0,0,0.12)' }, { boxShadow: '0 8px 40px rgba(26,115,232,0.6)' }, { boxShadow: '0 8px 20px rgba(0,0,0,0.12)' }], { duration: 700 });
        }
        // optionally show overlay with manual instructions if no prompt
        if (!deferredPrompt) showManualInstallInstructions(document.body);
        return;
      }
      node = node.parentElement;
    }
  }

  function blockLoginFormSubmission(e) {
    if (isAppInstalled()) return;
    const form = e.target;
    if (!form) return;
    if (isLoginTarget(form)) {
      e.preventDefault();
      e.stopPropagation();
      const btn = document.getElementById('pwa-install-button');
      if (btn) btn.focus();
      if (!deferredPrompt) showManualInstallInstructions(document.body);
    }
  }

  // Listen for beforeinstallprompt to capture deferred prompt
  window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent Chrome from showing mini-infobar; save the event for later
    e.preventDefault();
    deferredPrompt = e;
    // Show install button (uses deferred prompt when clicked)
    if (!isAppInstalled()) {
      showInstallButton(true);
    }
  });

  // When installed via browser UI
  window.addEventListener('appinstalled', (e) => {
    markInstalled();
    removeInstallButton();
    // also remove overlay if it exists
    removeOverlay();
  });

  // On load, if already installed, nothing to do. Otherwise, show a small install button.
  document.addEventListener('DOMContentLoaded', function () {
    if (!isAppInstalled()) {
      showInstallButton(false);
    }
  });

  // Also monitor display-mode changes (some browsers update matchMedia)
  if (window.matchMedia) {
    try {
      window.matchMedia('(display-mode: standalone)').addEventListener('change', function (e) {
        if (e.matches) {
          markInstalled();
          removeOverlay();
        }
      });
    } catch (e) {
      // older browsers use addListener
      try {
        window.matchMedia('(display-mode: standalone)').addListener(function (m) {
          if (m.matches) { markInstalled(); removeOverlay(); }
        });
      } catch (er) { }
    }
  }

})();
