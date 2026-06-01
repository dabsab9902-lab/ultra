import { createHash, timingSafeEqual } from "crypto";

export const ADMIN_SESSION_COOKIE = "ultra-svet-admin-session";

const SESSION_TTL_SECONDS = 60 * 60 * 12;
const DEFAULT_ADMIN_LOGIN = "admin";
const DEFAULT_ADMIN_PASSWORD = "1234";

export function verifyAdminPassword(password: unknown) {
  if (typeof password !== "string") return false;
  return safeEqual(password.trim(), getAdminPassword());
}

export function verifyAdminCredentials(login: unknown, password: unknown) {
  if (typeof login !== "string" || !login.trim()) return false;
  const normalizedLogin = login.trim();

  return (
    safeEqual(normalizedLogin, getAdminLogin()) &&
    verifyAdminPassword(password)
  );
}

export function createAdminSessionToken() {
  return hash(`${getAdminLogin()}:${getAdminPassword()}:ultra-svet-admin`);
}

export function isValidAdminSession(token?: string) {
  if (!token) return false;
  return safeEqual(token, createAdminSessionToken());
}

export function getAdminCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}

function getAdminPassword() {
  return process.env.ADMIN_PASSWORD?.trim() || DEFAULT_ADMIN_PASSWORD;
}

function getAdminLogin() {
  return process.env.ADMIN_LOGIN?.trim() || DEFAULT_ADMIN_LOGIN;
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function safeEqual(a: string, b: string) {
  const aHash = Buffer.from(hash(a));
  const bHash = Buffer.from(hash(b));
  return aHash.length === bHash.length && timingSafeEqual(aHash, bHash);
}
