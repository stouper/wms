"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

export default function MallNav() {
  const pathname = usePathname();
  const router = useRouter();

  const onLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {}
    router.replace("/mall/login");
    router.refresh();
  };

  const isActive = (href: string) => {
    if (href === "/mall") return pathname === "/mall";
    return pathname?.startsWith(href);
  };

  return (
    <header style={wrap}>
      <div style={inner}>
        <div style={left}>
          <Link href="/mall" style={brand}>
            Mall <span style={brandAccent}>Store</span>
          </Link>
          <span style={pill}>CUSTOMER</span>
        </div>

        <nav style={nav}>
          <Link href="/mall" style={isActive("/mall") ? linkStrong : link}>
            상품
          </Link>
          <Link href="/mall/orders" style={isActive("/mall/orders") ? linkStrong : link}>
            주문
          </Link>
          <Link href="/" style={linkGhost}>
            홈
          </Link>

          <button type="button" onClick={onLogout} style={btnGhost}>
            로그아웃
          </button>
        </nav>
      </div>
    </header>
  );
}

/* ---------- styles ---------- */

const wrap: React.CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 50,
  background: "rgba(255,255,255,0.70)",
  backdropFilter: "blur(10px)",
  borderBottom: "1px solid rgba(0,0,0,0.08)",
};

const inner: React.CSSProperties = {
  maxWidth: 1120,
  margin: "0 auto",
  padding: "10px 14px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
};

const left: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap",
};

const brand: React.CSSProperties = {
  textDecoration: "none",
  fontWeight: 950,
  letterSpacing: -0.6,
  color: "rgba(2,6,23,0.92)",
  fontSize: 16,
};

const brandAccent: React.CSSProperties = {
  background: "linear-gradient(90deg, rgba(99,102,241,1), rgba(16,185,129,1))",
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  color: "transparent",
};

const pill: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  height: 26,
  padding: "0 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 900,
  letterSpacing: 0.4,
  color: "rgba(2,6,23,0.75)",
  border: "1px solid rgba(0,0,0,0.10)",
  background: "rgba(255,255,255,0.75)",
};

const nav: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
};

const linkBase: React.CSSProperties = {
  textDecoration: "none",
  padding: "8px 12px",
  borderRadius: 12,
  fontSize: 13,
  fontWeight: 850,
  border: "1px solid rgba(0,0,0,0.08)",
  background: "rgba(255,255,255,0.70)",
  color: "rgba(2,6,23,0.82)",
};

const link: React.CSSProperties = { ...linkBase };

const linkStrong: React.CSSProperties = {
  ...linkBase,
  border: "1px solid rgba(0,0,0,0.10)",
  background: "linear-gradient(90deg, rgba(99,102,241,0.16), rgba(16,185,129,0.14))",
  color: "rgba(2,6,23,0.92)",
};

const linkGhost: React.CSSProperties = {
  ...linkBase,
  background: "rgba(2,6,23,0.04)",
  border: "1px solid rgba(0,0,0,0.10)",
};

const btnGhost: React.CSSProperties = {
  ...linkGhost,
  cursor: "pointer",
};
