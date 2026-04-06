export const WOLFEPAK_BASE_URL = "https://welltrax-api.wolfepakcloud.com";
export const PORTAL_BASE_URL = "https://welltrax-portal.wolfepakcloud.com";

let cachedToken: { token: string; expiresAt: number } | null = null;
let cachedWapiToken: { token: string; expiresAt: number } | null = null;

/* ── Portal Session (Welltrax dispatch board) ──────────────── */

export interface PortalSession {
  auth0Token: string;
  loginToken: string;
  jsessionId: string;
  userId: number;
  orgId: number;
  expiresAt: number; // epoch ms
}

let portalSession: PortalSession | null = null;

/** Store and return a portal session. */
export function setPortalSession(session: PortalSession) {
  portalSession = session;
}

/** Get the cached portal session (null if not connected or expired). */
export function getPortalSession(): PortalSession | null {
  if (!portalSession) return null;
  if (portalSession.expiresAt < Date.now()) {
    portalSession = null;
    return null;
  }
  return portalSession;
}

/** Clear the portal session. */
export function clearPortalSession() {
  portalSession = null;
}

/**
 * Connect to the Welltrax Portal using an Auth0 access token.
 * Calls POST /WellSite/rs/user/login with Auth0 headers to establish a session.
 * Returns the portal session data on success.
 */
export async function connectPortal(auth0Token: string, providedLoginToken?: string): Promise<PortalSession> {
  // Step 1: Get org details for the company
  const orgRes = await fetch(
    `${PORTAL_BASE_URL}/WellSite/rs/user/login/getOrgDetailsByName/explore`,
    { headers: { Accept: "application/json", "Content-Type": "application/json", Source: "portal" } }
  );
  let orgData: any = {};
  try {
    orgData = await orgRes.json();
  } catch {}

  // Step 2: Call POST /user/login with Auth0 token + org details as body
  const res = await fetch(`${PORTAL_BASE_URL}/WellSite/rs/user/login`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Source: "portal",
      Authentication: `Bearer ${auth0Token}`,
      hasAuth0: "true",
      auth0Token: auth0Token,
    },
    body: JSON.stringify(orgData),
  });

  // Extract JSESSIONID from Set-Cookie header
  const setCookieRaw = res.headers.getSetCookie?.() ?? [];
  const setCookieStr = setCookieRaw.join("; ") || res.headers.get("set-cookie") || "";
  const jsMatch = setCookieStr.match(/JSESSIONID=([^;]+)/);
  const jsessionId = jsMatch?.[1] || "";

  const text = await res.text();
  let data: any = null;
  if (text.trim()) {
    try {
      data = JSON.parse(text);
    } catch {}
  }

  // 401 = token expired or invalid
  if (res.status === 401) {
    throw new Error(data?.message || "Auth0 token expired or invalid");
  }

  // 204 = login accepted, session established (no body returned)
  // 200 = login accepted with user data in body
  if (res.status === 204 || res.status === 200) {
    // Extract user_id from the Auth0 JWT payload
    let auth0UserId = 0;
    try {
      const payloadB64 = auth0Token.split(".")[1];
      const payload = JSON.parse(
        Buffer.from(payloadB64, "base64").toString("utf-8")
      );
      auth0UserId = payload["https://pakenergy.com/user_id"] || 0;
    } catch {}

    const session: PortalSession = {
      auth0Token,
      loginToken: providedLoginToken || data?.loginToken || "",
      jsessionId,
      userId: data?.id || auth0UserId,
      orgId: data?.organizationId || data?.orgId || 0,
      expiresAt: Date.now() + 23 * 60 * 60 * 1000,
    };

    // If still no loginToken, use Bearer auth0Token as fallback
    if (!session.loginToken) {
      session.loginToken = `Bearer ${auth0Token}`;
    }

    setPortalSession(session);
    return session;
  }

  throw new Error(
    `Portal login failed: ${res.status} — ${text.slice(0, 300)}`
  );
}

/**
 * Make an authenticated request to the Welltrax Portal API.
 * Uses the cached portal session for auth headers.
 */
export async function portalFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const session = getPortalSession();
  if (!session) {
    throw new Error("No active portal session. Connect to Welltrax first.");
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    Source: "portal",
    Authentication: session.loginToken,
    hasAuth0: "true",
    auth0Token: session.auth0Token,
    ...(options.headers as Record<string, string> || {}),
  };

  if (session.jsessionId) {
    headers.Cookie = `JSESSIONID=${session.jsessionId}`;
  }

  return fetch(`${PORTAL_BASE_URL}/WellSite/rs/${path}`, {
    ...options,
    headers,
  });
}

/** Get a Welltrax/WolfePak access token (Ticket API, client_credentials flow). */
export async function getWelltraxToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }

  const params = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: process.env.WOLFEPAK_CLIENT_ID!,
    client_secret: process.env.WOLFEPAK_CLIENT_SECRET!,
  });

  const res = await fetch(`${WOLFEPAK_BASE_URL}/ticketAPI/v1/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!res.ok) {
    throw new Error(`Token request failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 604_800) * 1000,
  };

  return data.access_token;
}

/** Get a WAPI_TMS11 token (username/password sign-in). */
export async function getWapiToken(): Promise<string> {
  if (cachedWapiToken && cachedWapiToken.expiresAt > Date.now() + 60_000) {
    return cachedWapiToken.token;
  }

  const res = await fetch(`${WOLFEPAK_BASE_URL}/WAPI_TMS11/api/auth/signin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userName: process.env.WAPI_TMS11_CLIENT_ID!,
      password: process.env.WAPI_TMS11_CLIENT_SECRET!,
      companyName: process.env.WAPI_TMS11_COMPANY!,
    }),
  });

  if (!res.ok) {
    throw new Error(`WAPI token failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  cachedWapiToken = {
    token: data.accessToken,
    expiresAt: Date.now() + 604_800 * 1000,
  };

  return data.accessToken;
}

/** Fetch tickets/loads from Welltrax Ticket API. Paginates automatically. */
export async function fetchTickets(
  dateStart: string,
  dateEnd: string,
  options: {
    statusList?: string[];
    dateType?: string;
    timeStart?: string;
    timeEnd?: string;
  } = {}
): Promise<any[]> {
  const {
    statusList = ["OPEN"],
    dateType = "LOAD_CREATION",
    timeStart = "00:00",
    timeEnd = "23:59",
  } = options;

  const company = process.env.WOLFEPAK_COMPANY || "explore";
  const token = await getWelltraxToken();
  const results: any[] = [];
  let page = 1;
  const pageSize = 500;

  while (true) {
    const res = await fetch(
      `${WOLFEPAK_BASE_URL}/ticketAPI/v1/tickets/${company}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          dateRangeStart: { date: dateStart, time: timeStart },
          dateRangeEnd: { date: dateEnd, time: timeEnd },
          dateType,
          statusList,
          offset: page,
          limit: pageSize,
        }),
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      if (errText.includes("no results")) break;
      if (results.length > 0) {
        console.warn(`[Welltrax] Partial fetch: page ${page} failed (${res.status}), returning ${results.length} results collected so far`);
        break;
      }
      throw new Error(`Ticket fetch failed: ${res.status} ${errText}`);
    }

    const data = await res.json();
    const items = Array.isArray(data) ? data : [];
    if (items.length === 0) break;
    results.push(...items);
    if (items.length < pageSize) break;
    page++;
  }

  return results;
}

/**
 * Fetch tickets across a date range, splitting into 15-day chunks
 * (Welltrax API max date range limit).
 */
export async function fetchTicketsChunked(
  startDate: Date,
  endDate: Date,
  options: Parameters<typeof fetchTickets>[2] = {}
): Promise<any[]> {
  const chunks: { start: Date; end: Date }[] = [];
  let current = new Date(startDate);

  while (current < endDate) {
    const chunkEnd = new Date(current);
    chunkEnd.setDate(chunkEnd.getDate() + 14); // 15-day window (inclusive)
    if (chunkEnd > endDate) chunkEnd.setTime(endDate.getTime());

    chunks.push({ start: new Date(current), end: new Date(chunkEnd) });
    current = new Date(chunkEnd);
    current.setDate(current.getDate() + 1);
  }

  const allResults = await Promise.all(
    chunks.map((chunk) =>
      fetchTickets(formatDateForApi(chunk.start), formatDateForApi(chunk.end), options)
    )
  );

  return allResults.flat();
}

/** Query WAPI_TMS11 setupinfo for entity resolution. */
export async function fetchSetupInfo(
  requests: { target: string; searchCriteria: Record<string, string> }[]
): Promise<{ ok: boolean; status: number; data: any }> {
  const token = await getWapiToken();

  const body = requests.map((r) => ({
    target: r.target,
    isExists: "false",
    searchCriteria: {
      ...r.searchCriteria,
      offset: r.searchCriteria.offset || "0",
      limit: r.searchCriteria.limit || "20",
      sortBy: r.searchCriteria.sortBy || "name",
      sortOrder: r.searchCriteria.sortOrder || "ASC",
    },
  }));

  const res = await fetch(
    `${WOLFEPAK_BASE_URL}/WAPI_TMS11/api/v1/client/setupinfo`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
      },
      body: JSON.stringify(body),
    }
  );

  const resText = await res.text();
  let data;
  try {
    data = JSON.parse(resText);
  } catch {
    data = resText;
  }

  return { ok: res.ok, status: res.status, data };
}

/** Create a load via WAPI_TMS11. */
export async function createLoad(
  payload: Record<string, unknown>
): Promise<{ ok: boolean; status: number; body: string }> {
  const token = await getWapiToken();
  const body = Array.isArray(payload) ? payload : [payload];

  const res = await fetch(
    `${WOLFEPAK_BASE_URL}/WAPI_TMS11/api/inbound/loads`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
      },
      body: JSON.stringify(body),
    }
  );

  const resText = await res.text();
  return { ok: res.ok, status: res.status, body: resText };
}

/** Call WAPI_TMS11 loadAssignments endpoint (cancel, edit, etc.). */
export async function loadAssignments(
  payload: Record<string, unknown>[]
): Promise<{ ok: boolean; status: number; body: string }> {
  const token = await getWapiToken();

  const res = await fetch(
    `${WOLFEPAK_BASE_URL}/WAPI_TMS11/api/v2/client/loadAssignments`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
      },
      body: JSON.stringify(payload),
    }
  );

  const resText = await res.text();
  return { ok: res.ok, status: res.status, body: resText };
}

/** Update a load via WAPI_TMS11 inbound/loads (for editing load fields). */
export async function updateLoad(
  payload: Record<string, unknown>
): Promise<{ ok: boolean; status: number; body: string }> {
  const token = await getWapiToken();
  const body = Array.isArray(payload) ? payload : [payload];

  const res = await fetch(
    `${WOLFEPAK_BASE_URL}/WAPI_TMS11/api/inbound/loads`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
      },
      body: JSON.stringify(body),
    }
  );

  const resText = await res.text();
  return { ok: res.ok, status: res.status, body: resText };
}

/** Fetch ALL active scenarios, paginating through results. */
export async function fetchAllScenarios(): Promise<any[]> {
  const all: any[] = [];
  let offset = 0;
  const pageSize = 500;

  while (true) {
    const result = await fetchSetupInfo([
      {
        target: "SCENARIO",
        searchCriteria: {
          isActive: "true",
          offset: String(offset),
          limit: String(pageSize),
          sortBy: "name",
          sortOrder: "ASC",
        },
      },
    ]);

    if (!result.ok) break;
    const retList = result.data?.result?.[0]?.retList;
    if (!Array.isArray(retList) || retList.length === 0) break;
    all.push(...retList);
    if (retList.length < pageSize) break;
    offset += pageSize;
  }

  return all;
}

/** Fetch terminals from setupinfo. */
export async function fetchTerminals(): Promise<any[]> {
  const result = await fetchSetupInfo([
    {
      target: "TERMINAL",
      searchCriteria: {
        offset: "0",
        limit: "100",
        sortBy: "name",
        sortOrder: "ASC",
      },
    },
  ]);

  if (!result.ok) return [];
  return result.data?.result?.[0]?.retList ?? [];
}

/** Query a WAPI_TMS11 v2/client entity (generic GET-like POST). */
export async function fetchWapiEntity(
  entity: string,
  body: Record<string, unknown>
): Promise<{ ok: boolean; status: number; body: string }> {
  const token = await getWapiToken();
  const res = await fetch(
    `${WOLFEPAK_BASE_URL}/WAPI_TMS11/api/v2/client/${entity}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
      },
      body: JSON.stringify(body),
    }
  );
  const resText = await res.text();
  return { ok: res.ok, status: res.status, body: resText };
}

/** Format a Date as MM/DD/YYYY for the Welltrax API. */
export function formatDateForApi(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}/${dd}/${d.getFullYear()}`;
}
