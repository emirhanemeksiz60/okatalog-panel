/** Panel istemcisi: aktiviteyi cookie oturumuyla API üzerinden kaydeder. */

export async function aktiviteKaydet({
  firmaId: _firmaId,
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
  try {
    const res = await fetch("/api/dashboard/mutate", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tip: "aktivite",
        payload: {
          action: "kaydet",
          kullanici_tipi: kullaniciTipi,
          kullanici_id: kullaniciId,
          islem,
          hedef_tablo: hedefTablo,
          hedef_id: hedefId,
          detay,
        },
      }),
    });
    if (!res.ok) {
      console.warn("aktiviteKaydet HTTP", res.status, await res.text());
    }
  } catch (e) {
    console.warn("aktiviteKaydet", e);
  }
}
