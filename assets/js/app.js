// ===============================
// Zenith
// app.js
// ===============================

const app = document.getElementById("app");
const STORAGE_KEY = "prime_autonomous_user";
const LEGACY_STORAGE_KEY = "pat_user";
const AUTH_TOKEN_KEY = "prime_autonomous_auth_token";
const LEGACY_AUTH_TOKEN_KEY = "pat_auth_token";
const USERNAME_KEY = "prime_autonomous_username";
const LEGACY_USERNAME_KEY = "pat_username";
const APP_MAX_WIDTH = 430;

function syncAppScale() {
	const scale = Math.min(1, window.innerWidth / APP_MAX_WIDTH);
	document.documentElement.style.setProperty("--app-scale", scale.toFixed(3));
	document.documentElement.style.setProperty("--app-zoom", scale.toFixed(3));
}

window.addEventListener("resize", syncAppScale);
window.addEventListener("orientationchange", syncAppScale);
syncAppScale();

function applySeasonalTheme(overrideDate = null) {
   const now = overrideDate instanceof Date ? overrideDate : new Date();

   // helper: check inclusive range within same year
   function inRange(date, startMonth, startDay, endMonth, endDay) {
    const year = date.getFullYear();
    const start = new Date(year, startMonth, startDay);
    const end = new Date(year, endMonth, endDay);
    return date >= start && date <= end;
   }

   // Ranges (months are 0-based)
   // Halloween: Oct 25 (9,25) to Nov 30 (10,30)
   // Christmas: Nov 24 (10,24) to Dec 31 (11,31)
   const isChristmas = inRange(now, 10, 24, 11, 31);
   const isHalloween = inRange(now, 9, 25, 10, 30);

   // Christmas takes precedence when ranges overlap
   let season = 'default';
   if (isChristmas) season = 'christmas';
   else if (isHalloween) season = 'halloween';

   const backgroundBySeason = {
    halloween: "url('assets/images/bg1.jpg')",
    christmas: "url('assets/images/bg2.jpg')",
    default: "url('assets/images/bg3.jpg')"
   };

   const selectedBackground = backgroundBySeason[season] || backgroundBySeason.default;

   document.body.dataset.season = season;

   const gradient = 'linear-gradient(180deg, rgba(255, 255, 255, 0.45) 0%, rgba(245, 245, 245, 0.55) 100%)';
   const image = selectedBackground;
   const isMobileWidth = window.innerWidth <= APP_MAX_WIDTH;

   if (isMobileWidth) {
    document.body.style.background = `${gradient}, ${image} center center / cover fixed no-repeat`;
   } else {
    document.body.style.background = `${gradient}, ${image} center center / cover fixed no-repeat`;
   }

   return { season, background: selectedBackground };
}

// Debug helpers (date-based). Use in the console:
// PrimeDebug.setDate(year, monthIndex, day)
// PrimeDebug.setSeason('halloween'|'christmas'|'default')
// PrimeDebug.reset(); PrimeDebug.current()
window.__PRIME_AUTONOMOUS_DEBUG__ = {
  setDate(year, monthIndex, day) {
   const d = new Date(year, monthIndex, day);
   return applySeasonalTheme(d);
  },
  setSeason(seasonName) {
   const s = String(seasonName || '').toLowerCase();
   if (s === 'halloween') return applySeasonalTheme(new Date(new Date().getFullYear(), 9, 28)); // Oct 28
   if (s === 'christmas') return applySeasonalTheme(new Date(new Date().getFullYear(), 11, 15)); // Dec 15
   return applySeasonalTheme(new Date(new Date().getFullYear(), 0, 15)); // Jan 15
  },
  reset() {
   return applySeasonalTheme();
  },
  current() {
   return document.body.dataset.season || 'default';
  }
};

window.__PAT_DEBUG__ = window.__PRIME_AUTONOMOUS_DEBUG__;
window.PrimeDebug = window.__PRIME_AUTONOMOUS_DEBUG__;
window.PATDebug = window.__PRIME_AUTONOMOUS_DEBUG__;
window.setSeasonTheme = function (value) {
  if (value instanceof Date) return window.__PRIME_AUTONOMOUS_DEBUG__.setDate(value.getFullYear(), value.getMonth(), value.getDate());
  return window.__PRIME_AUTONOMOUS_DEBUG__.setSeason(value);
};

// Re-apply on resize/orientation so the image sizing updates when viewport changes
window.addEventListener('resize', () => applySeasonalTheme());
window.addEventListener('orientationchange', () => applySeasonalTheme());

applySeasonalTheme();

// URL that provides a JSON array of server base URLs (one per item)
const SERVERS_JSON_URL = new URL('./servers.json', window.location.href).toString();
// The list of API server bases (normalized, trailing slash included). Populated from servers.json only.
let apiServers = [];
let activeApiBase = null;
window.__PRIME_AUTONOMOUS_API_SERVERS__ = apiServers; // expose for debugging / other modules (may be empty until servers.json loads)
window.__PRIME_AUTONOMOUS_ACTIVE_API_BASE__ = activeApiBase;
window.__PAT_API_SERVERS__ = apiServers;
window.__PAT_ACTIVE_API_BASE__ = activeApiBase;

function normalizeBase(b) {
	try {
		return String(b || "").trim().replace(/\/+$/, "") + "/";
	} catch (e) { return null; }
}

function lockInApiBase(base) {
	const clean = normalizeBase(base);
	if (!clean) return;
	activeApiBase = clean;
	const unique = [clean].concat((apiServers || []).filter(item => normalizeBase(item) !== clean));
	apiServers = unique.filter(Boolean);
	window.__PRIME_AUTONOMOUS_API_SERVERS__ = apiServers;
	window.__PRIME_AUTONOMOUS_ACTIVE_API_BASE__ = activeApiBase;
	window.__PAT_API_SERVERS__ = apiServers;
	window.__PAT_ACTIVE_API_BASE__ = activeApiBase;
}

// Load servers.json in the background and populate apiServers. Errors are not swallowed so failures are visible in console.
async function loadApiServers() {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 5000);
	// Append a timestamp to force a fresh fetch every page load and use no-store to avoid cached responses
	const u = new URL(SERVERS_JSON_URL);
	u.searchParams.set('_ts', String(Date.now()));
	const res = await fetch(u.toString(), { cache: 'no-store', signal: controller.signal });
	clearTimeout(timeout);
	if (!res.ok) throw new Error('Failed to fetch servers.json: ' + res.status);
	const j = await res.json();
	// Support two formats:
	// 1) simple array: ["https://a/", "https://b/"]
	// 2) object with servers array: { servers: [ { url: "https://a/", priority: 1 }, ... ] }
	let rawList = [];
	if (Array.isArray(j) && j.length > 0) {
		rawList = j.slice();
	} else if (j && Array.isArray(j.servers) && j.servers.length > 0) {
		// extract urls and sort by priority if present
		rawList = j.servers
			.map(s => {
				return {
					url: (s && s.url) ? String(s.url) : '',
					priority: (s && typeof s.priority !== 'undefined') ? Number(s.priority) : 9999
				};
			})
			.filter(item => item.url)
			.sort((a, b) => (a.priority || 9999) - (b.priority || 9999))
			.map(item => item.url);
	}

	apiServers = rawList.map(normalizeBase).filter(Boolean);
	if (activeApiBase && apiServers.includes(activeApiBase)) {
		lockInApiBase(activeApiBase);
	}
	window.__PRIME_AUTONOMOUS_API_SERVERS__ = apiServers;
	window.__PRIME_AUTONOMOUS_ACTIVE_API_BASE__ = activeApiBase;
	window.__PAT_API_SERVERS__ = apiServers;
	window.__PAT_ACTIVE_API_BASE__ = activeApiBase;
	return apiServers;
}

// Kick off load but do not block app initialization (let errors surface)
loadApiServers();

function getPrimaryBase() {
	if (activeApiBase) {
		return activeApiBase;
	}
	if (!apiServers || apiServers.length === 0) {
		throw new Error('No API servers configured. servers.json must provide at least one API base.');
	}
	return apiServers[0];
}

function normalizeApiRoute(url) {
	const cleaned = String(url || "")
		.replace(/^\/+/, "")
		.replace(/^(\.\/)+/, "")
		.replace(/^(\.\.\/)+/, "")
		.replace(/\\/g, "/");

	const routeMap = {
		"login": "v1/session/create",
		"login.php": "v1/session/create",
		"logout": "v1/session/end",
		"logout.php": "v1/session/end",
		"register": "v1/profile/create",
		"register.php": "v1/profile/create",
		"dashboard": "v1/account/overview",
		"dashboard.php": "v1/account/overview",
		"wallet": "v1/account/summary",
		"wallet.php": "v1/account/summary",
		"team": "v1/network/summary",
		"team.php": "v1/network/summary",
		"trade": "v1/market/status",
		"trade.php": "v1/market/status",
		"lockin": "v1/lockins/create",
		"lockin.php": "v1/lockins/create",
		"report": "v1/activity/report",
		"report.php": "v1/activity/report",
		"paymongo": "v1/payments/create",
		"paymongo.php": "v1/payments/create",
		"payments/create": "v1/payments/create",
		"payments/create.php": "v1/payments/create",
		"api/v1/auth/login": "v1/session/create",
		"api/v1/auth/logout": "v1/session/end",
		"api/v1/auth/register": "v1/profile/create",
		"api/v1/payments/create": "v1/payments/create",
		"api/v1/user/dashboard": "v1/account/overview",
		"api/v1/user/wallet": "v1/account/summary",
		"api/v1/user/team": "v1/network/summary",
		"api/v1/user/trade": "v1/market/status",
		"api/v1/user/report": "v1/activity/report",
		"api/v1/lockins/create": "v1/lockins/create",
		"market/summary": "v1/market/summary",
		"market/investments": "v1/market/summary",
		"lockins/summary": "v1/lockins/summary",
		"v1/lockins/summary": "v1/lockins/summary",
		"v1/market/summary": "v1/market/summary",
		"v1/session/create": "v1/session/create",
		"v1/session/end": "v1/session/end",
		"v1/profile/create": "v1/profile/create",
		"v1/account/overview": "v1/account/overview",
		"v1/account/summary": "v1/account/summary",
		"v1/network/summary": "v1/network/summary",
		"v1/market/status": "v1/market/status",
		"v1/activity/report": "v1/activity/report",
		"v1/lockins/create": "v1/lockins/create",
		"v1/payments/create": "v1/payments/create"
	};

	if (routeMap[cleaned]) {
		return routeMap[cleaned];
	}

	if (cleaned.startsWith("v1/")) {
		return cleaned;
	}

	return cleaned;
}

function resolveApiUrl(url) {
	const normalized = normalizeApiRoute(url);
	const base = getPrimaryBase();
	return new URL(normalized, base).toString();
}

// Wait for apiServers to be populated (useful during app startup). Returns true if populated within timeoutMs, otherwise false.
async function waitForServers(timeoutMs = 5000) {
	if (apiServers && apiServers.length) return true;
	const start = Date.now();
	return new Promise(resolve => {
		const interval = 100;
		const id = setInterval(() => {
			if (apiServers && apiServers.length) {
				clearInterval(id);
				resolve(true);
				return;
			}
			if (Date.now() - start >= timeoutMs) {
				clearInterval(id);
				resolve(false);
			}
		}, interval);
	});
}

let aiStatusInterval = null;
let tradeSettings = {
	yieldPercent: 6,
	durationDays: 25
};
let tradePageState = {
	availableBalance: 0
};

function getCurrentUser() {
	try {
		const storedUser = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY) || "null";
		const user = JSON.parse(storedUser);
		if (!user || typeof user !== "object") return null;

		// API versions have returned the identifier under different names.  Keep one
		// canonical `id` so page actions do not reject a valid signed-in session.
		const id = user.id ?? user.user_id ?? user.userId ?? user.uid;
		if (id === undefined || id === null || id === "") return user;
		if (user.id === id) return user;

		const normalizedUser = Object.assign({}, user, { id });
		localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizedUser));
		try { localStorage.removeItem(LEGACY_STORAGE_KEY); } catch (e) {}
		return normalizedUser;
	} catch (error) {
		return null;
	}
}

function saveCurrentUser(user) {
	if (!user || typeof user !== "object") return null;
	const id = user.id ?? user.user_id ?? user.userId ?? user.uid;
	const normalizedUser = (id === undefined || id === null || id === "")
		? user
		: Object.assign({}, user, { id });
	localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizedUser));
	try { localStorage.removeItem(LEGACY_STORAGE_KEY); } catch (e) {}
	return normalizedUser;
}

function getAuthToken() {
	try {
		const token = localStorage.getItem(AUTH_TOKEN_KEY) || localStorage.getItem(LEGACY_AUTH_TOKEN_KEY);
		return token ? token.trim() : "";
	} catch (error) {
		return "";
	}
}

function saveAuthToken(loginResponse) {
	const payload = loginResponse && loginResponse.data && typeof loginResponse.data === "object"
		? loginResponse.data
		: {};
	const token = loginResponse && (
		loginResponse.token || loginResponse.access_token || loginResponse.accessToken ||
		payload.token || payload.access_token || payload.accessToken
	);
	if (typeof token === "string" && token.trim()) {
		localStorage.setItem(AUTH_TOKEN_KEY, token.trim());
		try { localStorage.removeItem(LEGACY_AUTH_TOKEN_KEY); } catch (e) {}
	}
}

function formatCurrency(value) {
	const number = Number(value || 0);
	if (number >= 1000000) {
		return "₱" + (number / 1000000).toFixed(1) + "M";
	}
	if (number >= 1000) {
		return "₱" + (number / 1000).toFixed(1) + "K";
	}
	return "₱" + number.toLocaleString("en-US", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2
	});
}

// Always show full numeric value with two decimals (no K/M abbreviation)
function formatCurrencyFull(value) {
	const number = Number(value || 0);
	return "₱" + number.toLocaleString("en-US", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2
	});
}

function formatPercent(value) {
	return Number(value || 0).toFixed(2) + "%";
}

// Utility: return a display id with the configured offset applied.
function getAdjustedNumericId(id, offset = 2608) {
	const n = Number(id || 0);
	if (isNaN(n)) return offset;
	return n + offset;
}

// Utility: format a trade label string. If it starts with 'Trade #' extract digits and add the offset.
function formatTradeLabelFromString(label, offset = 2608) {
	if (!label) return 'Trade payout';
	if (typeof label !== 'string') return String(label);
	const s = label.trim();
	if (!s.startsWith('Trade #')) return s || 'Trade payout';
	const m = s.match(/\d+/);
	if (m && m[0]) {
		return 'Trade #' + (Number(m[0]) + offset);
	}
	return s;
}

// Lock-in display IDs use a different offset than trade IDs.
function formatLockinDisplayLabel(label, offset = 8026) {
	if (!label) return 'Lock-in payout';
	if (typeof label !== 'string') return String(label);
	let out = label.trim();
	out = out.replace(/\(id\s*(\d+)\)/ig, (_, value) => '(id ' + (Number(value) + offset) + ')');
	return out || 'Lock-in payout';
}

// Utility: sanitize referral bonus note by removing investment id fragments (client-side only)
function sanitizeReferralNote(note, type) {
	let out = String(note || '');
	if (type === 'referral') {
		// remove bullet-style appended investment notes
		out = out.replace(/\s*•\s*Investment\s*#?\s*\d+/ig, '');
		// remove explicit '+2608' tokens
		out = out.replace(/\s*\+\s*2608/ig, '');
		// remove 'investment <num>' mentions
		out = out.replace(/\binvestment\s*#?\s*\d+\b/ig, '');
		// collapse multiple spaces and trim
		out = out.replace(/\s{2,}/g, ' ').trim();
		if (!out) out = 'Referral bonus';
	}
	return out;
}

function handleSessionExpired(message = "Session expired. Please log in again.") {
	const normalized = String(message || "").toLowerCase();
	const isAuthFailure = normalized.includes("please log in first")
		|| normalized.includes("session expired")
		|| normalized.includes("sign-in required")
		|| normalized.includes("admin sign-in required")
		|| normalized.includes("invalid csrf")
		|| normalized.includes("unauthorized");

	if (!isAuthFailure) {
		return false;
	}

	if (window.__patSessionExpiredHandled) {
		return true;
	}
	window.__patSessionExpiredHandled = true;

	try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
	try { localStorage.removeItem(LEGACY_STORAGE_KEY); } catch (e) {}
	try { localStorage.removeItem(AUTH_TOKEN_KEY); } catch (e) {}
	try { localStorage.removeItem(LEGACY_AUTH_TOKEN_KEY); } catch (e) {}
	try { localStorage.removeItem(USERNAME_KEY); } catch (e) {}
	try { localStorage.removeItem(LEGACY_USERNAME_KEY); } catch (e) {}
	try { sessionStorage.clear(); } catch (e) {}

	try {
		fetch(resolveApiUrl("logout.php"), {
			method: "POST",
			credentials: "include",
			headers: {
				"Content-Type": "application/json"
			}
		}).catch(() => {});
	} catch (e) {}

	showToast(message || "Session expired. Please log in again.", "error");
	setTimeout(() => {
		openPage("login");
	}, 700);
	return true;
}

async function requestJson(url, payload = null, method = "POST") {
	const authToken = getAuthToken();
	const baseOptions = {
		method,
		credentials: "include",
		headers: {
			"Content-Type": "application/json"
		}
	};
	if (authToken) {
		baseOptions.headers.Authorization = "Bearer " + authToken;
	}

	if (payload !== null) {
		baseOptions.body = JSON.stringify(payload);
	}

	// Wait a short time for servers.json to populate apiServers during startup
	const serversReady = await waitForServers(5000);
	if (!serversReady) {
		console.error('requestJson: no API servers configured (servers.json not loaded or empty)');
		return { success: false, message: 'No API servers configured.' };
	}

	const candidates = apiServers.slice();

	// Try each server in order until one returns a usable response. Network errors or 5xx errors will trigger retry to next server.
	for (let i = 0; i < candidates.length; i++) {
		const base = candidates[i];
		const normalizedUrl = normalizeApiRoute(url);
		const fullUrl = new URL(normalizedUrl, base);
		if (method && String(method).toUpperCase() === 'GET') {
			fullUrl.searchParams.set('_ts', String(Date.now()));
		}
		const finalUrl = fullUrl.toString();
		let timeoutId = null;
		try {
const opts = Object.assign({}, baseOptions, { cache: 'no-store' });
const controller = new AbortController();
timeoutId = setTimeout(() => controller.abort(), 5000);
opts.signal = controller.signal;
const response = await fetch(finalUrl, opts);
clearTimeout(timeoutId);
				
// A successful HTTP response proves the server is reachable; prefer it for subsequent requests.
if (response.ok) {
	lockInApiBase(base);
}
				
let data = {};
try {
	const text = await response.text();
	if (text) data = JSON.parse(text);
} catch (error) {
	console.error("Invalid JSON response from " + finalUrl, error);
	data = { success: false, message: "Request failed." };
}
// If unauthorized, handle session expired and return the server response immediately
if (response.status === 401 || response.status === 403) {
	handleSessionExpired(data.message || "Session expired. Please log in again.");
	return data;
}
// Retry to next server if the current one is unavailable (server error or other network-side failure)
if (response.status >= 500) {
	console.warn('Server reported HTTP ' + response.status + ' for ' + fullUrl + ', trying next server if any.');
	continue;
}
// If server returned client error (4xx other than auth), return that result and do not try other servers
if (response.status >= 400 && response.status < 500) {
	return data;
}
// If parsed JSON explicitly indicates success:false but it's a logical failure, also return it (application-level error)
if (data && typeof data.success !== 'undefined' && data.success === false) {
	const message = String(data.message || "");
	if (message.toLowerCase().includes("please log in first")
		|| message.toLowerCase().includes("session expired")
		|| message.toLowerCase().includes("sign-in required")
		|| message.toLowerCase().includes("admin sign-in required")) {
		handleSessionExpired(message);
	}
	return data;
}
// At this point, treat as success/usable response
return data;
		} catch (err) {
if (timeoutId) clearTimeout(timeoutId);
// Network-level failure or CORS issue — try next candidate if available
console.warn('Request to ' + fullUrl + ' failed, trying next server if any.', err);
continue;
		}
	}

	// If we reach here, all candidates failed
	console.error("requestJson: all API servers failed for " + url);
	return { success: false, message: "Request failed." };
}


// ===============================
// PAGE LOADER
// ===============================

function openPage(page, element) {

	const bottomNav = document.getElementById("bottomNav");

	if (page === "login" || page === "register") {

		if (bottomNav) bottomNav.style.display = "none";

	} else {

		if (bottomNav) bottomNav.style.display = "flex";

		document.querySelectorAll(".nav").forEach(nav => {
			nav.classList.remove("active");
		});

		const matchingNav = document.querySelector(`.nav[data-page="${page}"]`);
		if (matchingNav) {
			matchingNav.classList.add("active");
		} else if (element) {
			element.classList.add("active");
		}

	}

	// Show a lightweight loading placeholder immediately and scroll to top
	try {
		if (app) {
			app.innerHTML = '<div class="page-loading" aria-hidden="true"><div class="spinner" aria-hidden="true"></div></div>';
		}
		try { window.scrollTo({ top: 0, left: 0, behavior: 'auto' }); } catch (e) { document.documentElement.scrollTop = 0; }
	} catch (e) {
		// ignore
	}

	fetch("./modules/" + page + ".html")
		.then(response => {

			if (!response.ok) throw new Error("Module not found");

			return response.text();

		})
		.then(data => {

			if (app) app.innerHTML = '<div class="page-wrapper" style="display:none">' + data + '</div>';
			try { window.scrollTo({ top: 0, left: 0, behavior: 'auto' }); } catch (e) { document.documentElement.scrollTop = 0; }

			// initializePage may return a promise that resolves when the page's async data loads
			const initResult = initializePage(page);
			Promise.resolve(initResult)
				.then(() => {
					const wrapper = app ? app.querySelector('.page-wrapper') : null;
					if (wrapper) {
						// reveal with transition: set display then force reflow and add visible class
						wrapper.style.display = 'block';
						void wrapper.offsetWidth; // force reflow
						wrapper.classList.add('page-visible');
					}
				})
				.catch(err => {
					console.error('Page initialization error', err);
					// still reveal the page so user can see what loaded
					const wrapper = app ? app.querySelector('.page-wrapper') : null;
					if (wrapper) {
						wrapper.style.display = 'block';
						void wrapper.offsetWidth;
						wrapper.classList.add('page-visible');
					}
				});

		})
		.catch(error => {

			console.error(error);

			if (app) {
				app.innerHTML = `<div class="page-error"><h2>Page not found</h2><div class="subtitle">Unable to load page.</div><div style="margin-top:12px;"><button class="btn" onclick="openPage('${page}')">Retry</button></div></div>`;
			}

		});

}


// ===============================
// PAGE INITIALIZER
// ===============================

function initializePage(page) {

	if (aiStatusInterval) {

		clearInterval(aiStatusInterval);
		aiStatusInterval = null;

	}


	document.querySelectorAll(".card").forEach(card => {

		card.addEventListener("touchstart", () => {

			card.style.transform = "scale(.98)";

		});

		card.addEventListener("touchend", () => {

			card.style.transform = "scale(1)";

		});

	});

	// Collect async initialization promises and return when they settle
	const initPromises = [];

	if (page === "login") {
	// Disable login controls until servers.json provides API servers
	(function setLoginControlsEnabled(enabled) {
		try {
			const section = document.getElementById('signin');
			if (!section) return;
			const inputs = section.querySelectorAll('input, button');
			inputs.forEach(el => {
				// allow password toggle to function even when disabled for UX; skip buttons with class password-toggle
				if (!enabled && el.classList && el.classList.contains('password-toggle')) return;
				if (el.tagName.toLowerCase() === 'button') {
					if (enabled) el.removeAttribute('disabled'); else el.setAttribute('disabled', 'disabled');
				} else if (el.tagName.toLowerCase() === 'input') {
					if (enabled) el.removeAttribute('disabled'); else el.setAttribute('disabled', 'disabled');
				}
			});
			// toggle loading overlay
			const loader = document.getElementById('loginLoading');
			if (loader) loader.style.display = enabled ? 'none' : 'flex';
		} catch (e) { /* ignore */ }
	})(false);
	loadRememberedUser();
	// Wait briefly for servers.json to populate, then enable controls or inform user
	waitForServers(5000).then(ready => {
		(function setLoginControlsEnabled(enabled) {
			try {
				const section = document.getElementById('signin');
				if (!section) return;
				const inputs = section.querySelectorAll('input, button');
				inputs.forEach(el => {
					if (el.classList && el.classList.contains('password-toggle')) return;
					if (el.tagName.toLowerCase() === 'button') {
						if (enabled) el.removeAttribute('disabled'); else el.setAttribute('disabled', 'disabled');
					} else if (el.tagName.toLowerCase() === 'input') {
						if (enabled) el.removeAttribute('disabled'); else el.setAttribute('disabled', 'disabled');
					}
				});
				// toggle loading overlay
				const loader = document.getElementById('loginLoading');
				if (loader) loader.style.display = enabled ? 'none' : 'flex';
			} catch (e) { /* ignore */ }
		})(ready);
		if (!ready) {
			showToast('Unable to reach API servers; try again later.', 'error');
		}
	});
}

	if (page === "register") populateSponsorFromQuery();

	if (page === "home") {
		// loadDashboardData now returns a promise
		initPromises.push(loadDashboardData());
	}

	if (page === "profile") {
		initPromises.push(loadDashboardData(true));
	}

	if (page === "wallet") {
		initPromises.push(loadWalletData());
	}

	if (page === "trade") {
		initPromises.push(loadTradeData());
	}

	if (page === "lockin") {
		attachLockinHandlers();
		initPromises.push(loadTradeData());
	}

	if (page === "team") {
		initPromises.push(loadTeamData());
	}

	// Return a promise that resolves when all init tasks settled (success or failure)
	if (!initPromises.length) return Promise.resolve();

	return Promise.allSettled(initPromises).then(() => { /* ready */ });

}


// ===============================
// LOGIN
// ===============================

function login() {

	const username = document.getElementById("username").value.trim();
	const password = document.getElementById("password").value;


	if (!username || !password) {

		showToast("Enter username and password", "error");
		return;

	}


	requestJson("login.php", {
		username: username,
		password: password
	})
		.then(data => {


			if (data.success) {
				window.__patSessionExpiredHandled = false;

				// Support both the current response and the nested response used by
				// earlier API deployments; save a normalized session identity.
				saveCurrentUser(
					data.user || data.profile || (data.data && (data.data.user || data.data.profile || data.data))
				);
				saveAuthToken(data);


				showToast("Login successful");


				setTimeout(() => {

					openPage("home");

				}, 800);


			} else {

				showToast(data.message, "error");

			}


		});

}


// ===============================
// REGISTER
// ===============================

function togglePassword(fieldId = 'password', iconId = null) {

	const pwd = document.getElementById(fieldId);
	let icon = null;
	if (iconId) {
		icon = document.getElementById(iconId);
	} else {
		icon = document.getElementById(fieldId + 'ToggleIcon');
	}
	if (!pwd) return;

	if (pwd.type === 'password') {
		pwd.type = 'text';
		if (icon) icon.textContent = 'visibility_off';
		if (icon) icon.setAttribute('aria-label', 'Hide password');
	} else {
		pwd.type = 'password';
		if (icon) icon.textContent = 'visibility';
		if (icon) icon.setAttribute('aria-label', 'Show password');
	}

}

function registerUser() {

	const fullname = document.getElementById("fullname").value.trim();
	const phone = document.getElementById("phone").value.trim();
	const password = document.getElementById("reg_password").value;
	const confirm = document.getElementById("confirm_password").value;
	const sponsor = document.getElementById("sponsor").value.trim();


	if (!fullname || !phone || !password) {

		showToast("Complete required fields", "error");
		return;

	}


	if (password !== confirm) {

		showToast("Password mismatch", "error");
		return;

	}


	requestJson("register.php", {
		full_name: fullname,
		phone: phone,
		password: password,
		sponsor: sponsor
	})
		.then(data => {


			if (data.success) {

				showToast("Account created");

				setTimeout(() => {

					openPage("login");

				}, 1000);


			} else {

				showToast(data.message, "error");

			}

		});

}


// ===============================
// REMEMBER USER
// ===============================

function loadRememberedUser() {

	const saved = localStorage.getItem(USERNAME_KEY) || localStorage.getItem(LEGACY_USERNAME_KEY);

	const input = document.getElementById("username");

	if (saved && input) input.value = saved;

}


// ===============================
// TOAST
// ===============================

function showToast(message, type = "success") {

	const old = document.querySelector(".toast");

	if (old) old.remove();


	const toast = document.createElement("div");

	toast.className = "toast " + type;

	toast.innerHTML = message;

	document.body.appendChild(toast);


	setTimeout(() => {

		toast.classList.add("show");

	}, 100);


	setTimeout(() => {

		toast.classList.remove("show");

		setTimeout(() => {

			toast.remove();

		}, 300);

	}, 3000);

}


// ===============================
// PRIME AUTONOMOUS CALCULATOR
// ===============================

function syncTradeAvailableBalance(wallet = {}) {
	const nextBalance = Number(wallet.available_balance || wallet.balance || tradePageState.availableBalance || 0);
	tradePageState.availableBalance = nextBalance;
	updateTradeBalanceUI();
	return nextBalance;
}

function updateTradeBalanceUI() {
	const noteEl = document.getElementById("tradeBalanceNote");
	const useBalanceCheckbox = document.getElementById("useAvailableBalance");
	const investmentInput = document.getElementById("investment");
	if (!noteEl) {
		return;
	}

	const amount = Number(investmentInput ? investmentInput.value : 0);
	const useAvailableBalance = Boolean(useBalanceCheckbox && useBalanceCheckbox.checked);
	const availableBalance = Number(tradePageState.availableBalance || 0);

	if (useAvailableBalance && amount >= 1000 && amount > availableBalance) {
		noteEl.textContent = "Insufficient balance for this amount";
		noteEl.style.color = "var(--danger)";
		return;
	}

	noteEl.textContent = "Available balance: " + formatCurrencyFull(availableBalance);
	noteEl.style.color = "#555";
}

function calculatePrimeAutonomous() {

	const investment = Number(
		document.getElementById("investment").value
	);

	const dailyEl = document.getElementById("daily");
	const totalEl = document.getElementById("total");

	if (!investment || investment < 1000) {
		if (dailyEl) dailyEl.innerText = "₱0";
		if (totalEl) totalEl.innerText = "₱0";
		return;
	}

	const rate = (tradeSettings.yieldPercent || 6) / 100;
	const daily = investment * rate;
	const total = daily * (tradeSettings.durationDays || 25);

	if (dailyEl) dailyEl.innerText =
		"₱" + daily.toLocaleString("en-US", {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		});

	if (totalEl) totalEl.innerText =
		"₱" + total.toLocaleString("en-US", {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		});

	updateTradeBalanceUI();

}

window.calculatePAT = calculatePrimeAutonomous;
window.calculatePrimeAutonomous = calculatePrimeAutonomous;


// ===============================
// AI INVESTMENT
// ===============================

function getPlanDisplayName(planName) {
	const planMap = {
		NEXUS: 'Zillow',
		ACCELERATOR: 'Zip Co.',
		INFINITY: 'Zurich'
	};
	return planMap[String(planName || '').toUpperCase()] || String(planName || 'Zillow');
}

function attachLockinHandlers() {
	const plans = document.querySelectorAll('.lockin-plan');
	const amountInput = document.getElementById('lockinAmount');
	const useAvailableBalanceInput = document.getElementById('useAvailableBalanceLockin');
	const selectedPlanEl = document.getElementById('lockinSelectedPlan');
	const projectedReturnEl = document.getElementById('lockinProjectedReturn');
	const windowEl = document.getElementById('lockinWindow');
	const balanceNoteEl = document.getElementById('lockinBalanceNote');
	const confirmBtn = document.getElementById('confirmLockinBtn');

	if (!plans.length || !amountInput) return;

	let activePlan = document.querySelector('.lockin-plan.is-selected') || plans[0];

	function updateLockinSummary() {
		const amount = Number(amountInput.value || 0);
		const availableBalance = Number(tradePageState.availableBalance || 0);
		const useAvailableBalance = Boolean(useAvailableBalanceInput && useAvailableBalanceInput.checked);
		const planEl = activePlan || plans[0];
		const planName = planEl.dataset.plan || 'NEXUS';
		const percent = Number(planEl.dataset.percent || 0);
		const days = Number(planEl.dataset.days || 0);
		const release = amount * (percent / 100);
		const total = amount + release;
		const remainingBalance = availableBalance;

		if (selectedPlanEl) selectedPlanEl.textContent = getPlanDisplayName(planName);
		if (windowEl) windowEl.textContent = days + ' Days • ' + percent + '%';
		if (projectedReturnEl) {
			projectedReturnEl.textContent = '₱' + total.toLocaleString('en-US', {
				minimumFractionDigits: 2,
				maximumFractionDigits: 2
			});
		}
		if (balanceNoteEl) {
			balanceNoteEl.textContent = 'Remaining balance: ' + formatCurrencyFull(remainingBalance);
			balanceNoteEl.style.color = '#555';
		}
		if (useAvailableBalanceInput && useAvailableBalance) {
			useAvailableBalanceInput.parentElement.style.borderColor = 'rgba(43, 217, 138, 0.5)';
		} else if (useAvailableBalanceInput) {
			useAvailableBalanceInput.parentElement.style.borderColor = '';
		}
	}

	plans.forEach(plan => {
		plan.addEventListener('click', () => {
			activePlan = plan;
			plans.forEach(item => item.classList.toggle('is-selected', item === plan));
			updateLockinSummary();
		});
	});

	amountInput.addEventListener('input', updateLockinSummary);
	if (useAvailableBalanceInput) {
		useAvailableBalanceInput.addEventListener('change', updateLockinSummary);
	}
	if (confirmBtn) {
		confirmBtn.addEventListener('click', lockInNow);
	}
	updateLockinSummary();

	if (window.__lockinSummaryRefresh) {
		window.__lockinSummaryRefresh = updateLockinSummary;
	}
	window.__lockinSummaryRefresh = updateLockinSummary;
}

function isRequestSuccess(response) {
	if (!response || typeof response !== 'object') {
		return false;
	}
	if (response.success === true) return true;
	if (response.status === 'success') return true;
	if (response.ok === true) return true;
	if (response.data && typeof response.data === 'object' && response.data.success === true) return true;
	return false;
}

function lockInNow() {
	const user = getCurrentUser();
	const amountInput = document.getElementById('lockinAmount');
	const useAvailableBalanceInput = document.getElementById('useAvailableBalanceLockin');
	const selectedPlanEl = document.querySelector('.lockin-plan.is-selected');

	if (!user || !user.id) {
		showToast('Please log in first', 'error');
		return;
	}

	if (!selectedPlanEl) {
		showToast('Please select a lock-in engine', 'error');
		return;
	}

	const amount = Number(amountInput ? amountInput.value : 0);
	const useAvailableBalance = Boolean(useAvailableBalanceInput && useAvailableBalanceInput.checked);
	const percent = Number(selectedPlanEl.dataset.percent || 0);
	const days = Number(selectedPlanEl.dataset.days || 0);
	const planName = selectedPlanEl.dataset.plan || 'NEXUS';
	const releaseAmount = amount * (percent / 100);
	const totalAmount = amount + releaseAmount;

	if (!amount || amount < 500) {
		showToast('Minimum lock-in amount is ₱500', 'error');
		return;
	}

	if (!useAvailableBalance) {
		showToast('Redirecting to PayMongo checkout...');
		return requestJson('paymongo.php', {
			amount: amount,
			currency: 'PHP',
			description: 'Zenith Lock-In - ' + getPlanDisplayName(planName) + ' Engine - ' + formatCurrencyFull(amount),
			payment_method_types: ['qrph'],
			success_url: window.location.href + '?lockin=success',
			cancel_url: window.location.href + '?lockin=cancel',
			return_url: window.location.href + '?lockin=success',
			redirect_url: window.location.href + '?lockin=success',
			test_mode: false,
			metadata: {
				user_id: String(user.id),
				source: 'zenith_lockin',
				plan: getPlanDisplayName(planName),
				percent: String(percent),
				days: String(days)
			}
		})
			.then(data => {
				if (!isRequestSuccess(data)) {
					showToast(data && data.message ? data.message : 'Unable to start lock-in payment', 'error');
					return;
				}

				const redirectUrl = data.checkout_url || data.url;
				if (redirectUrl) {
					window.location.href = redirectUrl;
				} else {
					showToast('Payment link URL was not returned', 'error');
				}
			})
			.catch(() => {
				showToast('Unable to start lock-in payment', 'error');
			});
	}

	if (tradePageState.availableBalance < amount) {
		showToast('Insufficient available balance', 'error');
		return;
	}

	showToast('Processing lock-in with available balance...');

	return requestJson('lockin.php', {
		amount: amount,
		plan: planName,
		percent: percent,
		days: days,
		release_amount: releaseAmount,
		total_amount: totalAmount,
		use_available_balance: true
	})
		.then(response => {
			if (!isRequestSuccess(response)) {
				showToast(response && response.message ? response.message : 'Unable to create lock-in', 'error');
				return;
			}

			tradePageState.availableBalance = Math.max(0, tradePageState.availableBalance - amount);
			if (typeof window.__lockinSummaryRefresh === 'function') {
				window.__lockinSummaryRefresh();
			}

			showToast(response.message || 'Lock-in created successfully');
			if (response.account_activated || response.data && response.data.account_activated) {
				try {
					const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') || {};
					stored.status = 'active';
					localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
				} catch (e) { /* ignore */ }
				if (typeof window.__lockinSummaryRefresh === 'function') {
					window.__lockinSummaryRefresh();
				}
				loadDashboardData().catch(() => {
					setTimeout(() => openPage("home"), 200);
				});
			}
			setTimeout(() => {
				openPage("home");
			}, 200);
		})
		.catch(() => {
			showToast('Unable to create lock-in', 'error');
		});
}

function tradeNow() {
	const user = getCurrentUser();
	const investmentInput = document.getElementById("investment");
	const useBalanceCheckbox = document.getElementById("useAvailableBalance");
	const amount = Number(investmentInput ? investmentInput.value : 0);
	const useAvailableBalance = Boolean(useBalanceCheckbox && useBalanceCheckbox.checked);

	if (!user || !user.id) {
		showToast("Please log in first", "error");
		return;
	}

	if (!amount || amount < 1000) {
		showToast("Minimum trade amount is ₱1000", "error");
		return;
	}

	if (useAvailableBalance) {
		if (tradePageState.availableBalance < amount) {
			showToast("Insufficient available balance", "error");
			return;
		}

		showToast("Activating trade with available balance...");
		requestJson("trade.php", {
				amount: amount,
				use_available_balance: true
			})
			.then(data => {
				if (!isRequestSuccess(data)) {
					showToast(data && data.message ? data.message : "Unable to activate trade", "error");
					return;
				}
				tradePageState.availableBalance = Math.max(0, tradePageState.availableBalance - amount);
				updateTradeBalanceUI();
				showToast("Trade activated successfully");
				// If API indicates account activation, update local session and refresh dashboard
				if (data && (data.account_activated || data.data && data.data.account_activated)) {
					try {
						const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') || {};
						stored.status = 'active';
						localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
					} catch (e) { /* ignore */ }
					loadDashboardData().catch(() => {
						setTimeout(() => openPage("home"), 200);
					});
				}
				setTimeout(() => {
					openPage("home");
				}, 200);
			})
			.catch(() => {
				showToast("Unable to activate trade", "error");
			});
		return;
	}

	showToast("Redirecting to checkout...");

	requestJson("paymongo.php", {
		amount: amount,
		currency: "PHP",
		description: "Zenith Trade Activation - " + (user.full_name || "Trader"),
		payment_method_types: ["qrph"],
		success_url: window.location.href + "?trade=success",
		cancel_url: window.location.href + "?trade=cancel",
		return_url: window.location.href + "?trade=success",
		redirect_url: window.location.href + "?trade=success",
		test_mode: false
	})
		.then(data => {
			if (!data.success) {
				showToast(data.message || "Unable to start trade", "error");
				return;
			}

			const redirectUrl = data.checkout_url || data.url;
			if (redirectUrl) {
				window.location.href = redirectUrl;
			} else {
				showToast("Payment link URL was not returned", "error");
			}
		})
		.catch(() => {
			showToast("Unable to start trade", "error");
		});
}

function startAIInvestment() {

	showToast("AI Trade Started");

}

function loadTeamData() {
	const user = getCurrentUser();
	if (!user || !user.id) {
		return Promise.reject(new Error('no-user'));
	}

	return requestJson("team.php", {})
		.then((response) => {
			if (!response || !response.success) {
				return;
			}

			const teamEarningsBalance = document.getElementById("teamEarningsBalance");
			if (teamEarningsBalance) {
				teamEarningsBalance.textContent = formatCurrency(Number(response.team_earnings || 0));
			}

			const teamEarningsGain = document.getElementById("teamEarningsGain");
			if (teamEarningsGain) {
				teamEarningsGain.textContent = Number(response.team_earnings || 0) > 0
					? "Network Growing"
					: "Start building your team";
			}

			const leadershipBonusValue = document.getElementById("leadershipBonusValue");
			if (leadershipBonusValue) {
				leadershipBonusValue.textContent = formatCurrency(Number(response.leadership_bonus || 0));
			}

			const leadershipRankValue = document.getElementById("leadershipRankValue");
			if (leadershipRankValue) {
				leadershipRankValue.textContent = response.leadership_rank || "Unranked";
			}

			const activeReferralCountValue = document.getElementById("activeReferralCount");
			if (activeReferralCountValue) {
				activeReferralCountValue.textContent = String(Number(response.active_direct_referrals || 0));
			}

			const personalInvestmentValue = document.getElementById("personalInvestmentValue");
			if (personalInvestmentValue) {
				personalInvestmentValue.textContent = formatCurrency(Number(response.personal_investment || 0));
			}

			const directReferralTeamSalesValue = document.getElementById("directReferralTeamSalesValue");
			if (directReferralTeamSalesValue) {
				directReferralTeamSalesValue.textContent = formatCurrency(Number(response.direct_referral_team_sales || 0));
			}

			const leadershipQualificationStatus = document.getElementById("leadershipQualificationStatus");
			if (leadershipQualificationStatus) {
				const activeCount = Number(response.active_direct_referrals || 0);
				const personalInvestment = Number(response.personal_investment || 0);
				const teamSales = Number(response.direct_referral_team_sales || 0);
				const qualified = Boolean(response.leadership_qualified);

				leadershipQualificationStatus.className = 'leadership-status ' + (qualified ? 'leadership-status--qualified' : 'leadership-status--pending');
				leadershipQualificationStatus.innerHTML = '';

				const icon = document.createElement('span');
				icon.className = 'material-symbols-rounded leadership-status-icon';
				icon.setAttribute('aria-hidden', 'true');
				icon.textContent = qualified ? 'workspace_premium' : 'pending';

				const copy = document.createElement('span');
				copy.className = 'leadership-status-copy';

				if (qualified) {
					copy.textContent = `Leadership qualified for ${response.leadership_rank}`;
				} else {
					const missing = [];
					if (activeCount < 10) {
						missing.push(`${10 - activeCount} active referral${activeCount === 9 ? '' : 's'}`);
					}
					if (personalInvestment < 10000) {
						missing.push(`${formatCurrency(10000 - personalInvestment)} personal investment`);
					}
					if (teamSales < 100000) {
						missing.push(`${formatCurrency(100000 - teamSales)} team sales`);
					}
					copy.textContent = missing.length > 0
						? `Needs ${missing.join(', ')} to qualify.`
						: 'Leadership qualification pending.';
				}

				leadershipQualificationStatus.appendChild(icon);
				leadershipQualificationStatus.appendChild(copy);
			}

			for (let level = 1; level <= 5; level++) {
				const levelValue = document.getElementById("level" + level + "Value");
				const levelMeta = document.getElementById("level" + level + "Meta");
				const levelData = response.levels && response.levels[level - 1];
				if (levelValue) {
					levelValue.textContent = levelData ? formatPercent(Number(levelData.value || 0)) : "0.00%";
				}
				if (levelMeta) {
					const count = levelData ? Number(levelData.count || 0) : 0;
					const earnings = levelData ? Number(levelData.earnings || 0) : 0;
					levelMeta.textContent = `(${count} referral${count !== 1 ? 's' : ''} • ${formatCurrency(earnings)})`;
					levelMeta.style.cursor = 'pointer';
					// attach click to load members for this level (paginated)
					levelMeta.onclick = () => {
					    loadTeamMembers(level, 1);
					};
				}
			}

			// Compute and display progress bars for leadership tiers
			(function() {
				const teamSales = Number(response.direct_referral_team_sales || 0);
				const thresholds = {
					'Bronze': 100000,
					'Silver': 200000,
					'Gold': 300000,
					'Platinum': 500000,
					'Diamond': 1000000
				};

				Object.keys(thresholds).forEach(rank => {
					const item = document.querySelector('.leadership-rank-item[data-rank="' + rank + '"]');
					const progress = item ? item.querySelector('.progress') : null;
					if (progress) {
					    const pct = Math.min(100, Math.round((teamSales / thresholds[rank]) * 100));
					    const inner = progress.querySelector('div');
					    if (inner) {
					        // If fully achieved, lock at 100% and remove animations
					        if (pct >= 100) {
					            inner.style.width = '100%';
					            progress.classList.add('completed');
					            inner.style.animation = 'none';
					        } else {
					            inner.style.width = pct + '%';
					            progress.classList.remove('completed');
					            inner.style.animation = '';
					        }
					    }
					    // remove any existing tier classes then add the current tier class
					    progress.classList.remove('progress--bronze','progress--silver','progress--gold','progress--platinum','progress--diamond');
					    progress.classList.add('progress--' + rank.toLowerCase());
					}
				});
			})();

			// attach handler to totals area (if any) to show combined referrals
			const teamCard = document.querySelector('.card.portfolio');
			if (teamCard) {
				teamCard.onclick = () => {
					// Show aggregate (level 0) list could be implemented if desired
				};
			}
		})
		.catch(() => {
			console.error("Unable to load team data.");
		});
}


// Load paginated members for a level and show a modal with names (full name only)
function loadTeamMembers(level, page) {
	const user = getCurrentUser();
	if (!user || !user.id) return;

	const perPage = 25; // chosen by you

	requestJson('team.php', { list_level: level, page: page, per_page: perPage })
		.then(resp => {
			if (!resp || !resp.success) return;
			const members = resp.members || [];
			const total = resp.total || 0;
			showMembersModal(level, members, total, resp.page || 1, resp.per_page || perPage);
		})
		.catch(() => {
			console.error('Unable to load members');
		});
}

function showMembersModal(level, members, total, page, perPage) {
	// remove existing modal if any
	const existing = document.getElementById('teamMembersModal');
	if (existing) existing.remove();

	const overlay = document.createElement('div');
	overlay.id = 'teamMembersModal';
	overlay.className = 'team-modal-overlay';
	overlay.setAttribute('aria-hidden', 'false');
	overlay.onclick = (event) => {
		if (event.target === overlay) {
			overlay.remove();
			document.body.classList.remove('modal-open');
		}
	};

	const box = document.createElement('div');
	box.className = 'team-modal-card';
	box.setAttribute('role', 'dialog');
	box.setAttribute('aria-modal', 'true');

	const header = document.createElement('div');
	header.className = 'team-modal-header';
	const title = document.createElement('h3');
	title.textContent = `Level ${level} Referrals (${total})`;
	const close = document.createElement('button');
	close.type = 'button';
	close.className = 'modal-close';
	close.setAttribute('aria-label', 'Close');
	close.textContent = '×';
	close.onclick = () => {
		overlay.remove();
		document.body.classList.remove('modal-open');
	};
	header.appendChild(title);
	header.appendChild(close);
	box.appendChild(header);

	const body = document.createElement('div');
	body.className = 'team-modal-body';

	if (!members.length) {
		const empty = document.createElement('div');
		empty.className = 'empty-state';
		empty.textContent = 'No referrals found for this level.';
		body.appendChild(empty);
	} else {
		const ul = document.createElement('ul');
		ul.className = 'team-member-list';
		members.forEach(m => {
			const li = document.createElement('li');
			li.className = 'team-member-row';

			const name = document.createElement('span');
			name.className = 'member-name';
			name.textContent = m.full_name || 'Unknown';

			const status = document.createElement('span');
			status.className = 'team-member-status';
			const rawStatus = String((m && m.status) || 'unknown').trim().toLowerCase();
			const normalized = rawStatus ? rawStatus : 'unknown';
			const statusIcon = document.createElement('span');
			statusIcon.className = 'material-symbols-rounded team-member-status-icon';
			statusIcon.setAttribute('aria-hidden', 'true');

			if (normalized === 'active') {
				status.classList.add('is-active');
				statusIcon.textContent = 'check_circle';
			} else if (normalized === 'inactive') {
				status.classList.add('is-inactive');
				statusIcon.textContent = 'pause_circle';
			} else if (normalized === 'suspended' || normalized === 'cancelled' || normalized === 'blocked') {
				status.classList.add('is-blocked');
				statusIcon.textContent = 'block';
			} else {
				status.classList.add('is-inactive');
				statusIcon.textContent = 'pause_circle';
			}

			status.appendChild(statusIcon);

			li.appendChild(name);
			li.appendChild(status);
			ul.appendChild(li);
		});
		body.appendChild(ul);

		const legend = document.createElement('div');
		legend.className = 'team-member-legend';
		legend.innerHTML = '<div class="team-member-legend-title">Status Legend</div>' +
			'<div class="team-member-legend-items">' +
			' <span class="team-member-legend-item"><span class="material-symbols-rounded team-member-status-icon is-active-icon">check_circle</span> Active</span>' +
			' <span class="team-member-legend-item"><span class="material-symbols-rounded team-member-status-icon is-inactive-icon">pause_circle</span> Inactive</span>' +
			'<span class="team-member-legend-item"><span class="material-symbols-rounded team-member-status-icon is-blocked-icon">block</span> Blocked</span>' +
			'</div>';
		body.appendChild(legend);
	}

	const totalPages = Math.max(1, Math.ceil(total / perPage));
	const controls = document.createElement('div');
	controls.className = 'team-modal-pagination';

	const prev = document.createElement('button');
	prev.type = 'button';
	prev.className = 'nav-button';
	prev.textContent = 'Prev';
	prev.disabled = page <= 1;
	prev.onclick = () => {
		const newPage = Math.max(1, page - 1);
		loadTeamMembers(level, newPage);
		overlay.remove();
		document.body.classList.remove('modal-open');
	};

	const next = document.createElement('button');
	next.type = 'button';
	next.className = 'nav-button';
	next.textContent = 'Next';
	next.disabled = page >= totalPages;
	next.onclick = () => {
		const newPage = Math.min(totalPages, page + 1);
		loadTeamMembers(level, newPage);
		overlay.remove();
		document.body.classList.remove('modal-open');
	};

	const info = document.createElement('div');
	info.className = 'page-info';
	info.textContent = `Page ${page} / ${totalPages}`;
	controls.appendChild(prev);
	controls.appendChild(info);
	controls.appendChild(next);
	body.appendChild(controls);

	const footer = document.createElement('div');
	footer.className = 'team-modal-footer';
	const closeFooter = document.createElement('button');
	closeFooter.type = 'button';
	closeFooter.className = 'close-button';
	closeFooter.textContent = 'Close';
	closeFooter.onclick = () => {
		overlay.remove();
		document.body.classList.remove('modal-open');
	};
	footer.appendChild(closeFooter);

	box.appendChild(body);
	box.appendChild(footer);
	overlay.appendChild(box);
	document.body.appendChild(overlay);
	document.body.classList.add('modal-open');
}

// -----------------------------
// Referral ledger (payouts)
// -----------------------------
function loadReferralLedger(page = 1) {
	const user = getCurrentUser();
	if (!user || !user.id) return;

	const perPage = 25;

	requestJson('team.php', { ledger: true, page: page, per_page: perPage })
		.then(resp => {
			if (!resp || !resp.success) return;
			const items = resp.items || [];
			const total = resp.total || 0;
			showReferralLedgerModal(items, total, resp.page || 1, resp.per_page || perPage);
		})
		.catch(() => console.error('Unable to load referral ledger'));
}

function showReferralLedgerModal(items, total, page, perPage) {
	const existing = document.getElementById('referralLedgerModal');
	if (existing) existing.remove();

	const overlay = document.createElement('div');
	overlay.id = 'referralLedgerModal';
	overlay.className = 'team-modal-overlay';
	overlay.setAttribute('aria-hidden', 'false');
	overlay.onclick = (event) => {
		if (event.target === overlay) {
			overlay.remove();
			document.body.classList.remove('modal-open');
		}
	};

	const box = document.createElement('div');
	box.className = 'team-modal-card team-modal-card--wide';
	box.setAttribute('role', 'dialog');
	box.setAttribute('aria-modal', 'true');

	const header = document.createElement('div');
	header.className = 'team-modal-header';
	const title = document.createElement('h3');
	title.textContent = `Referral Payouts (${total})`;
	const close = document.createElement('button');
	close.type = 'button';
	close.className = 'modal-close';
	close.setAttribute('aria-label', 'Close');
	close.textContent = '×';
	close.onclick = () => {
		overlay.remove();
		document.body.classList.remove('modal-open');
	};
	header.appendChild(title);
	header.appendChild(close);
	box.appendChild(header);

	const body = document.createElement('div');
	body.className = 'team-modal-body';

	if (!items.length) {
		const empty = document.createElement('div');
		empty.className = 'empty-state';
		empty.textContent = 'No referral payouts found.';
		body.appendChild(empty);
	} else {
		const table = document.createElement('table');
		table.className = 'team-modal-table';
		const thead = document.createElement('thead');
		const headerRow = document.createElement('tr');
		['Date','From','Level','Percent','Amount'].forEach(h => {
			const th = document.createElement('th');
			th.textContent = h;
			headerRow.appendChild(th);
		});
		thead.appendChild(headerRow);
		table.appendChild(thead);

		const tbody = document.createElement('tbody');
		items.forEach(it => {
			const tr = document.createElement('tr');
			['created_at','referred_name','level','percentage','amount'].forEach((key, idx) => {
				const td = document.createElement('td');
				let text = '';
				switch(key) {
					case 'created_at': text = it.created_at || ''; break;
					case 'referred_name': text = it.referred_name || (it.referred_user_id ? 'User #' + it.referred_user_id : '-'); break;
					case 'level': text = it.level ? 'L' + it.level : '-'; break;
					case 'percentage': text = (it.percentage !== null && it.percentage !== undefined) ? (Number(it.percentage).toFixed(2) + '%') : '-'; break;
					case 'amount': text = formatCurrency(Number(it.amount || 0)); break;
				}
				td.textContent = text;
				tr.appendChild(td);
			});
			tbody.appendChild(tr);
		});
		table.appendChild(tbody);
		body.appendChild(table);
	}

	const totalPages = Math.max(1, Math.ceil(total / perPage));
	const controls = document.createElement('div');
	controls.className = 'team-modal-pagination';

	const prev = document.createElement('button');
	prev.type = 'button';
	prev.className = 'nav-button';
	prev.textContent = 'Prev';
	prev.disabled = page <= 1;
	prev.onclick = () => {
		loadReferralLedger(Math.max(1, page - 1));
		overlay.remove();
		document.body.classList.remove('modal-open');
	};

	const next = document.createElement('button');
	next.type = 'button';
	next.className = 'nav-button';
	next.textContent = 'Next';
	next.disabled = page >= totalPages;
	next.onclick = () => {
		loadReferralLedger(Math.min(totalPages, page + 1));
		overlay.remove();
		document.body.classList.remove('modal-open');
	};

	const info = document.createElement('div');
	info.className = 'page-info';
	info.textContent = `Page ${page} / ${totalPages}`;
	controls.appendChild(prev);
	controls.appendChild(info);
	controls.appendChild(next);
	body.appendChild(controls);

	const footer = document.createElement('div');
	footer.className = 'team-modal-footer';
	const closeFooter = document.createElement('button');
	closeFooter.type = 'button';
	closeFooter.className = 'close-button';
	closeFooter.textContent = 'Close';
	closeFooter.onclick = () => {
		overlay.remove();
		document.body.classList.remove('modal-open');
	};
	footer.appendChild(closeFooter);

	box.appendChild(body);
	box.appendChild(footer);
	overlay.appendChild(box);
	document.body.appendChild(overlay);
	document.body.classList.add('modal-open');
}

// hook referral ledger button when team page loads
(function attachTeamPageHandlers() {
	document.addEventListener('click', function (e) {
		if (e.target && e.target.id === 'viewReferralLedgerBtn') {
			loadReferralLedger(1);
		}
	});
})();

// ===============================
// AI ANIMATION
// ===============================

function startAIAnimation(active = false, initialProgress = 44, initialLabel = "Awaiting first trade activation...", tradeCount = 1) {

	const progressFill = document.getElementById("aiProgressFill");
	const progressLabel = document.getElementById("aiProgressLabel");
	const progressValue = document.getElementById("aiProgressValue");
	const pulse = document.getElementById("aiStatusPill");

	if (!progressFill) return;

	if (aiStatusInterval) {
		clearInterval(aiStatusInterval);
		aiStatusInterval = null;
	}

	if (!active) {
		if (progressLabel) progressLabel.textContent = initialLabel;
		if (progressValue) progressValue.textContent = initialProgress + "%";
		if (progressFill) progressFill.style.width = initialProgress + "%";
		if (pulse) {
			pulse.classList.remove("ai-status-pill--active", "ai-status-pill--standby");
			pulse.classList.add("ai-status-pill--standby");
			pulse.textContent = "AWAITING TRADE";
		}
		return;
	}

	let progress = initialProgress;
	let stageIndex = 0;
	const stages = [
		"Executing growth strategy...",
		"Evaluating momentum and risk...",
		"Preparing trade execution...",
		"Syncing portfolio strategy..."
	];

	const updateStage = () => {
		const stage = stages[stageIndex % stages.length];
		progress = Math.min(96, progress + (stageIndex % 2 === 0 ? 6 : 4));

		if (progressLabel) {
			progressLabel.textContent = stage;
		}
		if (progressValue) progressValue.textContent = progress + "%";
		if (progressFill) {
			progressFill.style.width = progress + "%";
			progressFill.style.transform = 'translateX(0)';
		}
		if (pulse) {
			pulse.classList.remove("ai-status-pill--active", "ai-status-pill--standby");
			pulse.classList.add("ai-status-pill--active");
			pulse.textContent = "ENGINE ACTIVE";
		}

		stageIndex += 1;
	};

	updateStage();
	aiStatusInterval = setInterval(updateStage, 1800);
}


// ===============================
// PORTFOLIO COUNTER
// ===============================

function startPortfolioCounter(target) {

	const display = document.getElementById("portfolioAmount");

	if (!display) return;

	let value = 0;
	const finalValue = Number(target) || 0;

	if (finalValue <= 0) {
		display.textContent = "₱0.00";
		return;
	}

	const timer = setInterval(() => {

		value += Math.max(finalValue / 30, 1);

		if (value >= finalValue) {

			value = finalValue;
			clearInterval(timer);

		}

		display.textContent = "₱" + value.toLocaleString("en-US", {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		});

	}, 20);

}

function logoutUser() {
	window.__patSessionExpiredHandled = false;
	// Start the request before clearing the token so token-only WebViews can end
	// their server session as well.
	const logoutRequest = requestJson("logout.php", {});
	localStorage.removeItem(STORAGE_KEY);
	localStorage.removeItem(AUTH_TOKEN_KEY);
	logoutRequest
		.catch(() => {
			// Ignore logout failures and proceed to the login screen.
		});
	showToast("Logged out");
	setTimeout(() => {
		openPage("login");
	}, 800);
}

function populateSponsorFromQuery() {
	const params = new URLSearchParams(window.location.search);
	const referralCode = params.get("ref");
	const sponsorInput = document.getElementById("sponsor");

	if (sponsorInput && referralCode) {
		sponsorInput.value = referralCode;
	}
}

function copyReferralLink() {
	const input = document.getElementById("referralLinkInput");
	if (!input) return;

	input.select();
	input.setSelectionRange(0, input.value.length);

	navigator.clipboard.writeText(input.value)
		.then(() => showToast("Referral link copied"))
		.catch(() => showToast("Copy failed", "error"));
}

function copyReferralCode() {
	// Try to read referral code from profileRole text (formatted like "Referral Code: XYZ")
	const profileRole = document.getElementById("profileRole");
	let code = "";
	if (profileRole) {
		const txt = (profileRole.textContent || "").trim();
		const parts = txt.split(":");
		if (parts.length > 1) {
			code = parts.slice(1).join(":").trim();
		} else {
			code = txt;
		}
	}
	if (!code) {
		const user = getCurrentUser();
		if (user && user.referral_code) code = user.referral_code;
	}
	if (!code) {
		showToast("No referral code available", "error");
		return;
	}

	navigator.clipboard.writeText(code)
		.then(() => showToast("Referral code copied"))
		.catch(() => showToast("Copy failed", "error"));
}

function loadDashboardData(isProfilePage = false) {
	const user = getCurrentUser();

	if (!user || !user.id) {
		showToast("Please log in first", "error");
		setTimeout(() => openPage("login"), 800);
		return Promise.reject(new Error('no-user'));
	}

	return requestJson("dashboard.php", {})
		.then(data => {
			if (!data.success) {
				showToast(data.message || "Unable to load dashboard", "error");
				return;
			}

			const stats = data.stats || {};
			const userInfo = data.user || {};
			const lockinCount = Array.isArray(stats.lockins) ? stats.lockins.length : 0;
			const lockinModeText = document.getElementById("lockinModeText");
			const lockinStatusBadge = document.getElementById("lockinStatusBadge");
			if (lockinModeText) {
				lockinModeText.textContent = lockinCount ? "Lock-in Mode" : "Lock-in Mode";
			}
			if (lockinStatusBadge) {
				lockinStatusBadge.textContent = `${lockinCount} ACTIVE`;
			}

			const portfolioDisplay = document.getElementById("portfolioAmount");
			if (portfolioDisplay) {
				startPortfolioCounter(Number(stats.portfolio_amount || 0));
			}

			const portfolioGain = document.getElementById("portfolioGain");
			if (portfolioGain) {
				const gainValue = Number(stats.computed_gain || 0);
				const gainPrefix = gainValue >= 0 ? "+" : "-";
				const isPositive = gainValue >= 0;
				portfolioGain.classList.toggle("is-negative", !isPositive);
				// Use full peso formatting (no K/M) and lime color for positive gains
				portfolioGain.style.color = isPositive ? "#a3e635" : "rgba(255,255,255,0.78)";
				let gainHtml = '<span class="material-symbols-rounded" aria-hidden="true">trending_up</span> ' + gainPrefix + formatCurrencyFull(Math.abs(gainValue)) + " Gain";
				if (typeof stats.computed_gain_pct !== 'undefined' && stats.computed_gain_pct !== null) {
					gainHtml += ' <small class="gain-pct">(' + String(Number(stats.computed_gain_pct || 0).toFixed(2)) + "% ROI)</small>";
				}
				portfolioGain.innerHTML = gainHtml;
				}

			const welcomeName = document.getElementById("welcomeName");
			if (welcomeName) {
				welcomeName.textContent = "Welcome, " + (userInfo.full_name || "Trader");
			}

			const profileInitial = document.getElementById("profileInitial");
			if (profileInitial) {
				profileInitial.textContent = (userInfo.full_name || "P").charAt(0).toUpperCase();
			}

			const profileName = document.getElementById("profileName");
			if (profileName) {
				profileName.textContent = userInfo.full_name || "User";
			}

			const profileRole = document.getElementById("profileRole");
			if (profileRole) {
				profileRole.textContent = "Referral Code: " + (userInfo.referral_code || "N/A");
			}

			const profileStatus = document.getElementById("profileStatus");
			if (profileStatus) {
				// Consider lockins and other activity flags in addition to trades so profile reflects actual activation.
				const hasActive = Boolean(stats && (stats.has_trade || stats.has_lockin || Number(stats.active_lockins_count || 0) > 0 || stats.is_active));
				let statusText = "INACTIVE MEMBER";
				let statusColor = "var(--danger)";

				if (hasActive) {
					statusText = "ACTIVE MEMBER";
					statusColor = "var(--primary)";
				}

				profileStatus.textContent = statusText;
				profileStatus.style.color = statusColor;
			}

			const detailFullName = document.getElementById("detailFullName");
			if (detailFullName) {
				detailFullName.textContent = userInfo.full_name || "-";
			}

			const detailPhone = document.getElementById("detailPhone");
			if (detailPhone) {
				detailPhone.textContent = userInfo.phone || "-";
			}


			const detailSponsor = document.getElementById("detailSponsor");
			if (detailSponsor) {
				detailSponsor.textContent = userInfo.sponsor_name || "-";
			}

			const referralLinkInput = document.getElementById("referralLinkInput");
			if (referralLinkInput) {
				const referralCode = userInfo.referral_code || "";
				referralLinkInput.value = referralCode
					? window.location.origin + "/index.html?ref=" + referralCode
					: "";
			}

			if (!isProfilePage) {
				const planLabel = document.getElementById("planInfo");
				if (planLabel) {
					planLabel.textContent = "AI Confidence " + (stats.ai_confidence || 96) + "% • " + (stats.plan_name || "Zenith");
				}


				const homeStatusBadge = document.getElementById("homeStatusBadge");
				const homeEngineStatusBadge = document.getElementById("homeEngineStatusBadge");
				const homeModeText = document.getElementById("homeModeText");
				// Consider lockins and other activity flags in addition to trades so the badge reflects account activation.
				const hasActive = Boolean(stats && (stats.has_trade || stats.has_lockin || Number(stats.active_lockins_count || 0) > 0 || stats.is_active));
				const statusLabel = hasActive ? "ACTIVE" : "INACTIVE";
				const statusColor = hasActive ? "var(--primary)" : "var(--danger)";
				const statusBackground = hasActive ? "rgba(0, 177, 79, 0.14)" : "rgba(229, 57, 53, 0.12)";
				if (homeStatusBadge) {
					homeStatusBadge.textContent = statusLabel;
					homeStatusBadge.style.color = statusColor;
					homeStatusBadge.style.backgroundColor = statusBackground;
				}
				if (homeEngineStatusBadge) {
					homeEngineStatusBadge.textContent = statusLabel;
					homeEngineStatusBadge.style.color = statusColor;
					homeEngineStatusBadge.style.backgroundColor = statusBackground;
				}
				if (homeModeText) {
					homeModeText.textContent = hasActive ? "Zenith Mode Running" : "Zenith Mode Inactive";
				}
			}
		});
}

function loadTradeData() {
	const user = getCurrentUser();

	if (!user || !user.id) {
		return Promise.reject(new Error('no-user'));
	}

	return requestJson("dashboard.php", {})
		.then(data => {
			if (!data.success) return;

			const stats = data.stats || {};
			const wallet = data.wallet || {};
			tradeSettings = {
				yieldPercent: Number(stats.daily_yield || 6),
				durationDays: Number(stats.days_cycle || 25)
			};
			syncTradeAvailableBalance(wallet);
			if (typeof window.__lockinSummaryRefresh === 'function') {
				window.__lockinSummaryRefresh();
			}

			const yieldLabel = document.getElementById("tradeYieldValue");
			if (yieldLabel) {
				yieldLabel.textContent = (tradeSettings.yieldPercent || 6) + "%";
			}

			const cycleLabel = document.getElementById("tradeCycleLabel");
			if (cycleLabel) {
				cycleLabel.textContent = (tradeSettings.durationDays || 25) + " Day Return";
			}

			const planInfo = document.getElementById("tradePlanInfo");
			if (planInfo) {
				planInfo.textContent = (stats.plan_name || "Zenith") + " • Min ₱" + Number(stats.plan_amount || 1000).toLocaleString("en-US");
			}

			// Populate hero stats: support both trade and lockin pages. Currency fields use formatCurrencyFull().
			try {
				const tradedEl = document.getElementById('tradedTotal');
				const activeEl = document.getElementById('activeTrades');
				const countEl = document.getElementById('tradeCount');
				const dailyEl = document.getElementById('dailyIncome');

				const lockinsTotalEl = document.getElementById('lockinsTotal');
				const activeLockinsEl = document.getElementById('activeLockins');
				const lockinCountEl = document.getElementById('lockinCount');
				const projectedEl = document.getElementById('projectedAmount');

				const tradedVal = Number(stats.traded || stats.total_traded || stats.trades_total || stats.total_trades || stats.lockins_total || 0);
				const activeVal = Number(stats.active_trade || stats.active_trades_value || stats.active_trades_amount || stats.active_invested || stats.active_lockins_amount || 0);
				const tradeCountVal = Number(stats.trade_count || stats.trades_count || stats.total_trades_count || stats.trades || stats.lockin_count || stats.lockins_count || 0);
				const dailyIncomeVal = Number(stats.daily_income || stats.daily_profit || stats.trade_daily_income || stats.projected_daily || stats.projected_income || 0);

				const tradedText = formatCurrencyFull(tradedVal);
				const activeText = formatCurrencyFull(activeVal);
				const dailyText = formatCurrencyFull(dailyIncomeVal);
				const countText = String(tradeCountVal);

				if (tradedEl) tradedEl.textContent = tradedText;
				if (activeEl) activeEl.textContent = activeText;
				if (countEl) countEl.textContent = countText;
				if (dailyEl) dailyEl.textContent = dailyText;

				if (lockinsTotalEl) lockinsTotalEl.textContent = tradedText;
				if (activeLockinsEl) activeLockinsEl.textContent = activeText;
				if (lockinCountEl) lockinCountEl.textContent = countText;
				if (projectedEl) projectedEl.textContent = dailyText;
			} catch (e) {
				// ignore UI population errors
			}

			const activePlansContainer = document.getElementById("activePlansContainer");
			if (activePlansContainer) {
				const isLockinPage = Boolean(document.getElementById("lockin"));
				const lockins = Array.isArray(stats.lockins) ? stats.lockins : [];
				const investments = stats.investments || [];
				const activeInvestments = investments.filter(item => String(item.status || "").toLowerCase() === "running");

				// Fetch the authoritative summary from the active page's data source.
				(function fetchHeroStatsFromApi() {
					try {
						const pageSummaryRoute = isLockinPage ? 'lockins/summary' : 'market/summary';
						requestJson(pageSummaryRoute, null, 'GET')
						            .then(resp => {
						                if (!resp || !resp.success) return;
						                try {
						                    if (isLockinPage) {
						                        const total = Number(resp.total_lockins || 0);
						                        const active = Number(resp.active_lockins || 0);
						                        const count = Number(resp.lockins_count || resp.active_lockins_count || 0);
						                        const projected = Number(resp.projected_amount || resp.total_projected || 0);

						                        const lockinsTotalEl = document.getElementById('lockinsTotal');
						                        const activeLockinsEl = document.getElementById('activeLockins');
						                        const lockinCountEl = document.getElementById('lockinCount');
						                        const projectedEl = document.getElementById('projectedAmount');

						                        if (lockinsTotalEl) lockinsTotalEl.textContent = formatCurrencyFull(total);
						                        if (activeLockinsEl) activeLockinsEl.textContent = formatCurrencyFull(active);
						                        if (lockinCountEl) lockinCountEl.textContent = String(count);
						                        if (projectedEl) projectedEl.textContent = formatCurrencyFull(projected);
						                        return;
						                    }

						            const total = Number(resp.total_invested || 0);
						            const active = Number(resp.active_invested || 0);
						            const count = Number(resp.investments_count || 0);
						            const daily = Number(resp.total_daily_profit || 0);

						            // Populate both trade and lockin hero IDs (compat)
						            const format = formatCurrencyFull;
						            const tradedEl = document.getElementById('tradedTotal');
						            const activeEl = document.getElementById('activeTrades');
						            const countEl = document.getElementById('tradeCount');
						            const dailyEl = document.getElementById('dailyIncome');

						            const lockinsTotalEl = document.getElementById('lockinsTotal');
						            const activeLockinsEl = document.getElementById('activeLockins');
						            const lockinCountEl = document.getElementById('lockinCount');
						            const projectedEl = document.getElementById('projectedAmount');

						            const totalText = format(total);
						            const activeText = format(active);
						            const dailyText = format(daily);
						            const countText = String(count);

						            if (tradedEl) tradedEl.textContent = totalText;
						            if (activeEl) activeEl.textContent = activeText;
						            if (countEl) countEl.textContent = countText;
						            if (dailyEl) dailyEl.textContent = dailyText;

						            if (lockinsTotalEl) lockinsTotalEl.textContent = totalText;
						            if (activeLockinsEl) activeLockinsEl.textContent = activeText;
						            if (lockinCountEl) lockinCountEl.textContent = countText;
						            if (projectedEl) projectedEl.textContent = dailyText;
						                } catch (e) {
						                    // ignore
						                }
						            })
						            .catch(() => {});
					} catch (e) {
						// ignore
					}
				})();

				if (isLockinPage) {
					if (!lockins.length) {
						activePlansContainer.innerHTML = "";
						return;
					}

					activePlansContainer.innerHTML = lockins.map(item => {
						const startDate = item.created_at ? new Date(String(item.created_at).replace(' ', 'T')) : null;
						const durationDays = Number(item.days || 0);
						const elapsedDays = startDate ? Math.max(0, Math.min(durationDays, Math.floor((Date.now() - startDate.getTime()) / 86400000))) : 0;
						const progressPct = durationDays > 0 ? Math.min(100, Math.max(0, (elapsedDays / durationDays) * 100)) : 0;
						const remainingDays = Math.max(0, durationDays - elapsedDays);
						return `
						<div class="card">
						 <h3>Active Lock-In</h3>
						 <div style="margin:6px 0 10px; font-size:0.82rem; color:#666; word-break:break-all;">Lock-in #${getAdjustedNumericId(item.id, 8026)}</div>						 <br>
						 <div class="row">
						  <span>Status</span>
						  <strong style="color:var(--primary)">${String(item.status_label || item.status || 'Active').toUpperCase()}</strong>
						 </div>
						 <div class="row">
						  <span>Plan</span>
						  <strong>${item.plan_name || "Zenith Lock-In"}</strong>
						 </div>
						 <div class="row">
						  <span>Amount</span>
						  <strong>₱${Number(item.amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
						 </div>
						 <div class="row">
						  <span>Total Payout</span>
						  <strong>₱${Number(item.total_amount || (Number(item.amount || 0) + Number(item.release_amount || 0))).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
						 </div>
						 <div class="row">
						  <span>Window</span>
						  <strong>${Number(item.days || 0)} Days • ${Number(item.percent || 0)}%</strong>
						 </div>
						 <div style="margin-top:8px;">
						  <div style="height:6px; border-radius:999px; background:#E5E7EB; overflow:hidden;">
						   <div style="height:100%; width:${progressPct}%; background:var(--primary);"></div>
						  </div>
						  <div style="font-size:0.8rem; color:#666; margin-top:4px;">${Math.round(progressPct)}% complete • ${remainingDays} day${remainingDays === 1 ? '' : 's'} left</div>
						 </div>
						 <div class="row" style="margin-top:10px;">
						  <span>Created</span>
						  <strong>${item.created_at ? new Date(String(item.created_at).replace(' ', 'T')).toLocaleString('en-US', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }) : 'N/A'}</strong>
						 </div>
						 <div class="row">
						  <span>Release Date</span>
						  <strong>${item.created_at ? new Date(new Date(String(item.created_at).replace(' ', 'T')).getTime() + ((Number(item.days || 0) * 24 * 60 * 60 * 1000))).toLocaleString('en-US', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }) : 'N/A'}</strong>
						 </div>
						</div>
					`;
					}).join('');
					return;
				}

				if (!activeInvestments.length) {
					activePlansContainer.innerHTML = "";
					return;
				}

				activePlansContainer.innerHTML = activeInvestments.map(item => `
					<div class="card">
					 <h3>Active Trade</h3>
					 <div style="margin:6px 0 10px; font-size:0.82rem; color:#666; word-break:break-all;">Trade #${getAdjustedNumericId(item.id)}</div>
					 <br>
					 <div class="row">
					  <span>Status</span>
					  <strong style="color:var(--primary)">${(item.status_label || "Active").toUpperCase()}</strong>
					 </div>
					 <div class="row">
					  <span>Plan</span>
					  <strong>${item.plan_name || "Zenith"}</strong>
					 </div>
					 <div class="row">
					  <span>Amount</span>
					  <strong>₱${Number(item.amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
					 </div>
					 <div class="row">
					  <span>Daily Return</span>
					  <strong>${Number(item.daily_percent || 0)}% • ₱${Number(item.daily_profit || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
					 </div>
					 <div class="row">
					  <span>Cycle</span>
					  <strong>${Number(item.cycles_completed || 0)} / ${Number(item.cycles_total || 25)}</strong>
					 </div>
					 <div class="row">
					  <span>Created</span>
					  <strong>${item.created_at ? new Date(String(item.created_at).replace(' ', 'T')).toLocaleString('en-US', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }) : 'N/A'}</strong>
					 </div>
					 <div style="margin-top:8px;">
					  <div style="height:6px; border-radius:999px; background:#E5E7EB; overflow:hidden;">
					   <div style="height:100%; width:${Number(item.progress_percent || 0)}%; background:var(--primary);"></div>
					  </div>
					  <div style="font-size:0.8rem; color:#666; margin-top:4px;">Cycle ${Number(item.cycles_completed || 0)} of ${Number(item.cycles_total || 25)} • ${Number(item.remaining_days || 0)} days left</div>
					 </div>
					</div>
				`).join('');
			}
		});
}

function loadAIData() {
	const user = getCurrentUser();

	if (!user || !user.id) {
		return Promise.reject(new Error('no-user'));
	}

	return requestJson("dashboard.php", {})
		.then(data => {
			if (!data.success) return;

			const stats = data.stats || {};
			const hasTrade = Boolean(stats && stats.has_trade);
			const confidence = Number(stats.ai_confidence || 96);
			const trend = Number(stats.computed_gain || 0) > 0 ? "BULLISH" : "NEUTRAL";
			const risk = Number(stats.computed_gain || 0) > 0 ? "LOW" : "MEDIUM";
			const resolvedProgress = hasTrade ? Math.min(96, Math.max(70, confidence)) : 44;

			const aiStatus = document.getElementById("aiStatusValue");
			if (aiStatus) aiStatus.textContent = hasTrade ? "ONLINE" : "STANDBY";

			const aiMode = document.getElementById("aiModeValue");
			if (aiMode) {
				const planName = stats.plan_name || "Zenith";
				aiMode.textContent = "● " + (planName + (hasTrade ? " active" : " waiting for first trade"));
			}

			const aiStatusPill = document.getElementById("aiStatusPill");
			if (aiStatusPill) {
				aiStatusPill.textContent = hasTrade ? "ENGINE ACTIVE" : "AWAITING TRADE";
				aiStatusPill.className = "ai-status-pill " + (hasTrade ? "ai-status-pill--active" : "ai-status-pill--standby");
			}

			const signal = document.getElementById("aiSignalValue");
			if (signal) {
				signal.textContent = hasTrade ? "Momentum monitoring • balanced risk" : "Waiting for first trade activation";
			}

			const marketTrend = document.getElementById("marketTrendValue");
			if (marketTrend) {
				marketTrend.textContent = trend;
				marketTrend.style.color = trend === "BULLISH" ? "var(--primary)" : "var(--warning)";
			}

			const aiConfidence = document.getElementById("aiConfidenceValue");
			if (aiConfidence) {
				aiConfidence.textContent = confidence + "%";
			}

			const riskLevel = document.getElementById("riskLevelValue");
			if (riskLevel) {
				riskLevel.textContent = risk;
			}

			const strategy = document.getElementById("strategyValue");
			if (strategy) {
				const planName = stats.plan_name || "Zenith AI";
				strategy.textContent = planName;
			}

			const progressValue = document.getElementById("aiProgressValue");
			const progressFill = document.getElementById("aiProgressFill");
			const progressLabel = document.getElementById("aiProgressLabel");
			const progressSubtitle = document.getElementById("aiProgressSubtitle");
			const totalTradeCount = Number(stats.trade_count || stats.active_trade_count || (Array.isArray(stats.investments) ? stats.investments.length : 0) || 1);
			if (progressValue) progressValue.textContent = resolvedProgress + "%";
			if (progressFill) progressFill.style.width = resolvedProgress + "%";
			if (hasTrade) {
				if (progressLabel) progressLabel.textContent = "Monitoring trades";
				if (progressSubtitle) progressSubtitle.textContent = `${totalTradeCount} active position${totalTradeCount !== 1 ? 's' : ''}`;
			} else {
				if (progressLabel) progressLabel.textContent = "Engine idle";
				if (progressSubtitle) progressSubtitle.textContent = "Ready to analyze";
			}
			startAIAnimation(hasTrade, resolvedProgress, "", totalTradeCount);
		});
}

function loadWalletData() {
	const user = getCurrentUser();

	if (!user || !user.id) {
		showToast("Please log in first", "error");
		setTimeout(() => openPage("login"), 800);
		return;
	}

	return requestJson("wallet.php", {})
		.then(data => {
			if (!data.success) {
				showToast(data.message || "Unable to load wallet", "error");
				return;
			}

			const wallet = data.wallet || {};
			const transactions = data.transactions || [];
			const profitHistory = data.profit_history || [];
			const bonusHistory = data.bonus_history || [];
			syncTradeAvailableBalance(wallet);

			const balanceEl = document.getElementById("walletBalance");
			if (balanceEl) {
				// Use full numeric format for primary wallet balance (e.g., 1500.00 instead of 1.5K)
				balanceEl.textContent = formatCurrencyFull(Number(wallet.available_balance || 0));
			}

			const statusEl = document.getElementById("walletStatus");
			if (statusEl) {
				const isActive = data.user && data.user.is_active;
				const bonusValue = Number(wallet.referral_balance || 0) + Number(wallet.leadership_balance || 0);
				statusEl.innerHTML = isActive
					? '<span class="material-symbols-rounded" aria-hidden="true">trending_up</span> +' + formatCurrency(bonusValue) + ' bonus'
					: '<span class="material-symbols-rounded" aria-hidden="true">block</span> Membership inactive';
			}

			const withdrawStatusEl = document.getElementById("withdrawStatus");
			if (withdrawStatusEl) {
				const isActive = data.user && data.user.is_active;
				withdrawStatusEl.textContent = isActive ? 'Instant' : 'Blocked';
				withdrawStatusEl.style.color = isActive ? 'var(--primary)' : 'var(--danger)';
			}

			const withdrawButtonEl = document.getElementById("withdrawButton");
			if (withdrawButtonEl) {
				withdrawButtonEl.disabled = !(data.user && data.user.is_active);
				withdrawButtonEl.style.opacity = (data.user && data.user.is_active) ? '1' : '0.6';
			}

			const withdrawMode = document.getElementById("withdrawMode");
			if (withdrawMode) {
				withdrawMode.addEventListener('change', updateWithdrawModeHint);
				withdrawMode.addEventListener('change', saveWithdrawalInfo);
			}
			updateWithdrawModeHint();
		
			const fullNameInput = document.getElementById("withdrawFullName");
			if (fullNameInput) {
				fullNameInput.addEventListener('change', saveWithdrawalInfo);
			}
		
			const accountNumberInput = document.getElementById("withdrawAccountNumber");
			if (accountNumberInput) {
				accountNumberInput.addEventListener('change', saveWithdrawalInfo);
			}
		
			const saveCheckbox = document.getElementById("saveWithdrawalInfo");
			if (saveCheckbox) {
				saveCheckbox.addEventListener('change', saveWithdrawalInfo);
			}
		
			loadSavedWithdrawalInfo();

			const profitEl = document.getElementById("walletProfitValue");
			if (profitEl) {
				profitEl.textContent = formatCurrency(Number(wallet.profit_balance || 0));
			}

			const bonusEl = document.getElementById("walletBonusValue");
			if (bonusEl) {
				const bonusTotal = Number(wallet.referral_balance || 0) + Number(wallet.leadership_balance || 0);
				bonusEl.textContent = formatCurrency(bonusTotal);
			}

			const profitListEl = document.getElementById("profitHistoryList");
			if (profitListEl) {
				if (!profitHistory.length) {
					profitListEl.innerHTML = '<div class="row"><span>No profit history yet</span></div>';
				} else {
					profitListEl.innerHTML = profitHistory.map(item => {
						const amountText = '+' + formatCurrency(Number(item.amount || 0));
						const label = item.description ? formatLockinDisplayLabel(item.description, 8026) : 'Daily profit';
						let tradeLabel = item.trade_label && String(item.trade_label).toLowerCase().includes('lock-in')
							? 'Lock-in payout'
							: formatTradeLabelFromString(item.trade_label);
						const dateText = item.created_at ? new Date(String(item.created_at).replace(' ', 'T')).toLocaleString('en-US', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }) : '';
						return `<div class="row" style="align-items:flex-start; gap:8px;"><div style="display:flex; flex-direction:column; gap:2px; min-width:0;"><span style="font-size:0.9rem;">${label}</span><small style="color:#666;">${tradeLabel}</small>${dateText ? `<small style="color:#666;">${dateText}</small>` : ''}</div><strong style="color:var(--primary); white-space:nowrap;">${amountText}</strong></div>`;
					}).join('');
				}
			}

			const bonusListEl = document.getElementById("bonusHistoryList");
			if (bonusListEl) {
				if (!bonusHistory.length) {
					bonusListEl.innerHTML = '<div class="row"><span>No bonus history yet</span></div>';
				} else {
					bonusListEl.innerHTML = bonusHistory.map(item => {
						const amountText = '+' + formatCurrency(Number(item.amount || 0));
						const label = item.label || (item.type === 'leadership' ? 'Leadership bonus' : 'Referral bonus');
						let note = sanitizeReferralNote(item.description || 'Bonus payout', item.type);
						const dateText = item.created_at ? new Date(String(item.created_at).replace(' ', 'T')).toLocaleString('en-US', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }) : '';
						return `<div class="row" style="align-items:flex-start; gap:8px;"><div style="display:flex; flex-direction:column; gap:2px; min-width:0;"><span style="font-size:0.9rem;">${label}</span><small style="color:#666;">${note}</small>${dateText ? `<small style="color:#666;">${dateText}</small>` : ''}</div><strong style="color:var(--primary); white-space:nowrap;">${amountText}</strong></div>`;
					}).join('');
				}
			}

			const listEl = document.getElementById("transactionList");
			if (listEl) {
				if (!transactions.length) {
					listEl.innerHTML = '<div class="row"><span>No transactions yet</span></div>';
				} else {
					listEl.innerHTML = transactions.map(txn => {
						const isCredit = txn.type === 'deposit' || txn.type === 'bonus';
						const amountText = (isCredit ? '+' : '-') + formatCurrency(Number(txn.amount || 0));
						const color = isCredit ? 'var(--primary)' : 'var(--danger)';
						const statusText = txn.status ? ` • ${txn.status.toUpperCase()}` : '';
						const label = txn.type === 'deposit' ? 'Deposit' : txn.type === 'withdrawal' ? 'Withdrawal' : (txn.label || txn.type || 'Transaction');
						const dateValue = txn.created_at || txn.date || txn.timestamp || txn.transaction_date;
						const dateText = dateValue ? new Date(String(dateValue).replace(' ', 'T')).toLocaleString('en-US', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }) : '';
						return `<div class="row" style="align-items:flex-start; gap:8px;"><div style="display:flex; flex-direction:column; gap:2px; min-width:0;"><span style="font-size:0.9rem;">${label}${statusText}</span>${dateText ? `<small style="color:#666;">${dateText}</small>` : ''}</div><strong style="color:${color}; white-space:nowrap;">${amountText}</strong></div>`;
					}).join('');
				}
			}
		});
}

function updateWithdrawModeHint() {
	const withdrawMode = document.getElementById("withdrawMode");
	const hint = document.getElementById("withdrawModeHint");
	if (!withdrawMode || !hint) return;

	if (["gcash", "paymaya", "gotyme"].includes(withdrawMode.value)) {
		hint.textContent = "Selected payout mode is processed instantly.";
	} else {
		hint.textContent = "Bank transfers create a withdrawal request for manual processing.";
	}
}

function loadSavedWithdrawalInfo() {
	try {
		const saved = JSON.parse(localStorage.getItem("pat_withdrawal_info") || "null");
		if (!saved) return;

		const modeInput = document.getElementById("withdrawMode");
		const fullNameInput = document.getElementById("withdrawFullName");
		const accountNumberInput = document.getElementById("withdrawAccountNumber");
		const saveCheckbox = document.getElementById("saveWithdrawalInfo");

		if (modeInput && saved.mode) modeInput.value = saved.mode;
		if (fullNameInput && saved.fullName) fullNameInput.value = saved.fullName;
		if (accountNumberInput && saved.accountNumber) accountNumberInput.value = saved.accountNumber;
		if (saveCheckbox) saveCheckbox.checked = true;

		updateWithdrawModeHint();
	} catch (e) {
		// ignore parse errors
	}
}

function saveWithdrawalInfo() {
	const saveCheckbox = document.getElementById("saveWithdrawalInfo");
	if (!saveCheckbox || !saveCheckbox.checked) {
		localStorage.removeItem("pat_withdrawal_info");
		return;
	}

	const modeInput = document.getElementById("withdrawMode");
	const fullNameInput = document.getElementById("withdrawFullName");
	const accountNumberInput = document.getElementById("withdrawAccountNumber");

	const withdrawalInfo = {
		mode: modeInput ? modeInput.value : "gcash",
		fullName: fullNameInput ? fullNameInput.value.trim() : "",
		accountNumber: accountNumberInput ? accountNumberInput.value.trim() : "",
	};

	localStorage.setItem("pat_withdrawal_info", JSON.stringify(withdrawalInfo));
}

function resetWithdrawStatus() {
	const withdrawStatusEl = document.getElementById("withdrawStatus");
	if (withdrawStatusEl) {
		withdrawStatusEl.textContent = '';
		withdrawStatusEl.style.color = 'var(--primary)';
	}
}

const WITHDRAWAL_REQUEST_COOLDOWN_MS = 4000;
let withdrawalRequestLockUntil = 0;
let withdrawalRequestInFlight = false;

function getWithdrawalFee() {
	return 10;
}

function isWithdrawalRequestLocked() {
	const remaining = Math.max(0, withdrawalRequestLockUntil - Date.now());
	return withdrawalRequestInFlight || remaining > 0;
}

function setWithdrawalCooldown() {
	withdrawalRequestInFlight = true;
	withdrawalRequestLockUntil = Date.now() + WITHDRAWAL_REQUEST_COOLDOWN_MS;

	const withdrawButton = document.getElementById("withdrawButton");
	if (withdrawButton) {
		withdrawButton.disabled = true;
		withdrawButton.style.opacity = '0.6';
	}
}

function clearWithdrawalCooldown() {
	withdrawalRequestInFlight = false;
	withdrawalRequestLockUntil = 0;

	const withdrawButton = document.getElementById("withdrawButton");
	if (withdrawButton) {
		const user = getCurrentUser();
		const active = Boolean(user && user.id);
		withdrawButton.disabled = !active;
		withdrawButton.style.opacity = active ? '1' : '0.6';
	}
}

function showWithdrawalConfirmation() {
	const user = JSON.parse(localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY) || "null");
	const amountInput = document.getElementById("withdrawAmount");
	const modeInput = document.getElementById("withdrawMode");
	const fullNameInput = document.getElementById("withdrawFullName");
	const accountNumberInput = document.getElementById("withdrawAccountNumber");
	const amount = Number(amountInput ? amountInput.value : 0);
	const mode = modeInput ? modeInput.value : "gcash";
	const fullName = fullNameInput ? fullNameInput.value.trim() : "";
	const accountNumber = accountNumberInput ? accountNumberInput.value.trim() : "";

	if (!user || !user.id) {
		showToast("Please log in first", "error");
		return;
	}

	if (!amount || amount < 500) {
		showToast("Minimum withdrawal amount is ₱500", "error");
		return;
	}

	if (!fullName) {
		showToast("Please enter your full name", "error");
		return;
	}

	if (!accountNumber) {
		showToast("Please enter your account number", "error");
		return;
	}

	const fee = getWithdrawalFee();
	const netPayout = Math.max(amount - fee, 0);

	const existingModal = document.getElementById("withdrawalConfirmationModal");
	if (existingModal) existingModal.remove();

	const overlay = document.createElement('div');
	overlay.id = 'withdrawalConfirmationModal';
	overlay.style.position = 'fixed';
	overlay.style.inset = '0';
	overlay.style.background = 'rgba(0,0,0,0.72)';
	overlay.style.display = 'flex';
	overlay.style.alignItems = 'center';
	overlay.style.justifyContent = 'center';
	overlay.style.zIndex = '99999';
	overlay.style.padding = '16px';

	const box = document.createElement('div');
	box.style.background = '#fff';
	box.style.width = 'min(520px, 100%)';
	box.style.borderRadius = '16px';
	box.style.padding = '24px';
	box.style.boxShadow = '0 20px 70px rgba(0,0,0,0.22)';

	const title = document.createElement('h3');
	title.textContent = 'Confirm Withdrawal';
	title.style.margin = '0 0 10px';
	box.appendChild(title);

	const subtitle = document.createElement('div');
	subtitle.textContent = 'Please review the payout details before sending the request.';
	subtitle.style.color = '#666';
	subtitle.style.fontSize = '13px';
	subtitle.style.marginBottom = '12px';
	box.appendChild(subtitle);

	const details = document.createElement('div');
	details.style.border = '1px solid #eee';
	details.style.borderRadius = '10px';
	details.style.padding = '12px';
	details.style.background = '#fafafa';

	const rows = [
		['Requested amount', formatCurrency(Number(amount))],
		['Payment method', (modeInput ? modeInput.options && modeInput.options[modeInput.selectedIndex] : null)?.text || String(mode).toUpperCase() || 'GCash'],
		['Full name', fullName],
		['Account number', accountNumber],
		['Transaction fee', '-' + formatCurrency(fee)],
		['Total', formatCurrency(netPayout)]
	];

	rows.forEach(([label, value]) => {
		const row = document.createElement('div');
		row.style.display = 'flex';
		row.style.justifyContent = 'space-between';
		row.style.alignItems = 'center';
		row.style.gap = '12px';
		row.style.padding = '7px 0';
		row.style.borderBottom = '1px solid #eee';
		if (rows.indexOf([label, value]) === rows.length - 1) {
			row.style.borderBottom = 'none';
		}

		const labelEl = document.createElement('span');
		labelEl.textContent = label;
		labelEl.style.fontSize = '12px';
		labelEl.style.color = '#666';

		const valueEl = document.createElement('strong');
		valueEl.textContent = value;
		valueEl.style.fontSize = '13px';
		valueEl.style.color = '#111';

		if (label === 'Transaction fee') {
			valueEl.style.color = '#d9534f';
		}

		row.appendChild(labelEl);
		row.appendChild(valueEl);
		details.appendChild(row);
	});

	box.appendChild(details);

	const note = document.createElement('div');
	note.style.marginTop = '12px';
	note.style.fontSize = '11px';
	note.style.color = '#777';
	note.textContent = 'Net payout = requested amount minus transaction fee.';
	box.appendChild(note);

	const actions = document.createElement('div');
	actions.style.marginTop = '18px';
	actions.style.display = 'flex';
	actions.style.justifyContent = 'flex-end';
	actions.style.gap = '10px';

	const cancel = document.createElement('button');
	cancel.type = 'button';
	cancel.textContent = 'Cancel';
	cancel.className = 'btn btn-secondary';
	cancel.style.padding = '10px 14px';
	cancel.onclick = () => overlay.remove();

	const submit = document.createElement('button');
	submit.type = 'button';
	submit.textContent = 'Confirm Request';
	submit.className = 'btn';
	submit.style.padding = '10px 14px';
	submit.onclick = () => {
		overlay.remove();
		requestWalletWithdrawal(user.id, amount, mode, fullName, accountNumber);
	};

	actions.appendChild(cancel);
	actions.appendChild(submit);
	box.appendChild(actions);
	
	overlay.appendChild(box);
	document.body.appendChild(overlay);
}

function requestWalletWithdrawal(userId = null, amount = null, mode = null, fullName = null, accountNumber = null) {
	const user = JSON.parse(localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY) || "null");
	const amountInput = document.getElementById("withdrawAmount");
	const modeInput = document.getElementById("withdrawMode");
	const fullNameInput = document.getElementById("withdrawFullName");
	const accountNumberInput = document.getElementById("withdrawAccountNumber");
	const resolvedUserId = userId || (user ? user.id : null);
	const resolvedAmount = Number(amount ?? (amountInput ? amountInput.value : 0));
	const resolvedMode = mode || (modeInput ? modeInput.value : "gcash");
	const resolvedFullName = String(fullName || (fullNameInput ? fullNameInput.value.trim() : ""));
	const resolvedAccountNumber = String(accountNumber || (accountNumberInput ? accountNumberInput.value.trim() : ""));

	if (!resolvedUserId) {
		showToast("Please log in first", "error");
		return;
	}

	if (isWithdrawalRequestLocked()) {
		const remainingSeconds = Math.max(1, Math.ceil((withdrawalRequestLockUntil - Date.now()) / 1000));
		showToast(`Please wait ${remainingSeconds}s before submitting another withdrawal request.`, "error");
		return;
	}

	if (!resolvedAmount || resolvedAmount < 500) {
		showToast("Minimum withdrawal amount is ₱500", "error");
		return;
	}

	if (!resolvedFullName) {
		showToast("Please enter your full name", "error");
		return;
	}

	if (!resolvedAccountNumber) {
		showToast("Please enter your account number", "error");
		return;
	}

	setWithdrawalCooldown();

	const withdrawStatusEl = document.getElementById("withdrawStatus");
	if (withdrawStatusEl) {
		withdrawStatusEl.textContent = 'Processing...';
		withdrawStatusEl.style.color = 'var(--primary)';
	}

	requestJson("wallet.php", {
		action: 'request_withdrawal',
		amount: resolvedAmount,
		mode: resolvedMode,
		full_name: resolvedFullName,
		account_number: resolvedAccountNumber
	})
		.then(data => {
			showToast(data.message || "Withdrawal request submitted", data.success ? "success" : "error");
			if (data.success) {
				saveWithdrawalInfo();
				if (amountInput) amountInput.value = "";
				loadWalletData();
			} else {
				resetWithdrawStatus();
			}
		})
		.catch(() => {
			resetWithdrawStatus();
		})
		.finally(() => {
			clearWithdrawalCooldown();
		});
}

function openWithdrawalConfirmationModal() {
	showWithdrawalConfirmation();
}


// ===============================
// START APP
// ===============================

window.onload = () => {

	const bottomNav = document.getElementById("bottomNav");

	if (bottomNav) bottomNav.style.display = "none";

	const params = new URLSearchParams(window.location.search);
	const tradeResult = params.get("trade");
	const lockinResult = params.get("lockin");

	if (tradeResult === "success") {
		showToast("Trade payment completed. Your investment will activate once payment is confirmed.", "success");
	} else if (tradeResult === "cancel") {
		showToast("Trade payment was cancelled.", "error");
	}

	if (lockinResult === "success") {
		showToast("Lock-in payment completed. Your lock-in will activate once payment is confirmed.", "success");
	} else if (lockinResult === "cancel") {
		showToast("Lock-in payment was cancelled.", "error");
	}

	if (tradeResult) {
		params.delete("trade");
	}
	if (lockinResult) {
		params.delete("lockin");
	}
	const newSearch = params.toString();
	if (tradeResult || lockinResult) {
		history.replaceState(null, "", window.location.pathname + (newSearch ? `?${newSearch}` : ""));
	}

	const savedUser = getCurrentUser();
	const referralCode = params.get("ref");

	if (referralCode && (!savedUser || !savedUser.id)) {
		openPage("register");
	} else if (savedUser && savedUser.id) {
		openPage("home");
	} else {
		openPage("login");
	}

};
