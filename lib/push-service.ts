export async function sendPushNotification(
  token: string,
  title: string,
  body: string,
): Promise<void> {
  const t = token.trim();
  if (!t) return;
  console.log("[push-service] /api/send-push request:", {
    token: t,
    title,
    body,
  });

  const res = await fetch("/api/send-push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      token: t,
      title,
      body,
    }),
  });
  const txt = await res.text();
  console.log("[push-service] /api/send-push response:", {
    status: res.status,
    body: txt,
  });

  if (!res.ok) {
    throw new Error(
      `Push gönderilemedi (${res.status}): ${txt || "Bilinmeyen hata"}`,
    );
  }
}
