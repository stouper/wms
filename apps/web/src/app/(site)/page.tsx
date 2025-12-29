import Link from "next/link";

export default function SiteHomePage() {
  return (
    <main style={wrap}>
      <section style={hero}>
        <h1 style={title}>
          ESKA <span style={accent}>WMS</span>
        </h1>
        <p style={desc}>
          매장/창고/택배 운영을 하나로 묶는 내부 운영 시스템입니다.
          <br />
          폐쇄몰은 로그인 후 이용 가능합니다.
        </p>

        <div style={btnRow}>
          <Link href="/mall" style={primaryBtn}>
            폐쇄몰 이동
          </Link>
          <a href="#about" style={ghostBtn}>
            회사 소개
          </a>
        </div>
      </section>

      <section id="about" style={card}>
        <h2 style={h2}>회사 소개</h2>
        <p style={p}>
          ESKA는 매장 운영(재고/출고/입고), 주문 처리, 물류 흐름을 빠르고 정확하게
          만들기 위해 WMS를 구축하고 있습니다.
        </p>

        <ul style={ul}>
          <li style={li}>• 매장 출고/창고 입고 워크플로우</li>
          <li style={li}>• 폐쇄몰 주문/상품 운영</li>
          <li style={li}>• 택배 API 연동(예: CJ)</li>
        </ul>
      </section>

      <section id="download" style={card}>
        <h2 style={h2}>다운로드</h2>
        <p style={p}>내부 배포용 설치 파일/문서는 여기에 연결될 예정입니다.</p>
      </section>
    </main>
  );
}

const wrap: React.CSSProperties = {
  minHeight: "100vh",
  paddingTop: 72, // SiteNav fixed header offset
  background: "linear-gradient(180deg, #ffffff, #f8fafc)",
};

const hero: React.CSSProperties = {
  maxWidth: 1120,
  margin: "0 auto",
  padding: "46px 16px 28px",
};

const title: React.CSSProperties = {
  fontSize: 44,
  fontWeight: 950,
  letterSpacing: -1.2,
  margin: 0,
};

const accent: React.CSSProperties = {
  background: "linear-gradient(90deg, #6366f1, #10b981)",
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  color: "transparent",
};

const desc: React.CSSProperties = {
  marginTop: 12,
  maxWidth: 740,
  fontSize: 15,
  lineHeight: 1.6,
  color: "rgba(2,6,23,0.72)",
};

const btnRow: React.CSSProperties = {
  marginTop: 20,
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
};

const baseBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  height: 42,
  padding: "0 14px",
  borderRadius: 12,
  textDecoration: "none",
  fontWeight: 850,
  fontSize: 14,
  border: "1px solid rgba(0,0,0,0.10)",
};

const primaryBtn: React.CSSProperties = {
  ...baseBtn,
  color: "white",
  border: "none",
  background: "linear-gradient(90deg, #6366f1, #10b981)",
};

const ghostBtn: React.CSSProperties = {
  ...baseBtn,
  color: "rgba(2,6,23,0.85)",
  background: "rgba(2,6,23,0.04)",
};

const card: React.CSSProperties = {
  maxWidth: 1120,
  margin: "0 auto",
  padding: "22px 16px",
};

const h2: React.CSSProperties = {
  margin: "0 0 10px 0",
  fontSize: 18,
  fontWeight: 900,
  letterSpacing: -0.4,
};

const p: React.CSSProperties = {
  margin: 0,
  fontSize: 14,
  lineHeight: 1.7,
  color: "rgba(2,6,23,0.72)",
};

const ul: React.CSSProperties = {
  margin: "12px 0 0 0",
  paddingLeft: 16,
};

const li: React.CSSProperties = {
  margin: "6px 0",
  color: "rgba(2,6,23,0.75)",
  fontSize: 14,
};
