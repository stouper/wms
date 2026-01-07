export default function SiteNav() {
  return (
    <header className="navbar">
      <div className="container navbar-inner">
        <div className="brand">
          <div className="brand-badge" />
          <span>DHESKA</span>
        </div>

        <nav className="nav-links">
          <a href="/">홈</a>

          {/* ✅ 폐쇄몰은 로그인으로 진입 */}
          <a href="/mall/login">폐쇄몰(로그인)</a>

          <a href="https://api.dheska.com" target="_blank" rel="noreferrer">
            API
          </a>
        </nav>
      </div>
    </header>
  );
}
