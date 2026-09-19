(function () {
  const CACHE_PREFIX = 'my-app-cache-';
  // servers.json must provide api servers; no hardcoded fallback is used
  const VERSION_URL = '/version.json';
  const CHECK_INTERVAL_MS = 10 * 1000; // check every 10 seconds
  const VERSION_FETCH_TIMEOUT_MS = 1500; // fail fast if the version file stalls

  function resolveApiUrl(url) {
    const normalized = String(url || '').replace(/^(\.\/)+/, '').replace(/^(\.\.\/)+/, '');
    const apiServers = window && (window.__PRIME_AUTONOMOUS_API_SERVERS__ || window.__PAT_API_SERVERS__);
    if (!(apiServers && apiServers.length)) {
      throw new Error('No API servers configured (servers.json missing or empty)');
    }
    const base = apiServers[0];
    return new URL(normalized, base).toString();
  }

  let knownVersion = null;

  function updateVersionElement(version) {
    try {
      const el = document.getElementById('app-version-value');
      if (!el) return;
      const textEl = el.querySelector('.version-text');
      // clear any loading state and set authoritative text
      el.removeAttribute('aria-busy');
      try { delete el.dataset.prevValue; } catch (e) {}
      if (textEl) {
        textEl.textContent = version || '—';
      } else {
        // fallback if markup isn't present for some reason
        el.textContent = version || '—';
      }
    } catch (e) {
      // ignore DOM errors
    }
  }

  // Show/hide a small inline spinner while waiting for server response
  function setVersionLoading(loading) {
    try {
      const el = document.getElementById('app-version-value');
      if (!el) return;
      const textEl = el.querySelector('.version-text');
      if (loading) {
        // preserve current visible value for restore if needed
        try { el.dataset.prevValue = (textEl ? textEl.textContent : el.textContent) || ''; } catch (e) { /* ignore */ }
        el.setAttribute('aria-busy', 'true');
      } else {
        el.removeAttribute('aria-busy');
        // restore previous text if still present, otherwise leave to updateVersionElement to set
        if (el.dataset.prevValue !== undefined) {
          try {
            if (textEl) textEl.textContent = el.dataset.prevValue || '—';
            else el.textContent = el.dataset.prevValue || '—';
          } catch (e) { /* ignore */ }
          try { delete el.dataset.prevValue; } catch (e) {}
        }
      }
    } catch (e) { console.warn('setVersionLoading failed', e); }
  }

  // Initialize knownVersion from localStorage safely
  try {
    knownVersion = localStorage.getItem('cacheVersion');
  } catch (e) {
    knownVersion = null;
  }

  // Show stored version immediately if present, otherwise show loading spinner until server responds
  if (knownVersion) {
    updateVersionElement(knownVersion);
  } else {
    // keep loading state visible until getServerVersion completes
    setVersionLoading(true);
  }

  async function getServerVersion() {
    // show inline loading indicator while fetch is in-flight
    setVersionLoading(true);

    // Use server list provided by the app (servers.json). If none are available, return null so caller knows checks cannot be made.
    const bases = window && (window.__PRIME_AUTONOMOUS_API_SERVERS__ || window.__PAT_API_SERVERS__);
    if (!(bases && bases.length)) return null;

    for (let i = 0; i < bases.length; i++) {
      const base = bases[i];
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), VERSION_FETCH_TIMEOUT_MS);
      try {
        // Append timestamp to bypass caches and ensure fresh copy
        const url = new URL(VERSION_URL, base);
        url.searchParams.set('_ts', String(Date.now()));
        const res = await fetch(url.toString(), {
          cache: 'no-store',
          credentials: 'include',
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (!res.ok) continue; // try next base
        const j = await res.json();
        return j && (j.cacheVersion || j.version) ? (j.cacheVersion || j.version) : null;
      } catch (e) {
        clearTimeout(timeoutId);
        console.warn('Version check failed for ' + base, e);
        // try next base
        continue;
      }
    }

    // all candidates failed
    return null;

  }

  /* ---- UI helpers: toasts and progress overlay (non-blocking) ---- */
  function showToast(message, type = 'info', ttl = 4000) {
    try {
      let container = document.getElementById('toastContainer');
      if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        container.className = 'toast-container';
        document.body.appendChild(container);
      }
      const toast = document.createElement('div');
      toast.className = 'toast' + (type === 'success' ? ' success' : type === 'error' ? ' error' : '');
      toast.textContent = message;
      container.appendChild(toast);
      if (ttl > 0) {
        setTimeout(() => {
          toast.style.transition = 'opacity 250ms';
          toast.style.opacity = '0';
          setTimeout(() => container.removeChild(toast), 250);
        }, ttl);
      }
    } catch (e) { console.warn('showToast failed', e); }
  }

  function showProgress(message) {
    try {
      const el = document.getElementById('updateOverlay');
      const status = document.getElementById('updateStatus');
      if (status) status.textContent = message || '';
      if (el) el.style.display = 'flex';
    } catch (e) { console.warn('showProgress failed', e); }
  }

  function hideProgress() {
    try {
      const el = document.getElementById('updateOverlay');
      if (el) el.style.display = 'none';
    } catch (e) { console.warn('hideProgress failed', e); }
  }

  // Wrapper to start update with UI
  function clearDataWithUI() {
    try {
      showProgress('Starting clear data — clearing local data...');
      // Defer to allow overlay to paint before heavy work
      setTimeout(() => {
        // forceUpdateApp returns a promise (it's async)
        forceUpdateApp().then(() => {
          // success handled inside forceUpdateApp; overlay will hide on reload otherwise
        }).catch((err) => {
          hideProgress();
          showToast('Clear data failed: ' + (err && err.message ? err.message : String(err)), 'error', 6000);
        });
      }, 80);
    } catch (e) {
      console.warn('clearDataWithUI failed', e);
    }
  }

  // expose globally
  window.clearDataWithUI = clearDataWithUI;
  window.startUpdateWithUI = clearDataWithUI;

  async function clearAllCachesAndReload(newVersion) {
    const newCacheName = CACHE_PREFIX + newVersion;

    // Update visible version immediately
    updateVersionElement(newVersion);

    try {
      localStorage.setItem('cacheVersion', newVersion);
    } catch (e) {
      // ignore storage errors
    }

    // Prefer to notify any active service worker before clearing caches.
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      try {
        navigator.serviceWorker.controller.postMessage({ type: 'SET_CACHE_NAME', cacheName: newCacheName });
        navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_OLD_CACHES', currentCachePrefix: CACHE_PREFIX, keepName: newCacheName });
        navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' });
      } catch (e) {
        console.warn('Messaging service worker failed', e);
      }
    }

    if ('caches' in window) {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
        console.log('All CacheStorage entries cleared');
      } catch (e) {
        console.warn('Clearing caches failed', e);
      }
    }

    if ('serviceWorker' in navigator) {
      try {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
        console.log('Service workers unregistered');
      } catch (e) {
        console.warn('Unregistering service workers failed', e);
      }
    }

    setTimeout(() => window.location.reload(true), 600);
  }

  async function checkAndUpdate() {
    const serverVersion = await getServerVersion();
    if (!serverVersion) return;
    // Update the visible version (even if unchanged) so users see the authoritative version
    updateVersionElement(serverVersion);
    // The first successful check establishes the local baseline; it is not an update.
    if (knownVersion === null) {
      knownVersion = serverVersion;
      try {
        localStorage.setItem('cacheVersion', serverVersion);
      } catch (e) {
        console.warn('Saving initial cache version failed', e);
      }
      return;
    }
    if (serverVersion !== knownVersion) {
      console.log('New version detected', serverVersion, 'old:', knownVersion);
      try {
        if (typeof showToast === 'function') {
          showToast('New version detected, clearing data...', 'success');
        }
      } catch (e) {
        console.warn('showToast unavailable', e);
      }
      knownVersion = serverVersion;
      clearAllCachesAndReload(serverVersion);
    }
  }

  async function forceUpdateApp() {
      // Helper: clear local/session storage
      const clearLocalAndSession = () => {
        try { localStorage.clear(); } catch (e) { console.warn('localStorage clear failed', e); }
        try { sessionStorage.clear(); } catch (e) { console.warn('sessionStorage clear failed', e); }
      };

      // Helper: clear IndexedDB databases
      const clearIndexedDB = async () => {
        if (!window.indexedDB) return;
        try {
          const dbs = await (indexedDB.databases ? indexedDB.databases() : Promise.resolve([]));
          if (Array.isArray(dbs) && dbs.length) {
            await Promise.all(dbs.map(d => {
              if (d && d.name) return new Promise((res) => {
                const req = indexedDB.deleteDatabase(d.name);
                req.onsuccess = () => { console.log('Deleted IndexedDB', d.name); res(); };
                req.onerror = () => { console.warn('Failed delete IndexedDB', d.name); res(); };
                req.onblocked = () => { console.warn('Delete blocked for IndexedDB', d.name); res(); };
              });
              return Promise.resolve();
            }));
          }
        } catch (e) {
          console.warn('clearIndexedDB error', e);
        }
      };

      // Helper: clear CacheStorage
      const clearCaches = async () => {
        if (!('caches' in window)) return;
        try {
          const keys = await caches.keys();
          await Promise.all(keys.map(k => caches.delete(k)));
          console.log('CacheStorage cleared');
        } catch (e) {
          console.warn('clearCaches error', e);
        }
      };

      // Helper: unregister service workers
      const unregisterServiceWorkers = async () => {
        if (!('serviceWorker' in navigator)) return;
        try {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map(r => r.unregister()));
          console.log('Service workers unregistered');
        } catch (e) {
          console.warn('unregisterServiceWorkers error', e);
        }
      };

      // Helper: clear non-HttpOnly cookies for current origin
      const clearCookies = () => {
        try {
          const cookies = document.cookie.split(';');
          for (const cookie of cookies) {
            const eqPos = cookie.indexOf('=');
            const name = eqPos > -1 ? cookie.substr(0, eqPos).trim() : cookie.trim();
            if (!name) continue;
            document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
            document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=' + location.hostname;
          }
          console.log('Non-HttpOnly cookies attempted to be cleared');
        } catch (e) {
          console.warn('clearCookies error', e);
        }
      };

      // Start comprehensive clear
      showProgress('Clearing local/session storage...');
      clearLocalAndSession();

      showProgress('Checking server version...');
      const serverVersion = await getServerVersion();
      const effectiveVersion = serverVersion ? `${serverVersion}-${Date.now()}` : `manual-${Date.now()}`;
      const newCacheName = CACHE_PREFIX + effectiveVersion;

      updateVersionElement(serverVersion || 'Updating');

      let shouldDelayReload = false;

      // If SW controller exists, prefer messaging it to handle cache switching
      showProgress('Notifying service worker (if present)...');
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        shouldDelayReload = true;
        try {
          navigator.serviceWorker.controller.postMessage({ type: 'SET_CACHE_NAME', cacheName: newCacheName });
          navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_OLD_CACHES', currentCachePrefix: CACHE_PREFIX, keepName: newCacheName });
          navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' });
        } catch (e) {
          console.warn('Messaging service worker failed', e);
        }
      }

      // Try clearing CacheStorage directly
      showProgress('Clearing CacheStorage...');
      await clearCaches();

      // Try unregistering service workers (in case messaging didn't work)
      showProgress('Unregistering service workers...');
      await unregisterServiceWorkers();

      // Clear IndexedDB
      showProgress('Removing IndexedDB databases...');
      await clearIndexedDB();

      // Clear non-HttpOnly cookies
      showProgress('Clearing cookies...');
      clearCookies();

      // Request server-side logout to clear HttpOnly cookies if endpoint exists
      showProgress('Requesting server logout...');
      try {
        await fetch(resolveApiUrl('/auth/logout'), { method: 'POST', credentials: 'include' });
        console.log('Requested server logout (clear HttpOnly cookies)');
      } catch (e) {
        // It's optional — don't fail the whole workflow if it doesn't exist
        console.warn('logout request failed', e);
      }

      showProgress('Finalizing and reloading...');
      showToast('Local data cleared — reloading', 'success', 2500);

      try {
        if (serverVersion) {
          localStorage.setItem('cacheVersion', serverVersion);
        }
      } catch (e) {
        /* ignore storage errors */
      }

      if (shouldDelayReload) {
        setTimeout(() => window.location.reload(true), 600);
      } else {
        window.location.reload(true);
      }
    }

  // Initial check on load
  checkAndUpdate();

  // No periodic checks — only check once on load

    // Optional manual trigger
    window.checkForNewVersion = checkAndUpdate;
    window.forceUpdateApp = forceUpdateApp;
  })();
