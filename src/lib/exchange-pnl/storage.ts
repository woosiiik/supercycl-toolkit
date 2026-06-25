import type { ExchangeId, StoredData } from "./types";

// localStorage 저장 — API key(자격증명)와 수집 데이터를 거래소별로 보관.
// API key는 read-only 키 전제(요구사항). 평문 저장.

const CRED_PREFIX = "exchange-pnl-cred-";
const DATA_PREFIX = "exchange-pnl-data-";

// === 자격증명 ===
export function loadCredentials(exchange: ExchangeId): Record<string, string> {
  try {
    const raw = localStorage.getItem(CRED_PREFIX + exchange);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export function saveCredentials(exchange: ExchangeId, creds: Record<string, string>): void {
  try {
    localStorage.setItem(CRED_PREFIX + exchange, JSON.stringify(creds));
  } catch {
    /* ignore */
  }
}

export function clearCredentials(exchange: ExchangeId): void {
  localStorage.removeItem(CRED_PREFIX + exchange);
}

// === 수집 데이터 ===
export function loadData(exchange: ExchangeId): StoredData | null {
  try {
    const raw = localStorage.getItem(DATA_PREFIX + exchange);
    return raw ? (JSON.parse(raw) as StoredData) : null;
  } catch {
    return null;
  }
}

export function saveData(data: StoredData): void {
  try {
    localStorage.setItem(DATA_PREFIX + data.exchange, JSON.stringify(data));
  } catch {
    console.warn("수집 데이터 저장 실패: localStorage 용량 초과 가능");
  }
}

export function clearData(exchange: ExchangeId): void {
  localStorage.removeItem(DATA_PREFIX + exchange);
}
