import SiteNav from "@/components/navigation/SiteNav";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteNav />
      {children}
      <footer className="footer">
        <div className="container">
          © DHESKA · Internal WMS · core-api + Postgres
        </div>
      </footer>
    </>
  );
}
