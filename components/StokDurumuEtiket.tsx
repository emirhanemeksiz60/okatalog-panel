import {
  stokDegeriToKod,
  stokKoduToEtiketClassName,
  stokKoduToMetin,
} from "@/lib/stok-durumu";

type Props = {
  /** `varyantlar.stok_durumu` ham değer */
  stokDegeri: unknown;
  className?: string;
};

export function StokDurumuEtiket({ stokDegeri, className = "" }: Props) {
  const kod = stokDegeriToKod(stokDegeri);
  return (
    <span
      className={`inline-block rounded-md px-2.5 py-1 text-xs font-bold tracking-tight ${stokKoduToEtiketClassName(
        kod,
      )} ${className}`.trim()}
    >
      {stokKoduToMetin(kod)}
    </span>
  );
}
