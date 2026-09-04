import { NextRequest, NextResponse } from "next/server";
import { isProfileId } from "@/lib/config";
import { getSessions } from "@/lib/tracker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const profileId = request.nextUrl.searchParams.get("profile");
  if (!isProfileId(profileId)) {
    return NextResponse.json({ ok: false, error: "Profil invalide" }, { status: 400 });
  }
  try {
    return NextResponse.json(await getSessions(profileId), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Erreur inconnue" },
      { status: 500 },
    );
  }
}
