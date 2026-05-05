/** Panel limit bilgisi; istemci alanı yalnızca tip + yardımcı metinler. */

export type FirmaLimitBilgisi = {
  limits: {
    max_kategori: number;
    max_musteri: number;
    max_urun: number;
    max_fotograf: number;
  };
  kullanim: {
    kategori: number;
    musteri: number;
    urun: number;
    fotograf: number;
  };
};

/** Oturum çerezi ile `/api/dashboard/data?tip=limit_bilgisi` çağırır (`firmaId` doğruluğu için). */
export async function yukleFirmaLimitBilgisi(
  firmaId: string | undefined | null,
): Promise<FirmaLimitBilgisi> {
  if (!firmaId?.trim()) {
    throw new Error("Firma oturumu yok.");
  }
  const res = await fetch(
    `/api/dashboard/data?tip=${encodeURIComponent("limit_bilgisi")}`,
    { credentials: "include" },
  );
  const j = (await res.json()) as { ok?: boolean; error?: string; limitB?: FirmaLimitBilgisi };
  if (!res.ok || !j.ok || !j.limitB) {
    throw new Error(j.error ?? "Limit bilgisi alınamadı.");
  }
  return j.limitB;
}

export function limitIletisimMesaj(
  tur: "urun" | "kategori" | "musteri",
  mevc: number,
  maks: number,
) {
  const t =
    tur === "urun"
      ? "Ürün"
      : tur === "kategori"
        ? "Kategori"
        : "Müşteri";
  return `${t} limitinize ulaştınız (${mevc}/${maks}). Yükseltmek için bizimle iletişime geçin.`;
}

export function limitFotografMesaj(mevc: number, maks: number) {
  return `Fotoğraf limitinize ulaştınız (${mevc}/${maks}). Yükseltmek için bizimle iletişime geçin.`;
}
