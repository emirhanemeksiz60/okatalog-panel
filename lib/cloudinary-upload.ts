export type CloudinaryYukleSonucu = { secure_url: string };

type ApiJson = {
  success?: boolean;
  url?: string;
  error?: string;
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
