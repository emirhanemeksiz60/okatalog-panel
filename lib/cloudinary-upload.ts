const BULUT_AD =
  process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? "do3sqiae8";
const ONYUKLEME_PRESET =
  process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET ?? "okatalog";

export type CloudinaryYukleSonucu = { secure_url: string };

type CldJson = { secure_url?: string; error?: { message?: string } };

/**
 * Unsigned (upload_preset) resim yükler; next-cloudinary kullanmaz.
 * @see https://cloudinary.com/documentation/image_upload_api_reference
 */
export async function cloudinaryGorselYukle(
  dosya: File,
): Promise<CloudinaryYukleSonucu> {
  const form = new FormData();
  form.append("file", dosya);
  form.append("upload_preset", ONYUKLEME_PRESET);
  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${BULUT_AD}/image/upload`,
    { method: "POST", body: form },
  );
  const data: CldJson = (await res.json().catch(() => ({}))) as CldJson;
  if (!res.ok) {
    throw new Error(
      data.error?.message || `Yükleme hatası (${res.status} ${res.statusText})`,
    );
  }
  if (data.error?.message) {
    throw new Error(data.error.message);
  }
  if (!data.secure_url) {
    throw new Error("Yanıt geçersiz (görsel URL yok).");
  }
  return { secure_url: data.secure_url };
}
