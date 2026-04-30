import { supabase } from "./supabase";

export async function aktiviteKaydet({
  firmaId,
  kullaniciTipi = "esnaf",
  kullaniciId,
  islem,
  hedefTablo,
  hedefId,
  detay,
}: {
  firmaId: string;
  kullaniciTipi?: string;
  kullaniciId?: string;
  islem: string;
  hedefTablo: string;
  hedefId?: string;
  detay?: Record<string, unknown>;
}) {
  await supabase.from("aktivite_logu").insert({
    firma_id: firmaId,
    kullanici_tipi: kullaniciTipi,
    kullanici_id: kullaniciId,
    islem,
    hedef_tablo: hedefTablo,
    hedef_id: hedefId,
    detay,
  });
}
