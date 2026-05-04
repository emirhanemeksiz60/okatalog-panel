export type CloudinaryYukleSonucu = { secure_url: string };

type ApiJson = {
  success?: boolean;
  url?: string;
  error?: string;
};

type CldJson = {
  secure_url?: string;
  error?: { message?: string };
};

function readFileAsDataURL(dosya: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Dosya okunamadı."));
    r.readAsDataURL(dosya);
  });
}

/**
 * Route handler / sunucu: base64 görseli Cloudinary'ye yükler, `secure_url` döner.
 * Env yoksa veya Cloudinary hata dönerse `Error` fırlatır.
 */
export async function cloudinarySunucuBase64Yukle(
  imageBase64: string,
): Promise<string> {
  const BULUT_AD = process.env.CLOUDINARY_CLOUD_NAME?.trim();
  const ONYUKLEME_PRESET = process.env.CLOUDINARY_UPLOAD_PRESET?.trim();

  if (!BULUT_AD || !ONYUKLEME_PRESET) {
    throw new Error("Cloudinary env değişkenleri eksik");
  }

  const raw = String(imageBase64 ?? "").trim();
  if (!raw) {
    throw new Error("imageBase64 zorunlu.");
  }

  const fileField = raw.startsWith("data:")
    ? raw
    : `data:image/png;base64,${raw}`;

  const form = new FormData();
  form.append("file", fileField);
  form.append("upload_preset", ONYUKLEME_PRESET);

  const url = `https://api.cloudinary.com/v1_1/${BULUT_AD}/image/upload`;
  const res = await fetch(url, { method: "POST", body: form });
  const data = (await res.json().catch(() => ({}))) as CldJson;

  if (!res.ok) {
    throw new Error(
      data.error?.message ||
        `Cloudinary hata: ${res.status} ${res.statusText}`,
    );
  }
  if (data.error?.message) {
    throw new Error(data.error.message);
  }
  if (!data.secure_url) {
    throw new Error("Yanıtta secure_url yok.");
  }
  return data.secure_url;
}

/**
 * Sunucu route `/api/cloudinary-upload` üzerinden yükler (Cloudinary anahtarları yalnız sunucuda).
 * @see https://cloudinary.com/documentation/image_upload_api_reference
 */
export async function cloudinaryGorselYukle(
  dosya: File,
): Promise<CloudinaryYukleSonucu> {
  const dataUrl = await readFileAsDataURL(dosya);
  const imageBase64 = dataUrl.includes(",")
    ? dataUrl.slice(dataUrl.indexOf(",") + 1)
    : dataUrl;

  const res = await fetch("/api/cloudinary-upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageBase64 }),
  });
  const txt = await res.text();
  let json: ApiJson;
  try {
    json = JSON.parse(txt) as ApiJson;
  } catch {
    throw new Error(
      `Cloudinary yanıtı okunamadı (${res.status}): ${txt.slice(0, 200)}`,
    );
  }
  if (!res.ok || json.success === false || !json.url) {
    throw new Error(json.error || `Yükleme hatası (${res.status})`);
  }
  return { secure_url: json.url };
}
