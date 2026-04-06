/**
 * Background service worker
 *
 * Receives messages from the content script and:
 *  1. Stores auth headers for reuse
 *  2. Forwards dispatch board data to the Dispatch Dashboard API
 */

const DASHBOARD_URL = "http://localhost:3000";

// Cache the latest auth headers and dispatch data
let cachedAuth = null;
let lastForwardTime = 0;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "AUTH_HEADERS") {
    cachedAuth = msg.headers;
    chrome.storage.local.set({ authHeaders: msg.headers });
    // Also forward auth to dashboard
    forwardAuth(msg.headers);
    updateBadge("ok");
    return;
  }

  if (msg.type === "DISPATCH_BOARD_DATA") {
    // Forward the dispatch board data to our dashboard
    forwardDispatchData(msg);
    updateBadge("data");
    return;
  }

  if (msg.type === "GET_STATUS") {
    chrome.storage.local.get(["authHeaders", "lastForward"], (items) => {
      sendResponse({
        hasAuth: !!items.authHeaders?.Authentication,
        lastForward: items.lastForward || null,
      });
    });
    return true; // async response
  }
});

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

  // Clear badge after 3 seconds
  if (status === "data") {
    setTimeout(() => chrome.action.setBadgeText({ text: "" }), 3000);
  }
}
