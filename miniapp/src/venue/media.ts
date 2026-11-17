// Сурет жүктеу: телефонда алдымен кішірейтеміз (ең үлкен жағы 2000 px, JPEG 0,9) — iPhone HEIC те JPEG-ке айналады,
// трафик азаяды. Сервер оны WebP-ке сығып, бакетке салады да, ашық URL қайтарады.
import { API_URL } from "../api";

async function shrink(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas"); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("blob"))), "image/jpeg", 0.9));
  } catch { return file; }
}

export async function uploadImage(venueId: string, file: File, kind: "offer" | "logo" | "cover"): Promise<string> {
  const body = await shrink(file);
  const wa = (window as unknown as { Telegram?: { WebApp?: { initData?: string } } }).Telegram?.WebApp;
  let init = wa?.initData ?? "";
  if (!init && import.meta.env.DEV) { try { init = localStorage.getItem("medeo_dev_init") ?? ""; } catch { /* жоқ */ } }
  const res = await fetch(`${API_URL}/v1/venue/${venueId}/media?kind=${kind}`, { method: "POST", body, headers: { Authorization: "tma " + init, "Content-Type": body.type || "image/jpeg" } });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(j?.error ?? "http_" + res.status), { body: j });
  return j.url as string;
}

/** Файл таңдау терезесін ашады (Telegram ішінде — галерея не камера) */
export function pickImage(): Promise<File | null> {
  return new Promise((res) => {
    const i = document.createElement("input"); i.type = "file"; i.accept = "image/*";
    i.onchange = () => res(i.files?.[0] ?? null);
    i.click();
  });
}
