"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

export default function AdminNav() {
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
    if (href === "/mall/admin") return pathname === "/mall/admin";
    return pathname?.startsWith(href);
  };

  const tabClass = (href: string) =>
    `wmsTab ${isActive(href) ? "wmsTab--active" : ""}`;

  return (
    <header className="navbar">
      <div className="container navbar-inner">
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <Link href="/mall/admin" className="brand" style={{ textDecoration: "none" }}>
            <span>Admin</span>
            <span style={{ opacity: 0.75, fontWeight: 900 }}>Console</span>
          </Link>
          <span className="wmsPill">ADMIN</span>
        </div>

        <nav style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <Link href="/mall/admin" className={tabClass("/mall/admin")}>
            대시보드
          </Link>

          <Link href="/mall/admin/products" className={tabClass("/mall/admin/products")}>
            상품관리
          </Link>

          <Link href="/mall/admin/orders" className={tabClass("/mall/admin/orders")}>
            주문관리
          </Link>

          {/* 고객화면/로그아웃은 버튼 톤 통일 */}
          <Link href="/mall" className="wmsBtn">
            고객화면
          </Link>

          <button type="button" onClick={onLogout} className="wmsBtn wmsBtn--ghost">
            로그아웃
          </button>
        </nav>
      </div>
    </header>
  );
}
