/**
 * Interceptor script — runs in the PAGE's main world via "world": "MAIN".
 * Patches XMLHttpRequest to capture dispatch board data and auth headers.
 * Sends data via postMessage to bridge.js (ISOLATED world) which forwards
 * to the background worker (no CORS issues).
 */

(function () {
  "use strict";

  var DISPATCH_BOARD_RE = /dispatchBoard\/(?:filter|advancedFilter)\/(\d+)\/([^/?]+)\/(\d+)/;

  function send(msg) {
    msg.__welltraxBridge = true;
    window.postMessage(msg, "*");
  }

  // ── Intercept XMLHttpRequest ─────────────────────────────
  var XHROpen = XMLHttpRequest.prototype.open;
  var XHRSetHeader = XMLHttpRequest.prototype.setRequestHeader;
  var XHRSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url) {
    this.__burl = typeof url === "string" ? url : String(url);
    this.__bhdrs = {};
    return XHROpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
    if (this.__bhdrs) this.__bhdrs[name] = value;
    return XHRSetHeader.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function () {
    var url = this.__burl || "";

    // Capture auth headers
    if (this.__bhdrs && (this.__bhdrs.Authentication || this.__bhdrs.auth0Token)) {
      send({
        type: "AUTH_HEADERS",
        headers: {
          Authentication: this.__bhdrs.Authentication || "",
          auth0Token: this.__bhdrs.auth0Token || "",
          hasAuth0: this.__bhdrs.hasAuth0 || "",
        },
      });
    }

    // Capture dispatch board responses
    var match = url.match(DISPATCH_BOARD_RE);
    if (match) {
      var tid = match[1], dt = match[2], cid = match[3];
      console.log("[Bridge] Watching dispatch board:", tid, dt, cid);

      this.addEventListener("load", function () {
        try {
          // Use this.response for responseType:"json", this.responseText otherwise
          var data = this.responseType === "json" ? this.response : JSON.parse(this.responseText);
          if (data && (data.SCHEDULE_DRIVERS_WORKING || data.SCHEDULE_DRIVERS_NOT_WORKING)) {
            console.log("[Bridge] Got dispatch data! Working:",
              (data.SCHEDULE_DRIVERS_WORKING || []).length,
              "NotWorking:", (data.SCHEDULE_DRIVERS_NOT_WORKING || []).length);
            send({
              type: "DISPATCH_BOARD_DATA",
              terminalId: tid,
              date: dt,
              commodityId: cid,
              data: data,
              url: url,
              timestamp: Date.now(),
            });
          }
        } catch (e) {
          console.log("[Bridge] Parse error:", e.message);
        }
      });
    }

    return XHRSend.apply(this, arguments);
  };

  console.log("[Welltrax Bridge] Interceptor active");
})();
