import SiteNav from "../../components/navigation/SiteNav";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteNav />
      {children}
    </>
  );
}
