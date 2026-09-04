import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";

export const ADMIN_COOKIE = "ink_v2_admin";
const SESSION_SECONDS = 8 * 60 * 60;

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function validAdminSecret(candidate: unknown) {
  const expected = process.env.ADMIN_SECRET?.trim();
  return Boolean(expected && typeof candidate === "string" && safeEqual(candidate, expected));
}

export function validCronSecret(candidate: string | null) {
  const expected = process.env.CRON_SECRET?.trim();
  const value = candidate?.startsWith("Bearer ") ? candidate.slice(7) : "";
  return Boolean(expected && safeEqual(value, expected));
}

function sign(expires: string) {
  const secret = process.env.ADMIN_SECRET?.trim();
  if (!secret) throw new Error("ADMIN_SECRET absent");
  return createHmac("sha256", secret).update(`ink-v2:${expires}`).digest("hex");
}

export function createAdminCookie() {
  const expires = String(Math.floor(Date.now() / 1000) + SESSION_SECONDS);
  return { value: `${expires}.${sign(expires)}`, maxAge: SESSION_SECONDS };
}

export function isAdminRequest(request: NextRequest) {
  const raw = request.cookies.get(ADMIN_COOKIE)?.value;
  if (!raw) return false;
  const [expires, signature] = raw.split(".");
  if (!expires || !signature || Number(expires) <= Math.floor(Date.now() / 1000)) return false;
  try {
    return safeEqual(signature, sign(expires));
  } catch {
    return false;
  }
}

export function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  return origin === request.nextUrl.origin;
}

export function setAdminCookie(response: NextResponse) {
  const cookie = createAdminCookie();
  response.cookies.set(ADMIN_COOKIE, cookie.value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: cookie.maxAge,
  });
}

export function clearAdminCookie(response: NextResponse) {
  response.cookies.set(ADMIN_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
}
