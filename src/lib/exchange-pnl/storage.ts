import type { ExchangeId, StoredData, CollectMethod } from "./types";

// localStorage 저장 — API key(자격증명)와 수집 데이터를 거래소별로 보관.
// API key는 read-only 키 전제(요구사항). 평문 저장.
//
// 자격증명(API key)은 수집 방식과 무관하게 동일하므로 두 도구(position/trade)가 공유한다
// → 기존 키("exchange-pnl-cred-")를 그대로 사용.
// 수집 데이터만 방식별로 네임스페이스를 분리한다(position은 기존 키 유지, trade는 별도).

const CRED_PREFIX = "exchange-pnl-cred-"; // 공유

function dataPrefix(method: CollectMethod): string {
  return method === "trade" ? "exchange-pnl-trade-data-" : "exchange-pnl-data-";
}

// === 자격증명 (position/trade 공유) ===
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

// === 수집 데이터 (방식별 분리) ===
export function loadData(exchange: ExchangeId, method: CollectMethod = "position"): StoredData | null {
  try {
    const raw = localStorage.getItem(dataPrefix(method) + exchange);
    return raw ? (JSON.parse(raw) as StoredData) : null;
  } catch {
    return null;
  }
}

export function saveData(data: StoredData, method: CollectMethod = "position"): void {
  try {
    localStorage.setItem(dataPrefix(method) + data.exchange, JSON.stringify(data));
  } catch {
    console.warn("수집 데이터 저장 실패: localStorage 용량 초과 가능");
  }
}

export function clearData(exchange: ExchangeId, method: CollectMethod = "position"): void {
  localStorage.removeItem(dataPrefix(method) + exchange);
}
