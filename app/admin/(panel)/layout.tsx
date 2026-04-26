import { AdminLayoutShell } from "@/components/admin/AdminLayoutShell";

export default function AdminPanelGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AdminLayoutShell>{children}</AdminLayoutShell>;
}
