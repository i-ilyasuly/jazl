// Тапсырыс кодын басқанда көшіру (Патша, 2026-11-16: код көрсетілген барлық жерде).
import type { ReactNode } from "react";
import { copyText, haptic } from "../telegram";
import { toast } from "./Toast";

export async function copyCode(code: string) {
  if (await copyText(code)) { haptic.success(); toast(`Код ${code} көшірілді`); } else { haptic.error(); toast("Көшіру мүмкін болмады"); }
}

export function CopyCode({ code, className, children }: { code: string; className?: string; children?: ReactNode }) {
  return (
    <span role="button" tabIndex={0} aria-label={`Кодты көшіру: ${code}`} className={className} style={{ cursor: "copy" }}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); void copyCode(code); }}>
      {children ?? code}
    </span>
  );
}
