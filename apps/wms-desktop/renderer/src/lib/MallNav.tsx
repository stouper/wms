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

  const tabClass = (href: string) =>
    `wmsTab ${isActive(href) ? "wmsTab--active" : ""}`;

  return (
    <header className="navbar">
      <div className="container navbar-inner">
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <Link href="/mall" className="brand" style={{ textDecoration: "none" }}>
            <span>Mall</span>
            <span style={{ opacity: 0.75, fontWeight: 900 }}>Store</span>
          </Link>
          <span className="wmsPill">CUSTOMER</span>
        </div>

        <nav style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <Link href="/mall" className={tabClass("/mall")}>
            상품
          </Link>

          <Link href="/mall/orders" className={tabClass("/mall/orders")}>
            주문
          </Link>

          <Link href="/" className="wmsBtn">
            홈
          </Link>

          <button type="button" onClick={onLogout} className="wmsBtn wmsBtn--ghost">
            로그아웃
          </button>
        </nav>
      </div>
    </header>
  );
}
