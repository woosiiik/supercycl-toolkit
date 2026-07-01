import type { CollectRequest, CollectResult, NormalizedRow, RawPage, ReconstructedPosition } from "../../types";
import { fetchJson, hmacSha512Hex, sha512Hex, buildQuery, num } from "../util";
import { collectGate } from "../gate";
import { nativeToReconstructed } from "./native";

// Gate 트레이드 방식 — 선물 계정 원장(GET /api/v4/futures/usdt/account_book) 합산.
// type=pnl(실현손익)/fee(수수료)/fund(펀딩)을 거래 발생일에 귀속. 보유시간·포지션 승/패 불가.
// 인증: HMAC SHA512. sign payload = `${method}\n${path}\n${query}\n${sha512(body)}\n${ts}`.

const BASE = "https://api.gateio.ws";
const PREFIX = "/api/v4";
const PATH = "/futures/usdt/account_book";
const MAX_PAGES = 50;

export async function collectGateTrade(req: CollectRequest): Promise<CollectResult> {
  const { apiKey, apiSecret } = req.credentials;
  const rawPages: RawPage[] = [];
  const rows: NormalizedRow[] = [];
  const warnings: string[] = [];
  let requestCount = 0;

  warnings.push("Gate 트레이드 방식 — account_book 원장(pnl/fee/fund/refr) 합산(dnw 제외, 거래 발생일 귀속). 운영 웹앱과 동일. 보유시간·포지션 승/패는 제공되지 않습니다.");

  for (let page = 0; page < MAX_PAGES; page++) {
    const query = buildQuery({
      limit: 100,
      offset: page * 100,
      from: Math.floor(req.startTime / 1000),
      to: Math.floor(req.endTime / 1000),
    });
    const fullPath = PREFIX + PATH;
    const ts = Math.floor(Date.now() / 1000).toString();
    const signMsg = `GET\n${fullPath}\n${query}\n${sha512Hex("")}\n${ts}`;
    const sign = hmacSha512Hex(apiSecret, signMsg);
    const url = `${BASE}${fullPath}?${query}`;
    requestCount++;
    const { page: rp, ok, body } = await fetchJson(`account_book p${page}`, url, {
      method: "GET",
      headers: {
        KEY: apiKey,
        SIGN: sign,
        Timestamp: ts,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    });
    rawPages.push(rp);

    if (!ok) {
      const b = body as { label?: string; message?: string };
      warnings.push(`Gate account_book 오류 (p${page}): ${b?.label ?? rp.status} ${b?.message ?? ""}`);
      break;
    }
    const list = (Array.isArray(body) ? body : []) as GateBook[];
    for (const d of list) {
      const row = normalize(d);
      if (row) rows.push(row);
    }
    if (list.length < 100) break;
  }

  // 네이티브 포지션 히스토리(position_close)도 수집 → 포지션 재구성 탭(win/loss)
  let positions: ReconstructedPosition[] = [];
  try {
    const native = await collectGate(req);
    rawPages.push(...native.rawPages);
    requestCount += native.meta.requestCount;
    positions = nativeToReconstructed(native.rows);
  } catch (e) {
    warnings.push(`Gate 포지션 히스토리 수집 실패: ${e instanceof Error ? e.message : String(e)}`);
  }

  return {
    exchange: "gate",
    rows,
    positions,
    rawPages,
    warnings,
    meta: { requestCount, endpoints: [PREFIX + PATH], startTime: req.startTime, endTime: req.endTime },
  };
}

interface GateBook {
  time?: number; // 초 (소수 가능)
  change?: string;
  balance?: string;
  type?: string; // pnl / fee / fund / dnw / refr ...
  text?: string;
  contract?: string;
}

function normalize(d: GateBook): NormalizedRow | null {
  const type = (d.type || "").toLowerCase();
  const change = num(d.change);
  if (change === 0) return null;
  const close = Math.round(num(d.time) * 1000);
  const symbol = d.contract || d.text || "";
  const id = `book-${type}-${d.time}-${d.change}`;

  if (type === "pnl") {
    return {
      exchange: "gate", id, symbol, side: null,
      pricePnl: change, fee: 0, funding: 0, netPnl: change,
      openTime: null, closeTime: close, holdTimeMs: null, win: null, unit: "fill",
    };
  }
  if (type === "fee") {
    return {
      exchange: "gate", id, symbol, side: null,
      pricePnl: 0, fee: change, funding: 0, netPnl: change,
      openTime: null, closeTime: close, holdTimeMs: null, win: null, unit: "income",
    };
  }
  if (type === "fund") {
    return {
      exchange: "gate", id, symbol, side: null,
      pricePnl: 0, fee: 0, funding: change, netPnl: change,
      openTime: null, closeTime: close, holdTimeMs: null, win: null, unit: "income",
    };
  }
  if (type === "refr") {
    // 레퍼럴 리베이트 — 운영 웹앱은 pnl로 귀속
    return {
      exchange: "gate", id, symbol, side: null,
      pricePnl: change, fee: 0, funding: 0, netPnl: change,
      openTime: null, closeTime: close, holdTimeMs: null, win: null, unit: "income",
    };
  }
  return null; // dnw(입출금) 등 제외
}
