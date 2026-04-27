import { PAKET_BILGI_TABLO } from "@/lib/admin-paketler";

export default function AdminPaketlerPage() {
  return (
    <div>
      <h1 className="text-xl font-semibold text-white">Paketler</h1>
      <p className="mt-1 text-sm text-slate-500">
        Paket limitleri (referans; firma limitleri ayrıca ayarlanabilir)
      </p>
      <div className="mt-6 overflow-x-auto rounded-lg border border-slate-800">
        <table className="w-full min-w-[600px] text-left text-sm">
          <thead className="bg-slate-900 text-slate-400">
            <tr>
              <th className="px-3 py-2 font-medium">Paket</th>
              <th className="px-3 py-2 font-medium">Kategori</th>
              <th className="px-3 py-2 font-medium">Müşteri</th>
              <th className="px-3 py-2 font-medium">Ürün</th>
              <th className="px-3 py-2 font-medium">Fotoğraf</th>
              <th className="px-3 py-2 font-medium">AI (gün)</th>
              <th className="px-3 py-2 min-w-[14rem] font-medium">Not</th>
            </tr>
          </thead>
          <tbody>
            {PAKET_BILGI_TABLO.map((p) => (
              <tr
                key={p.kod}
                className="border-t border-slate-800/80 text-slate-200"
              >
                <td className="px-3 py-2 font-medium text-amber-200/90">
                  {p.ad}
                </td>
                <td className="px-3 py-2 tabular-nums">{p.kategori}</td>
                <td className="px-3 py-2 tabular-nums">{p.musteri}</td>
                <td className="px-3 py-2 tabular-nums">{p.urun}</td>
                <td className="px-3 py-2 tabular-nums">{p.fotograf}</td>
                <td className="px-3 py-2 tabular-nums text-amber-200/90">
                  {p.ai_gunluk}/gün
                </td>
                <td className="px-3 py-2 text-xs text-slate-500">
                  {p.not ? (
                    <span className="text-amber-200/80">{p.not}</span>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
