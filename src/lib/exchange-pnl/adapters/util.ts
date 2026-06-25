import crypto from "crypto";
import type { RawPage } from "../types";

// 어댑터 공용 유틸 — 서명/HTTP/시간윈도우 분할.

export function hmacSha256Hex(secret: string, msg: string): string {
  return crypto.createHmac("sha256", secret).update(msg).digest("hex");
}

export function hmacSha256Base64(secret: string, msg: string): string {
  return crypto.createHmac("sha256", secret).update(msg).digest("base64");
}

export function hmacSha512Hex(secret: string, msg: string): string {
  return crypto.createHmac("sha512", secret).update(msg).digest("hex");
}

export function sha512Hex(msg: string): string {
  return crypto.createHash("sha512").update(msg).digest("hex");
}

/** GET 쿼리스트링 빌드 (값이 undefined/null/"" 인 키 제외) */
export function buildQuery(params: Record<string, string | number | undefined | null>): string {
  const pairs: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    pairs.push(`${k}=${encodeURIComponent(String(v))}`);
  }
  return pairs.join("&");
}

/** fetch + JSON 파싱. 실패해도 throw 하지 않고 RawPage 로 반환(개발자가 원본 확인). */
export async function fetchJson(
  label: string,
  url: string,
  init?: RequestInit,
): Promise<{ page: RawPage; ok: boolean; body: unknown }> {
  const res = await fetch(url, init);
  const text = await res.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  const page: RawPage = { label, url, status: res.status, body };
  return { page, ok: res.ok, body };
}

/** [start,end] 를 windowMs 단위 청크로 분할 (Bybit 7일 등) */
export function splitWindows(
  startTime: number,
  endTime: number,
  windowMs: number,
): Array<{ start: number; end: number }> {
  const out: Array<{ start: number; end: number }> = [];
  let s = startTime;
  while (s < endTime) {
    const e = Math.min(s + windowMs, endTime);
    out.push({ start: s, end: e });
    s = e;
  }
  return out.length ? out : [{ start: startTime, end: endTime }];
}

export const DAY_MS = 24 * 60 * 60 * 1000;

/** 안전 number 파싱 */
export function num(v: unknown): number {
  if (v === undefined || v === null || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
