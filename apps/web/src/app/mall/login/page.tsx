"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type Role = "customer" | "admin";

export default function MallLoginPage() {
  const router = useRouter();
  const sp = useSearchParams();

  // ?next=/mall/admin 같은 거 받으면 그걸 우선
  const next = useMemo(() => {
    const n = sp.get("next");
    return n && n.startsWith("/") ? n : "";
  }, [sp]);

  const [role, setRole] = useState<Role>("customer");
  const [secret, setSecret] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const payload: any = { role };
      if (secret.trim()) payload.secret = secret.trim();

      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.ok) {
        setError(data?.message || "로그인 정보가 올바르지 않습니다.");
        setLoading(false);
        return;
      }

      // ✅ 서버가 주는 redirectTo 우선, 단 next가 있으면 next가 우선
      const redirectTo = (next || data?.redirectTo || "/mall") as string;
      router.replace(redirectTo);
    } catch (err) {
      setError("서버 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={page}>
      <section style={card}>
        <h1 style={title}>DHESKA</h1>
        <p style={subtitle}>폐쇄몰 로그인</p>

        <form onSubmit={onSubmit} style={form}>
          <div style={segWrap} role="tablist" aria-label="role">
            <button
              type="button"
              onClick={() => setRole("customer")}
              style={role === "customer" ? segOn : segOff}
              aria-selected={role === "customer"}
            >
              고객
            </button>
            <button
              type="button"
              onClick={() => setRole("admin")}
              style={role === "admin" ? segOn : segOff}
              aria-selected={role === "admin"}
            >
              관리자
            </button>
          </div>

          <input
            style={input}
            type="password"
            placeholder="(선택) 관리자 시크릿"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            autoComplete="current-password"
          />

          {next ? (
            <p style={hintText}>
              로그인 후 <span style={mono}>{next}</span> 로 이동합니다.
            </p>
          ) : (
            <p style={hintText}>
              고객은 <span style={mono}>/mall</span>, 관리자는 <span style={mono}>/mall/admin</span> 으로 이동합니다.
            </p>
          )}

          {error && <p style={errorText}>{error}</p>}

          <button style={button} disabled={loading}>
            {loading ? "로그인 중..." : "로그인"}
          </button>
        </form>

        <div style={miniLinks}>
          <a href="/" style={link}>
            홈으로
          </a>
          <span style={{ opacity: 0.35 }}>·</span>
          <a href="/mall" style={link}>
            스토어
          </a>
        </div>
      </section>
    </main>
  );
}

/* ---------- styles ---------- */

const page: React.CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "linear-gradient(180deg, #ffffff, #f8fafc)",
  padding: 16,
};

const card: React.CSSProperties = {
  width: 380,
  maxWidth: "100%",
  padding: "32px 28px",
  borderRadius: 16,
  border: "1px solid rgba(0,0,0,0.08)",
  background: "white",
  boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
  textAlign: "center",
};

const title: React.CSSProperties = {
  fontSize: 26,
  fontWeight: 900,
  letterSpacing: -0.6,
};

const subtitle: React.CSSProperties = {
  marginTop: 6,
  marginBottom: 18,
  fontSize: 13,
  opacity: 0.6,
};

const form: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const segWrap: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 10,
};

const segBase: React.CSSProperties = {
  padding: "11px 12px",
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.12)",
  fontSize: 14,
  fontWeight: 800,
  cursor: "pointer",
  background: "white",
};

const segOn: React.CSSProperties = {
  ...segBase,
  color: "white",
  border: "none",
  background: "linear-gradient(90deg, #6366f1, #10b981)",
};

const segOff: React.CSSProperties = {
  ...segBase,
  color: "rgba(0,0,0,0.8)",
};

const input: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  fontSize: 14,
};

const hintText: React.CSSProperties = {
  marginTop: 2,
  fontSize: 12,
  opacity: 0.65,
  lineHeight: 1.5,
};

const mono: React.CSSProperties = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  fontSize: 12,
};

const button: React.CSSProperties = {
  marginTop: 4,
  padding: "12px 14px",
  borderRadius: 12,
  border: "none",
  fontSize: 14,
  fontWeight: 900,
  color: "white",
  background: "linear-gradient(90deg, #6366f1, #10b981)",
  cursor: "pointer",
};

const errorText: React.CSSProperties = {
  fontSize: 12,
  color: "#ef4444",
};

const miniLinks: React.CSSProperties = {
  marginTop: 14,
  fontSize: 12,
  opacity: 0.7,
  display: "flex",
  gap: 10,
  justifyContent: "center",
  alignItems: "center",
};

const link: React.CSSProperties = {
  color: "rgba(0,0,0,0.75)",
  textDecoration: "none",
};
