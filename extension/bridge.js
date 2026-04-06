/**
 * Bridge script (ISOLATED world) — relays postMessages to the background worker.
 * Falls back to direct fetch if the extension context is invalidated.
 */

var DASHBOARD_URL = "http://localhost:3000";

window.addEventListener("message", function (event) {
  if (event.source !== window) return;
  if (!event.data || !event.data.__welltraxBridge) return;

  var msg = event.data;

  // Try chrome.runtime.sendMessage first, fall back to direct fetch
  try {
    if (chrome.runtime && chrome.runtime.id) {
      chrome.runtime.sendMessage(msg);
      return;
    }
  } catch (e) {
    // Extension context invalidated — fall back to direct fetch
  }

  // Direct fallback: send to dashboard API ourselves
  if (msg.type === "AUTH_HEADERS") {
    fetch(DASHBOARD_URL + "/api/welltrax-auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        auth0Token: msg.headers.auth0Token,
        loginToken: msg.headers.Authentication,
      }),
    }).catch(function () {});
  }

  if (msg.type === "DISPATCH_BOARD_DATA") {
    fetch(DASHBOARD_URL + "/api/dispatch-board/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        terminalId: msg.terminalId,
        date: msg.date,
        commodityId: msg.commodityId,
        data: msg.data,
        timestamp: msg.timestamp,
        source: "extension-fallback",
      }),
    }).catch(function () {});
  }
});
