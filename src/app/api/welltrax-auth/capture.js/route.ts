import { NextResponse } from "next/server";

/**
 * GET /api/welltrax-auth/capture.js
 *
 * Returns a JavaScript snippet the user can paste into the browser console
 * on the Welltrax portal page. It reads the Auth0 token from localStorage
 * and sends it to our dashboard's connect endpoint.
 */
export async function GET() {
  // The script reads the auth0 token from the Welltrax portal's localStorage
  // and sends it to our API. The dashboard URL is derived from the opener or
  // provided as a fallback.
  const script = `
(async function() {
  const token = localStorage.getItem("auth0Token");
  if (!token) {
    alert("No Auth0 token found in Welltrax. Make sure you are logged in.");
    return;
  }

  // Try sending to the dashboard running on localhost
  const ports = [3000, 3001, 3002];
  let success = false;

  for (const port of ports) {
    try {
      const res = await fetch("http://localhost:" + port + "/api/welltrax-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auth0Token: token }),
      });
      const data = await res.json();
      if (data.connected) {
        alert("Connected to Dispatch Dashboard! You can close this tab.");
        success = true;
        break;
      } else {
        console.log("Port " + port + " responded but not connected:", data);
      }
    } catch (e) {
      console.log("Port " + port + " not reachable");
    }
  }

  if (!success) {
    // Fallback: copy token to clipboard
    await navigator.clipboard.writeText(token);
    alert("Could not auto-connect. Token copied to clipboard — paste it in the dashboard.");
  }
})();
`.trim();

  return new NextResponse(script, {
    headers: {
      "Content-Type": "application/javascript",
      "Cache-Control": "no-cache",
    },
  });
}
