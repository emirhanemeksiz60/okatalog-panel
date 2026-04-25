import { DashboardLayoutShell } from "@/components/DashboardLayoutShell";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DashboardLayoutShell>{children}</DashboardLayoutShell>;
}
