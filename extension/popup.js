chrome.runtime.sendMessage({ type: "GET_STATUS" }, (res) => {
  const dot = document.getElementById("dot");
  const text = document.getElementById("statusText");
  const lastDiv = document.getElementById("lastForward");

  if (res?.hasAuth) {
    dot.className = "dot ok";
    text.textContent = "Connected - capturing data";
  } else {
    dot.className = "dot off";
    text.textContent = "Not connected - open Welltrax to start";
  }

  if (res?.lastForward) {
    const ago = Math.round((Date.now() - res.lastForward.time) / 1000);
    const agoText = ago < 60 ? `${ago}s ago` : `${Math.round(ago / 60)}m ago`;
    lastDiv.style.display = "block";
    lastDiv.textContent = `Last capture: Terminal ${res.lastForward.terminalId}, ${res.lastForward.workingDrivers} drivers (${agoText})`;
  }
});
