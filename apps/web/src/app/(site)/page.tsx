export default function HomePage() {
  return (
    <main className="container oneScreen">
      <section className="hero oneScreenHero">
        <div className="hero-pane hero-pane-compact">
          <h1>DHESKA</h1>
          <p>
            내부 운영을 위한 WMS를 직접 개발·운영하고 있습니다.
            <br />
            Desktop(Electron) · core-api · Postgres 기반 단일 시스템.
          </p>

          <div className="cta-row">
            {/* ✅ 폐쇄몰은 로그인으로 진입 */}
            <a className="btn btn-primary" href="/mall/login">
              폐쇄몰 (로그인)
            </a>

            <a className="btn" href="https://api.dheska.com" target="_blank" rel="noreferrer">
              API
            </a>
          </div>

          <div className="meta-line">
            현재 Web은 안내용이며, 실무 처리는 Desktop에서 진행됩니다.
          </div>

          <div className="grid oneScreenGrid">
            <div className="card">
              <h3>작업지시 중심</h3>
              <p>요청을 Job으로 전환해 스캔·피킹 흐름으로 처리합니다.</p>
            </div>
            <div className="card">
              <h3>엑셀 템플릿</h3>
              <p>우리 회사 포맷 기준으로 업로드·검증을 단순화합니다.</p>
            </div>
            <div className="card">
              <h3>라벨/프린터</h3>
              <p>프린터는 Desktop에서 직접, 서버는 정책만 유지합니다.</p>
            </div>
          </div>

          <div className="slimLine">
            <span className="slimTitle">Status</span>
            <span className="slimText">
              Postgres 이전 완료 · Desktop↔DB 연결 완료 · CJ는 라벨 단계 예정
            </span>
            <span className="slimSep">·</span>
            <span className="slimTitle">Contact</span>
            <span className="slimText mono">contact@dheska.com</span>
          </div>
        </div>
      </section>
    </main>
  );
}
