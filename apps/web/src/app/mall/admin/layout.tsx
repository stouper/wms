import AdminNav from "@/components/navigation/AdminNav";

export default function MallAdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AdminNav />
      <main style={{ paddingTop: 64 }}>{children}</main>
    </>
  );
}
