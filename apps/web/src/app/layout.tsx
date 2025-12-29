import "./globals.css";

export const metadata = {
  title: "ESKA",
  description: "ESKA web",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
