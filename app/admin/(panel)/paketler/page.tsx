import { Fragment } from "react";
import { PAKET_BILGI_TABLO } from "@/lib/admin-paketler";

const ENTERPRISE_NOT =
  "İhtiyacınıza özel çözümler için bizimle iletişime geçin";

export default function AdminPaketlerPage() {
  return (
    <div>
      <h1 className="text-xl font-semibold text-white">Paketler</h1>
      <p className="mt-1 text-sm text-slate-500">
        Paket limitleri (referans; müşteri limiti firmada admin tarafından
        ayrıca belirlenir)
      </p>
      <div className="mt-6 overflow-x-auto rounded-lg border border-slate-800">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead className="bg-slate-900 text-slate-400">
            <tr>
              <th className="px-3 py-2 font-medium">Paket</th>
              <th className="px-3 py-2 font-medium">Kategori</th>
              <th className="px-3 py-2 font-medium">Ürün</th>
              <th className="px-3 py-2 font-medium">Fotoğraf</th>
              <th className="px-3 py-2 font-medium">AI (gün)</th>
            </tr>
          </thead>
          <tbody>
            {PAKET_BILGI_TABLO.map((p) =>
              p.tip === "sayisal" ? (
                <tr
                  key={p.kod}
                  className="border-t border-slate-800/80 text-slate-200"
                >
                  <td className="px-3 py-2 font-medium text-amber-200/90">
                    {p.ad}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{p.kategori}</td>
                  <td className="px-3 py-2 tabular-nums">{p.urun}</td>
                  <td className="px-3 py-2 tabular-nums">{p.fotograf}</td>
                  <td className="px-3 py-2 tabular-nums text-amber-200/90">
                    {p.ai_gunluk}/gün
                  </td>
                </tr>
              ) : (
                <Fragment key={p.kod}>
                  <tr className="border-t border-slate-800/80 text-slate-200">
                    <td className="px-3 py-2 font-medium text-amber-200/90">
                      {p.ad}
                    </td>
                    <td className="px-3 py-2 text-slate-300">Özel</td>
                    <td className="px-3 py-2 text-slate-300">Özel</td>
                    <td className="px-3 py-2 text-slate-300">Özel</td>
                    <td className="px-3 py-2 text-slate-300">Özel</td>
                  </tr>
                  <tr className="border-0 border-slate-800/80 bg-slate-900/30 text-slate-300">
                    <td
                      colSpan={5}
                      className="px-3 py-2 pt-0 text-xs text-amber-200/80"
                    >
                      {ENTERPRISE_NOT}
                    </td>
                  </tr>
                </Fragment>
              ),
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-sm text-slate-500">
        Sistemin maksimum kategori sınırı 50&apos;dir.
      </p>
    </div>
  );
}
