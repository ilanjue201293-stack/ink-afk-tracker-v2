import { NextRequest, NextResponse } from "next/server";
import { clearAdminCookie, sameOrigin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ ok: false, error: "Origin refusée" }, { status: 403 });
  const response = NextResponse.json({ ok: true });
  clearAdminCookie(response);
  return response;
}
