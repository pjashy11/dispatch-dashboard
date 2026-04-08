chrome.runtime.sendMessage({ type: "GET_STATUS" }, (res) => {
  const dot = document.getElementById("dot");
  const text = document.getElementById("statusText");
  const lastDiv = document.getElementById("lastForward");
  const terminalList = document.getElementById("terminalList");

  if (res?.hasAuth) {
    dot.className = "dot ok";
    text.textContent = "Connected — capturing data";
  } else {
    dot.className = "dot off";
    text.textContent = "Not connected — open Welltrax to start";
  }

  const terminals = res?.trackedTerminals || [];
  if (terminals.length === 0) {
    terminalList.innerHTML = '<div class="no-terminals">None yet — open each terminal\'s dispatch board in Welltrax to seed it.</div>';
  } else {
    terminalList.innerHTML = terminals.map((t) =>
      `<div class="terminal-row">
        <span class="terminal-dot"></span>
        <span class="terminal-id">Terminal ${t.terminalId}</span>
        <span class="terminal-meta">commodity ${t.commodityId} · seeded ${t.date}</span>
      </div>`
    ).join("");
  }

  if (res?.lastForward) {
    const ago = Math.round((Date.now() - res.lastForward.time) / 1000);
    const agoText = ago < 60 ? `${ago}s ago` : `${Math.round(ago / 60)}m ago`;
    lastDiv.style.display = "block";
    lastDiv.textContent = `Last sync: Terminal ${res.lastForward.terminalId}, ${res.lastForward.workingDrivers} drivers (${agoText})`;
  }
});

document.getElementById("pollBtn").addEventListener("click", () => {
  const btn = document.getElementById("pollBtn");
  const result = document.getElementById("pollResult");

  btn.disabled = true;
  btn.textContent = "Polling...";
  result.style.display = "none";

  chrome.runtime.sendMessage({ type: "POLL_NOW" }, (res) => {
    btn.disabled = false;
    btn.textContent = "Poll Now";

    if (!res?.results || res.results.length === 0) {
      result.className = "poll-result err";
      result.textContent = "No terminals to poll yet — open the Welltrax dispatch board first.";
    } else {
      const succeeded = res.results.filter((r) => r.ok).length;
      const total = res.results.length;
      if (succeeded === total) {
        result.className = "poll-result ok";
        result.textContent = `✓ Updated ${succeeded} of ${total} terminal(s) successfully.`;
      } else {
        result.className = "poll-result err";
        result.textContent = `Updated ${succeeded} of ${total} terminal(s). Check background console for details.`;
      }
    }

    result.style.display = "block";
  });
});
