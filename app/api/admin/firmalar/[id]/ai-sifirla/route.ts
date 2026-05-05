import { NextResponse } from "next/server";
import { unauthorizedUnlessAdmin } from "@/lib/admin-route-guard";
import { createFirmaServiceRoleClient } from "@/lib/supabase-firma";

type RouteCtx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, context: RouteCtx) {
  const deny = await unauthorizedUnlessAdmin();
  if (deny) return deny;

  const { id } = await context.params;
  if (!id?.trim()) {
    return NextResponse.json({ ok: false, error: "id eksik." }, { status: 400 });
  }

  let sb: ReturnType<typeof createFirmaServiceRoleClient>;
  try {
    sb = createFirmaServiceRoleClient();
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : "Sunucu yapılandırması eksik.",
      },
      { status: 500 },
    );
  }

  const { error } = await sb
    .from("firmalar")
    .update({ ai_kullanim_bugun: 0 })
    .eq("id", id.trim());
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
