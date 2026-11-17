// Суреттер (ұсыныс фотосы, мекеме логотипі мен мұқабасы). Патша (2026-11-17): Google Cloud Storage — арзан әрі жобамен бір жерде.
// Әр сурет серверде WebP-ке сығылады (сапасы 80, ең үлкені 1600 px) — 3 МБ фото ~150 КБ болып сақталады, трафик аз.
// Сақтау: MEDIA_BUCKET (Cloud Run, бакет жария оқуға ашық) немесе MEDIA_DIR (жергілікті әзірлеу/тест — /media арқылы беріледі).
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, normalize } from "node:path";
import { Hono } from "hono";
import sharp from "sharp";
import type { Config } from "./config.js";

export type MediaKind = "offer" | "logo" | "cover";
const SIZES: Record<MediaKind, { w: number; h: number; fit: "cover" | "inside" }> = {
  offer: { w: 1600, h: 1200, fit: "cover" }, // 4:3 (Figma «Негізгі фото»)
  logo: { w: 512, h: 512, fit: "cover" },
  cover: { w: 1600, h: 640, fit: "cover" },
};
export const MAX_BYTES = 5 * 1024 * 1024;
const TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export class MediaError extends Error { constructor(public code: string, public status: 400 | 413 | 415 | 503 = 400) { super(code); } }

export function mediaStore(cfg: Config) {
  const enabled = Boolean(cfg.MEDIA_BUCKET || cfg.MEDIA_DIR);
  return {
    enabled,
    async put(bytes: Uint8Array, contentType: string, kind: MediaKind, prefix: string): Promise<string> {
      if (!enabled) throw new MediaError("storage_disabled", 503);
      if (!TYPES.has(contentType)) throw new MediaError("bad_type", 415);
      if (bytes.byteLength > MAX_BYTES) throw new MediaError("too_large", 413);
      const sz = SIZES[kind];
      let out: Buffer;
      try { out = await sharp(bytes).rotate().resize(sz.w, sz.h, { fit: sz.fit, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer(); }
      catch { throw new MediaError("bad_image", 400); }
      const name = `${prefix}/${kind}-${randomUUID()}.webp`;
      if (cfg.MEDIA_BUCKET) {
        const { Storage } = await import("@google-cloud/storage");
        await new Storage().bucket(cfg.MEDIA_BUCKET).file(name).save(out, { contentType: "image/webp", resumable: false, metadata: { cacheControl: "public, max-age=31536000, immutable" } });
        return `https://storage.googleapis.com/${cfg.MEDIA_BUCKET}/${name}`;
      }
      const path = join(cfg.MEDIA_DIR!, name);
      await mkdir(join(path, ".."), { recursive: true }); await writeFile(path, out);
      return `${cfg.PUBLIC_URL ?? ""}/media/${name}`;
    },
  };
}

/** Жергілікті әзірлеуде MEDIA_DIR ішіндегі суреттерді береді (бұлтта бакет өзі береді) */
export function localMediaRoutes(cfg: Config) {
  const r = new Hono();
  r.get("/*", async (c) => {
    if (!cfg.MEDIA_DIR) return c.notFound();
    const rel = normalize(c.req.path.replace(/^\/media\//, "")).replace(/^(\.\.[/\\])+/, "");
    try { return c.body(new Uint8Array(await readFile(join(cfg.MEDIA_DIR, rel))), 200, { "Content-Type": "image/webp", "Cache-Control": "public, max-age=31536000" }); }
    catch { return c.notFound(); }
  });
  return r;
}
