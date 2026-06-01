const ADMIN_SESSION_STORAGE_KEY = "ultra-svet-admin-session";

export function markAdminSession() {
  if (typeof window === "undefined") return;
  localStorage.setItem(ADMIN_SESSION_STORAGE_KEY, "1");
}

export function clearAdminSession() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(ADMIN_SESSION_STORAGE_KEY);
}
