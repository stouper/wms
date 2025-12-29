// src/lib/auth.ts
export type UserRole = "admin" | "customer";
export type Session = { role: UserRole };

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

export function encodeSessionCookie(session: Session) {
  return Buffer.from(JSON.stringify(session), "utf8").toString("base64");
}
