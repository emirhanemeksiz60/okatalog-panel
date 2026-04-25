"use client";

import { useId, useRef, useState } from "react";
import Image from "next/image";
import { cloudinaryGorselYukle } from "@/lib/cloudinary-upload";
import { useToast } from "@/context/toast-context";

type Props = {
  gorselUrls: string[];
  onAddUrl: (url: string) => void;
  onRemoveUrl: (index: number) => void;
};

function sadeceResimDosyalari(
  list: globalThis.FileList | File[] | null,
): File[] {
  if (!list) return [];
  return Array.from(list).filter(
    (f) => f.type.startsWith("image/") && f.size > 0,
  );
}

export function VariantFotoYukle({ gorselUrls, onAddUrl, onRemoveUrl }: Props) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const { show: toast } = useToast();
  const [surukle, setSurukle] = useState(false);
  const [yukleniyor, setYukleniyor] = useState(0);

  async function dosyalariYukle(dosyalar: File[]) {
    if (dosyalar.length === 0) {
      toast("error", "Lütfen sadece resim dosyası ekleyin.");
      return;
    }
    setYukleniyor((n) => n + 1);
    let ok = 0;
    try {
      for (const d of dosyalar) {
        try {
          const { secure_url } = await cloudinaryGorselYukle(d);
          onAddUrl(secure_url);
          ok += 1;
        } catch (e) {
          toast(
            "error",
            d.name + ": " + (e instanceof Error ? e.message : "Hata"),
          );
        }
      }
      if (ok > 0) {
        toast(
          "success",
          ok === 1
            ? "1 fotoğraf yüklendi."
            : `${ok} fotoğraf yüklendi.`,
        );
      }
    } finally {
      setYukleniyor((n) => n - 1);
    }
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  return (
    <div>
      <span className="text-xs text-slate-500">Fotoğraflar</span>
      <p className="mb-1.5 text-[11px] text-slate-500">
        Sürükle-bırak veya alanı tıklayın. Birden fazla seçim yapılabilir.
      </p>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (yukleniyor === 0) setSurukle(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setSurukle(false);
        }}
        onDrop={async (e) => {
          e.preventDefault();
          e.stopPropagation();
          setSurukle(false);
          if (yukleniyor > 0) return;
          const f = sadeceResimDosyalari(e.dataTransfer.files);
          if (f.length) await dosyalariYukle(f);
        }}
        className={`relative overflow-hidden rounded-lg border-2 border-dashed transition ${
          surukle && yukleniyor === 0
            ? "border-sky-500 bg-sky-50/80"
            : "border-slate-200 bg-slate-50/60"
        } ${yukleniyor > 0 ? "pointer-events-none" : ""} `}
      >
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          className="sr-only"
          accept="image/*"
          multiple
          onChange={async (e) => {
            if (yukleniyor > 0) return;
            const f = sadeceResimDosyalari(e.target.files);
            if (f.length) await dosyalariYukle(f);
            e.target.value = "";
          }}
        />
        <label
          htmlFor={inputId}
          className={`flex min-h-[5.5rem] cursor-pointer flex-col items-center justify-center gap-0.5 px-3 py-2 text-center ${
            yukleniyor > 0 ? "pointer-events-none" : ""
          }`}
        >
          {yukleniyor > 0 && (
            <div
              className="absolute inset-0 z-10 flex items-center justify-center rounded-md bg-white/80 backdrop-blur-sm"
              aria-live="polite"
            >
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className="h-7 w-7 animate-spin rounded-full border-2 border-slate-200 border-t-sky-600"
                  aria-hidden
                />
                <span className="text-xs font-medium text-slate-700">
                  Yükleniyor…
                </span>
              </div>
            </div>
          )}
          <span className="text-sm font-semibold text-slate-800">
            Fotoğraf Yükle
          </span>
          <span className="text-xs text-slate-500">
            jpg, png, webp… — çoklu seçim destekli
          </span>
        </label>
      </div>

      {gorselUrls.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2">
          {gorselUrls.map((u, j) => (
            <li
              key={`${j}-${u.slice(0, 32)}`}
              className="relative h-20 w-20 overflow-hidden rounded-md border border-slate-200 bg-slate-100"
            >
              <Image
                src={u}
                alt=""
                width={80}
                height={80}
                unoptimized
                className="h-full w-full object-cover"
              />
              <button
                type="button"
                onClick={() => onRemoveUrl(j)}
                className="absolute -right-1.5 -top-1.5 z-20 flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 bg-white text-sm leading-none text-slate-600 shadow hover:bg-red-50 hover:text-red-600"
                title="Kaldır"
                aria-label="Fotoğrafı kaldır"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
