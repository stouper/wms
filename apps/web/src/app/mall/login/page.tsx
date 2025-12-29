"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function MallLoginPage() {
  const router = useRouter();
  const [id, setId] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, password }),
      });

      const data = await res.json();

      if (!res.ok || !data?.ok) {
        setError("로그인 정보가 올바르지 않습니다.");
        setLoading(false);
        return;
      }

      // 🔑 역할 분기
      if (data.role === "admin") {
        router.push("/mall/admin");
      } else {
        router.push("/mall");
      }
    } catch (err) {
      setError("서버 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={page}>
      <section style={card}>
        <h1 style={title}>ESKA WMS</h1>
        <p style={subtitle}>폐쇄몰 로그인</p>

        <form onSubmit={onSubmit} style={form}>
          <input
            style={input}
            placeholder="아이디"
            value={id}
            onChange={(e) => setId(e.target.value)}
          />
          <input
            style={input}
            type="password"
            placeholder="비밀번호"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          {error && <p style={errorText}>{error}</p>}

          <button style={button} disabled={loading}>
            {loading ? "로그인 중..." : "로그인"}
          </button>
        </form>
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
};

const card: React.CSSProperties = {
  width: 360,
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
  marginBottom: 24,
  fontSize: 13,
  opacity: 0.6,
};

const form: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const input: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  fontSize: 14,
};

const button: React.CSSProperties = {
  marginTop: 6,
  padding: "12px 14px",
  borderRadius: 12,
  border: "none",
  fontSize: 14,
  fontWeight: 800,
  color: "white",
  background: "linear-gradient(90deg, #6366f1, #10b981)",
  cursor: "pointer",
};

const errorText: React.CSSProperties = {
  fontSize: 12,
  color: "#ef4444",
};
