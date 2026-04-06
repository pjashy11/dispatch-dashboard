import { NextRequest, NextResponse } from "next/server";

const PORTAL_BASE = "https://welltrax-portal.wolfepakcloud.com/WellSite/rs";

/**
 * POST /api/portal-proxy
 *
 * Proxies requests to the Welltrax Portal API. The client sends the
 * auth tokens and path; we forward them to the portal and relay the response.
 *
 * Body: { path: string, auth0Token: string, loginToken: string }
 */
export async function POST(req: NextRequest) {
  try {
    const { path, auth0Token, loginToken } = await req.json();

    if (!path || !loginToken) {
      return NextResponse.json(
        { error: "path and loginToken are required" },
        { status: 400 }
      );
    }

    const res = await fetch(`${PORTAL_BASE}/${path}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Source: "portal",
        Authentication: loginToken,
        hasAuth0: "true",
        auth0Token: auth0Token || "",
      },
    });

    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }

    return NextResponse.json({
      status: res.status,
      data,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
