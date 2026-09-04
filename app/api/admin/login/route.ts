import { NextRequest, NextResponse } from "next/server";
import { sameOrigin, setAdminCookie, validAdminSecret } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ ok: false, error: "Origin refusée" }, { status: 403 });
  const body = (await request.json().catch(() => null)) as { secret?: unknown } | null;
  if (!validAdminSecret(body?.secret)) {
    return NextResponse.json({ ok: false, error: "Secret incorrect" }, { status: 401 });
  }
  const response = NextResponse.json({ ok: true });
  setAdminCookie(response);
  return response;
}
