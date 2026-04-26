import { parseGorselUrlList } from "@/lib/gorsel-urls";

export function toplamFotografGorselUrl(g: string | null | undefined): number {
  if (g == null || !String(g).trim()) return 0;
  return parseGorselUrlList(String(g)).length;
}
