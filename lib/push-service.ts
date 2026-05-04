export async function sendPushNotification(
  firmaId: string,
  token: string,
  title: string,
  body: string,
): Promise<void> {
  const f = firmaId.trim();
  const t = token.trim();
  if (!f || !t) return;

  const res = await fetch("/api/send-push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      firma_id: f,
      token: t,
      title,
      body,
    }),
  });
  const txt = await res.text();

  if (!res.ok) {
    throw new Error(
      `Push gönderilemedi (${res.status}): ${txt || "Bilinmeyen hata"}`,
    );
  }
}
