// src/lib/auth.ts
export type UserRole = "admin" | "customer";
export type Session = { role: UserRole };

export const SESSION_COOKIE = "wms_session";
export const ROLE_COOKIE = "wms_role";

/** wms_session: base64(JSON) */
export function encodeSession(session: Session): string {
  const json = JSON.stringify(session);
  return Buffer.from(json, "utf8").toString("base64");
}

export function parseSessionCookie(cookieValue?: string | null): Session | null {
  if (!cookieValue) return null;
  try {
    const json = Buffer.from(cookieValue, "base64").toString("utf8");
    const data = JSON.parse(json) as Session;
    if (data && (data.role === "admin" || data.role === "customer")) return data;
    return null;
  } catch {
    return null;
  }
}
