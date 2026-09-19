/* mobile-overlay.js
   Theme-aware mobile-only overlay for the app.
   Creates an accessible, reversible full-screen overlay when the device is not mobile.
   Reads CSS variables from :root and falls back to computed styles.
*/

function getMobileOverride() {
  try {
    const params = new URLSearchParams(window.location.search);
    const forced = params.get('mobile') ?? params.get('forceMobile');
    if (forced != null) {
      const normalized = forced.trim().toLowerCase();
      if (normalized === '1' || normalized === 'true' || normalized === 'yes') return true;
      if (normalized === '0' || normalized === 'false' || normalized === 'no') return false;
    }
    const stored = localStorage.getItem('forceMobile');
    if (stored != null) {
      const normalized = stored.trim().toLowerCase();
      if (normalized === '1' || normalized === 'true' || normalized === 'yes') return true;
      if (normalized === '0' || normalized === 'false' || normalized === 'no') return false;
    }
  } catch (e) {
    // ignore invalid URL query or storage errors
  }
  return null;
}

function isAndroidWebView() {
  const ua = navigator.userAgent || '';
  return /; wv\)|android.*\bwv\b|android.*applewebkit(?!.*safari)|version\/\d+.*chrome\/\d+.*safari|; arm64;.*chrome\/|samsungbrowser\/|crios\//i.test(ua);
}

function isMobile() {
  const ua = navigator.userAgent || '';
  const uaLower = ua.toLowerCase();
  const override = getMobileOverride();
  if (override !== null) return override;

  const isStandalone =
    (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
    window.navigator.standalone === true ||
    (document.referrer && document.referrer.indexOf('android-app://') === 0);
  const uaDataMobile =
    typeof navigator.userAgentData === 'object' &&
    typeof navigator.userAgentData.mobile === 'boolean'
      ? navigator.userAgentData.mobile
      : null;
  const hasTouch =
    'ontouchstart' in window ||
    navigator.maxTouchPoints > 0 ||
    navigator.msMaxTouchPoints > 0;
  const isIPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  const isMobileUA = /iphone|ipod|android|blackberry|bb10|iemobile|opera mini|windows phone|webos|mobile/i.test(ua);
  const isTabletUA = /ipad|tablet|playbook|silk/i.test(ua);
  const isDesktopUA = /windows nt|macintosh|x11|linux x86_64|linux i686|intel mac os x|cros/i.test(uaLower);
  const isSmallTouchScreen = hasTouch && Math.max(window.screen.width, window.screen.height) <= 1100;
  const isAndroidPlatform = /android/i.test(uaLower) || (/linux/i.test(navigator.platform || '') && /arm|aarch64|arm64/i.test(navigator.platform || ''));
  const isWebViewUA = isAndroidWebView();

  if (uaDataMobile !== null) {
    return uaDataMobile || isStandalone || isIPadOS || isWebViewUA || isSmallTouchScreen;
  }

  if (isMobileUA || isTabletUA || isIPadOS || isStandalone || isWebViewUA || (hasTouch && (isSmallTouchScreen || isAndroidPlatform))) {
    return true;
  }

  if (isDesktopUA && !hasTouch) {
    return false;
  }

  return false;
}

function readThemeVars() {
  const rootStyle = getComputedStyle(document.documentElement);
  const bodyStyle = getComputedStyle(document.body);
  const trim = s => (s || '').trim();

  return {
    rawBackground:
      trim(rootStyle.getPropertyValue('--overlay-background')) ||
      trim(rootStyle.getPropertyValue('--app-background')) ||
      trim(rootStyle.getPropertyValue('--background-color')) ||
      trim(bodyStyle.backgroundColor) || '',
    rawColor:
      trim(rootStyle.getPropertyValue('--overlay-color')) ||
      trim(rootStyle.getPropertyValue('--app-color')) ||
      trim(rootStyle.getPropertyValue('--text-color')) ||
      trim(bodyStyle.color) || '',
    rawPrimary:
      trim(rootStyle.getPropertyValue('--app-primary')) ||
      trim(rootStyle.getPropertyValue('--primary-color')) ||
      '#007bff',
    fontFamily:
      trim(rootStyle.getPropertyValue('--app-font-family')) ||
      trim(rootStyle.getPropertyValue('--font-family')) ||
      bodyStyle.fontFamily ||
      'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
  };
}

function toRgba(input, alpha = 1) {
  if (!input) return null;
  const s = input.trim();

  const rgbaMatch = s.match(/^rgba?\(\s*([^)]+)\)/i);
  if (rgbaMatch) {
    const parts = rgbaMatch[1].split(',').map(p => p.trim());
    const r = parseInt(parts[0], 10) || 0;
    const g = parseInt(parts[1], 10) || 0;
    const b = parseInt(parts[2], 10) || 0;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  const hex = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) {
      h = h.split('').map(ch => ch + ch).join('');
    }
    const intVal = parseInt(h, 16);
    const r = (intVal >> 16) & 255;
    const g = (intVal >> 8) & 255;
    const b = intVal & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  return s;
}

function showMobileOnlyOverlay() {
  if (document.getElementById('mobile-only-overlay')) return;

  const theme = readThemeVars();
  const overlayAlpha = 0.96;
  const overlayBg = toRgba(theme.rawBackground, overlayAlpha) || `rgba(255,255,255,${overlayAlpha})`;
  const textColor = theme.rawColor || '#111';
  const primary = theme.rawPrimary || '#007bff';
  const font = theme.fontFamily;

  const overlay = document.createElement('div');
  overlay.id = 'mobile-only-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');

  Object.assign(overlay.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    right: '0',
    bottom: '0',
    background: overlayBg,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: '2147483647',
    padding: '30px',
    textAlign: 'center',
    fontFamily: font,
    color: textColor,
    backdropFilter: 'blur(6px)',
    WebkitBackdropFilter: 'blur(6px)',
    boxSizing: 'border-box'
  });

  const card = document.createElement('div');
  Object.assign(card.style, {
    maxWidth: '560px',
    width: '100%',
    padding: '28px',
    borderRadius: '12px',
    boxShadow: '0 6px 20px rgba(0,0,0,0.12)',
    background: toRgba(theme.rawBackground, 0.02) || 'rgba(255,255,255,0.02)',
    color: 'inherit'
  });

  const title = document.createElement('h1');
  title.textContent = 'Mobile Devices Only';
  Object.assign(title.style, { margin: '0 0 10px', fontSize: '22px', lineHeight: '1.15' });

  const msg = document.createElement('p');
  msg.textContent = 'This application can only be accessed from a mobile phone.';
  Object.assign(msg.style, { margin: '0 0 18px', color: textColor, opacity: '0.9' });

  // No action buttons — overlay is informational only

  card.appendChild(title);
  card.appendChild(msg);
  overlay.appendChild(card);
  document.body.appendChild(overlay);

  document.documentElement.style.overflow = 'hidden';
  document.body.style.touchAction = 'none';
}

function removeMobileOnlyOverlay() {
  const ov = document.getElementById('mobile-only-overlay');
  if (!ov) return;
  ov.remove();
  document.documentElement.style.overflow = '';
  document.body.style.touchAction = '';
}

function evaluateMobileRequirement() {
  const override = getMobileOverride();
  if (override === true) {
    removeMobileOnlyOverlay();
    return;
  }
  if (override === false) {
    showMobileOnlyOverlay();
    return;
  }

  if (!isMobile()) {
    showMobileOnlyOverlay();
  } else {
    removeMobileOnlyOverlay();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', evaluateMobileRequirement);
} else {
  evaluateMobileRequirement();
}

window.addEventListener('resize', evaluateMobileRequirement);
window.addEventListener('orientationchange', evaluateMobileRequirement);
