import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Gizlilik Politikası | oKatalog",
  description: "oKatalog uygulaması gizlilik politikası.",
};

export default function GizlilikPage() {
  return (
    <div className="min-h-svh bg-slate-50 text-slate-800">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link
            href="/"
            className="text-sm font-medium text-sky-700 hover:text-sky-800"
          >
            ← Panele dön
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
        <article className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Gizlilik Politikası
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Uygulama: <strong className="font-medium text-slate-800">oKatalog</strong>
          </p>

          <section className="mt-8 space-y-6 text-sm leading-relaxed text-slate-700">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Geliştirici</h2>
              <p className="mt-1">Emirhan Emeksiz</p>
            </div>

            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Toplanan veriler
              </h2>
              <p className="mt-1">
                oKatalog kapsamında işlenebilecek veri türleri şunları içerebilir:
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>Ad</li>
                <li>Müşteri kodu</li>
                <li>Sipariş bilgileri</li>
                <li>Push bildirim token&apos;ı</li>
                <li>Ürün görselleri</li>
              </ul>
            </div>

            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Verilerin saklanması
              </h2>
              <p className="mt-1">
                Veriler <strong className="font-medium text-slate-800">Supabase</strong>{" "}
                altyapısı üzerinde bulut ortamında saklanır.
              </p>
            </div>

            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Üçüncü taraf hizmetler
              </h2>
              <p className="mt-1">
                Hizmetin sunulması için aşağıdaki sağlayıcılar kullanılabilir:
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>Supabase</li>
                <li>Cloudinary</li>
                <li>Expo Push Notifications</li>
                <li>Sentry</li>
              </ul>
            </div>

            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Pazarlama ve paylaşım
              </h2>
              <p className="mt-1">
                Verileriniz üçüncü taraflarla pazarlama amacıyla paylaşılmaz.
              </p>
            </div>

            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Veri silme talebi
              </h2>
              <p className="mt-1">
                Kişisel verilerinizin silinmesini talep etmek için aşağıdaki
                adrese e-posta gönderebilirsiniz.
              </p>
            </div>

            <div>
              <h2 className="text-base font-semibold text-slate-900">İletişim</h2>
              <p className="mt-1">
                <a
                  className="text-sky-700 underline decoration-sky-700/30 underline-offset-2 hover:text-sky-800"
                  href="mailto:emirhanemeksiz9@gmail.com"
                >
                  emirhanemeksiz9@gmail.com
                </a>
              </p>
            </div>
          </section>
        </article>
      </main>
    </div>
  );
}
