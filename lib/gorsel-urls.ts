/** `gorsel_url` alanı: virgülle ayrılmış tam URL'ler, boşluklar trim. */
export function parseGorselUrlList(virgulMetin: string | null | undefined): string[] {
  if (virgulMetin == null || String(virgulMetin).trim() === "") {
    return [];
  }
  return String(virgulMetin)
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function gorselUrlListToAlan(urls: string[]): string {
  return urls.map((s) => s.trim()).filter(Boolean).join(",");
}
