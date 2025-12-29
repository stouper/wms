import MallNav from "@/components/navigation/MallNav";

export default function MallStoreLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <MallNav />
      {/* 네비가 sticky라 본문 상단 여백 확보 */}
      <main style={{ paddingTop: 64 }}>{children}</main>
    </>
  );
}
