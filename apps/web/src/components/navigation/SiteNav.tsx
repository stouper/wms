import Link from "next/link";

export default function SiteNav() {
  return (
    <header style={wrap}>
      <div style={inner}>
        {/* left: brand */}
        <div style={left}>
          <Link href="/" style={brand}>
            ESKA <span style={brandAccent}>WMS</span>
          </Link>
        </div>

        {/* right: public nav */}
        <nav style={nav}>
          <Link href="/" style={navBtn}>
            홈
          </Link>
          <Link href="/mall" style={navBtn}>
            폐쇄몰
          </Link>
        </nav>
      </div>
    </header>
  );
}

/* ---------- styles ---------- */

const wrap: React.CSSProperties = {
  position: "fixed",
  top: 0,
  width: "100%",
  zIndex: 50,
  background: "rgba(255,255,255,0.65)",
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
};

const left: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
};

const brand: React.CSSProperties = {
  textDecoration: "none",
  fontWeight: 950,
  letterSpacing: -0.6,
  color: "rgba(2,6,23,0.92)",
  fontSize: 16,
};

const brandAccent: React.CSSProperties = {
  background: "linear-gradient(90deg, #6366f1, #10b981)",
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  color: "transparent",
};

const nav: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const navBtn: React.CSSProperties = {
  textDecoration: "none",
  padding: "8px 12px",
  borderRadius: 10,
  fontSize: 13,
  fontWeight: 700,
  color: "rgba(2,6,23,0.75)",
  background: "rgba(2,6,23,0.04)",
  border: "1px solid rgba(2,6,23,0.08)",
};
