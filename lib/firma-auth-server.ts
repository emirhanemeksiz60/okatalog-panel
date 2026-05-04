import type { AuthSession } from "@/lib/types";
import {
  createFirmaServiceRoleClient,
  firmaCoz,
  FIRMA_SUTUN_SECIM,
} from "@/lib/supabase-firma";

export async function getFirmaAuthSessionById(
  firmaId: string,
): Promise<AuthSession | null> {
  const sb = createFirmaServiceRoleClient();
  const { data, error } = await sb
    .from("firmalar")
    .select(FIRMA_SUTUN_SECIM)
    .eq("id", firmaId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    firma: firmaCoz(data),
    loggedInAt: new Date().toISOString(),
  };
}
