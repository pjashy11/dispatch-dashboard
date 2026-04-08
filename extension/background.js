/**
 * Background service worker
 *
 * Receives messages from the content script and:
 *  1. Stores auth headers for reuse
 *  2. Forwards dispatch board data to the Dispatch Dashboard API
 *  3. Polls known terminal URLs every 15 minutes via chrome.alarms
 */

const DASHBOARD_URL = "http://localhost:3002";
const POLL_ALARM = "dispatch-poll";
const POLL_INTERVAL_MINUTES = 15;

// Cache the latest auth headers and dispatch data
let cachedAuth = null;
let lastForwardTime = 0;

// ── Alarm setup ──────────────────────────────────────────────

chrome.alarms.get(POLL_ALARM, (alarm) => {
  if (!alarm) {
    chrome.alarms.create(POLL_ALARM, { periodInMinutes: POLL_INTERVAL_MINUTES });
  }
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === POLL_ALARM) {
    pollAllTerminals();
  }
});

// ── Message handler ──────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "AUTH_HEADERS") {
    cachedAuth = msg.headers;
    chrome.storage.local.set({ authHeaders: msg.headers });
    forwardAuth(msg.headers);
    updateBadge("ok");
    return;
  }

  if (msg.type === "DISPATCH_BOARD_DATA") {
    // Store the API URL so we can re-fetch it on the alarm
    storeKnownUrl(msg.terminalId, msg.date, msg.commodityId, msg.url);
    forwardDispatchData(msg);
    updateBadge("data");
    return;
  }

  if (msg.type === "GET_STATUS") {
    chrome.storage.local.get(["authHeaders", "lastForward", "knownUrls"], (items) => {
      const knownUrls = items.knownUrls || {};
      sendResponse({
        hasAuth: !!items.authHeaders?.Authentication,
        lastForward: items.lastForward || null,
        trackedTerminals: Object.values(knownUrls).map((e) => ({
          terminalId: e.terminalId,
          commodityId: e.commodityId,
          date: e.date,
        })),
      });
    });
    return true; // async response
  }

  if (msg.type === "POLL_NOW") {
    pollAllTerminals().then((results) => sendResponse({ results }));
    return true; // async response
  }
});

// ── Known URL store ──────────────────────────────────────────

function storeKnownUrl(terminalId, date, commodityId, url) {
  const key = `${terminalId}:${commodityId}`; // keyed by terminal+commodity, date updates each day
  chrome.storage.local.get("knownUrls", (items) => {
    const knownUrls = items.knownUrls || {};
    knownUrls[key] = { terminalId, date, commodityId, url };
    chrome.storage.local.set({ knownUrls });
  });
}

// ── Polling ──────────────────────────────────────────────────

async function pollAllTerminals() {
  const items = await chrome.storage.local.get(["knownUrls", "authHeaders"]);
  const knownUrls = items.knownUrls || {};
  const auth = items.authHeaders || cachedAuth;

  if (!auth?.Authentication) {
    console.warn("[Bridge] Poll skipped — no auth headers cached");
    return [];
  }

  const keys = Object.keys(knownUrls);
  if (keys.length === 0) {
    console.warn("[Bridge] Poll skipped — no known terminal URLs yet");
    return [];
  }

  // Update date to today for each entry
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  const results = [];
  for (const key of keys) {
    const entry = knownUrls[key];
    // Build the full portal URL directly — don't rely on the captured URL format
    const freshUrl = `https://welltrax-portal.wolfepakcloud.com/WellSite/rs/schedule/dispatchBoard/filter/${entry.terminalId}/${today}/${entry.commodityId}?limitSize=50&showSupplementals=false`;

    try {
      console.log(`[Bridge] Polling terminal ${entry.terminalId} for ${today}...`);
      const res = await fetch(freshUrl, {
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Source: "portal",
          Authentication: auth.Authentication,
          auth0Token: auth.auth0Token || "",
          hasAuth0: auth.hasAuth0 || "true",
        },
      });

      if (!res.ok) {
        console.warn(`[Bridge] Poll failed for terminal ${entry.terminalId}: HTTP ${res.status}`);
        results.push({ terminalId: entry.terminalId, ok: false, status: res.status });
        continue;
      }

      const data = await res.json();
      if (data?.SCHEDULE_DRIVERS_WORKING || data?.SCHEDULE_DRIVERS_NOT_WORKING) {
        console.log(`[Bridge] Poll got data for terminal ${entry.terminalId}: Working=${(data.SCHEDULE_DRIVERS_WORKING||[]).length}`);
        await forwardDispatchData({
          terminalId: entry.terminalId,
          date: today,
          commodityId: entry.commodityId,
          data,
          url: freshUrl,
          timestamp: Date.now(),
        });
        // Update stored date to today
        knownUrls[key].date = today;
        results.push({ terminalId: entry.terminalId, ok: true });
      } else {
        results.push({ terminalId: entry.terminalId, ok: false, reason: "no driver data in response" });
      }
    } catch (e) {
      console.warn(`[Bridge] Poll error for terminal ${entry.terminalId}:`, e.message);
      results.push({ terminalId: entry.terminalId, ok: false, error: e.message });
    }
  }

  chrome.storage.local.set({ knownUrls });
  updateBadge("data");
  return results;
}

// ── Forward helpers ──────────────────────────────────────────

async function forwardAuth(headers) {
  try {
    await fetch(`${DASHBOARD_URL}/api/welltrax-auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        auth0Token: headers.auth0Token,
        loginToken: headers.Authentication,
      }),
    });
  } catch (e) {
    console.warn("[Bridge] Failed to forward auth:", e.message);
  }
}

async function forwardDispatchData(msg) {
  try {
    const res = await fetch(`${DASHBOARD_URL}/api/dispatch-board/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        terminalId: msg.terminalId,
        date: msg.date,
        commodityId: msg.commodityId,
        data: msg.data,
        timestamp: msg.timestamp,
        source: "extension",
      }),
    });

    if (res.ok) {
      lastForwardTime = Date.now();
      chrome.storage.local.set({
        lastForward: {
          time: lastForwardTime,
          terminalId: msg.terminalId,
          date: msg.date,
          workingDrivers: msg.data.SCHEDULE_DRIVERS_WORKING?.length || 0,
        },
      });
    }
  } catch (e) {
    console.warn("[Bridge] Failed to forward dispatch data:", e.message);
    updateBadge("err");
  }
}

function updateBadge(status) {
  const colors = { ok: "#10b981", data: "#3b82f6", err: "#ef4444" };
  const text = { ok: "", data: "NEW", err: "ERR" };
  chrome.action.setBadgeBackgroundColor({ color: colors[status] || "#666" });
  chrome.action.setBadgeText({ text: text[status] || "" });

  if (status === "data") {
    setTimeout(() => chrome.action.setBadgeText({ text: "" }), 3000);
  }
}
