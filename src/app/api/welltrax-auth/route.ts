import { NextRequest, NextResponse } from "next/server";
import {
  connectPortal,
  getPortalSession,
  clearPortalSession,
} from "@/lib/welltrax";

/**
 * GET /api/welltrax-auth — Check portal session status
 */
export async function GET() {
  const session = getPortalSession();
  if (!session) {
    return NextResponse.json({ connected: false });
  }
  return NextResponse.json({
    connected: true,
    userId: session.userId,
    expiresAt: session.expiresAt,
    remainingMs: session.expiresAt - Date.now(),
  });
}

/**
 * POST /api/welltrax-auth — Connect with Auth0 token
 * Body: { auth0Token: string }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { auth0Token, loginToken } = body;

    if (!auth0Token) {
      return NextResponse.json(
        { error: "auth0Token is required" },
        { status: 400 }
      );
    }

    const session = await connectPortal(auth0Token, loginToken);

    return NextResponse.json({
      connected: true,
      userId: session.userId,
      hasLoginToken: !!session.loginToken,
      hasJsessionId: !!session.jsessionId,
      expiresAt: session.expiresAt,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Connection failed" },
      { status: 401 }
    );
  }
}

/**
 * DELETE /api/welltrax-auth — Disconnect portal session
 */
export async function DELETE() {
  clearPortalSession();
  return NextResponse.json({ connected: false });
}
