import type { Metadata, Viewport } from 'next';
import './globals.css';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'ESKA – 회사 홈페이지 & 폐쇄몰',
  description: '회사 소개와 내부 폐쇄몰',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <header className="navbar">
          <div className="container navbar-inner">
            <Link href="/" className="brand">
              <span className="brand-badge" />
              <span>ESKA</span>
            </Link>
            <nav className="nav-links">
              <Link href="/mall">Mall</Link>
              <Link href="/mall/shop">Shop</Link>
              <Link href="/mall/admin">Admin</Link>
              <Link href="/mall/login">Login</Link>
            </nav>
          </div>
        </header>

        <main>{children}</main>

        <footer className="footer">
          <div className="container">© {new Date().getFullYear()} ESKA. All rights reserved.</div>
        </footer>
      </body>
    </html>
  );
}
