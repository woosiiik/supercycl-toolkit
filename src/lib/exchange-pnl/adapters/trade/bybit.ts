import type { CollectRequest, CollectResult, NormalizedRow, RawPage, ReconstructedPosition } from "../../types";
import { fetchJson, hmacSha256Hex, buildQuery, splitWindows, num, DAY_MS } from "../util";

// Bybit 트레이드 방식 — 운영 웹앱(BybitPnl)과 동일.
// net PnL: GET /v5/account/transaction-log (계정 원장) 전체를 change 로 합산.
//   TRANSFER_IN/TRANSFER_OUT(이체)만 제외, 나머지는 모두 PnL. SETTLEMENT는 펀딩으로 분해.
//
// 포지션 재구성(승/패·보유시간): 아래 두 엔드포인트를 추가 호출한다(원본도 raw로 표시).
//   - GET /v5/execution/list : 체결로 포지션 경계(오픈~청산)·보유시간 재구성 (closedSize·orderId)
//   - GET /v5/position/closed-pnl : Bybit 자체 실현손익(closedPnl)·수수료(openFee/closeFee)
// 두 응답을 orderId로 조인해 각 포지션의 실현손익/수수료를 확정한다(시간오차 무관).
// 펀딩은 transaction-log SETTLEMENT를 시간구간으로 귀속.
// (UNIFIED·one-way 계정 기준. Classic/헤지 모드는 별도 고려 — 경고 표시.)

const HOSTS = ["https://api.bybit.com", "https://api.bytick.com"];
const TXLOG_PATH = "/v5/account/transaction-log";
const EXEC_PATH = "/v5/execution/list";
const CPNL_PATH = "/v5/position/closed-pnl";
const RECV = "5000";
const MAX_PAGES = 30;
const WINDOW = 7 * DAY_MS;
const EPS = 1e-8;

async function bybitGet(apiKey: string, apiSecret: string, path: string, qs: string) {
  let last: Awaited<ReturnType<typeof fetchJson>> | undefined;
  for (const host of HOSTS) {
    const ts = Date.now().toString();
    const sign = hmacSha256Hex(apiSecret, ts + apiKey + RECV + qs);
    const res = await fetchJson(`${path} ${qs.slice(0, 40)}`, `${host}${path}?${qs}`, {
      method: "GET",
      headers: {
        "X-BAPI-API-KEY": apiKey,
        "X-BAPI-TIMESTAMP": ts,
        "X-BAPI-RECV-WINDOW": RECV,
        "X-BAPI-SIGN": sign,
      },
    });
    last = res;
    if (res.page.status !== 403) return res;
  }
  return last!;
}

export async function collectBybitTrade(req: CollectRequest): Promise<CollectResult> {
  const { apiKey, apiSecret } = req.credentials;
  const rawPages: RawPage[] = [];
  const rows: NormalizedRow[] = [];
  const warnings: string[] = [];
  const settlements: FundingEvent[] = [];
  const execs: ExecP[] = [];
  const cpnlByOrder = new Map<string, { pnl: number; fee: number }>();
  let requestCount = 0;

  warnings.push("Bybit 트레이드 방식 — net은 transaction-log 원장 합산(TRANSFER만 제외). 포지션 재구성은 execution/list(경계) + closed-pnl(실현손익·수수료)을 orderId로 조인합니다. net = 실현손익(수수료 반영) + 펀딩. UNIFIED·one-way 기준이며 검증 전 휴리스틱이니 원본(raw)과 교차확인하세요.");

  const windows = splitWindows(req.startTime, req.endTime, WINDOW);

  // === ① transaction-log (net rows + 펀딩 이벤트) ===
  for (const w of windows) {
    const tag = new Date(w.start).toISOString().slice(0, 10);
    let cursor = "";
    for (let page = 1; page <= MAX_PAGES; page++) {
      const qs = buildQuery({ accountType: "UNIFIED", category: "linear", currency: "USDT", limit: 50, startTime: w.start, endTime: w.end, cursor });
      requestCount++;
      const { page: rp, ok, body } = await bybitGet(apiKey, apiSecret, TXLOG_PATH, qs);
      rp.label = `transaction-log ${tag} p${page}`;
      rawPages.push(rp);
      const b = body as { retCode?: number; retMsg?: string; result?: { list?: BybitTxLog[]; nextPageCursor?: string } };
      if (!ok || (b?.retCode !== undefined && b.retCode !== 0)) {
        if (rp.status === 403) warnings.push("Bybit HTTP 403 — 서버 IP/지역 차단. 비-미국 리전에서 실행해야 합니다.");
        warnings.push(`Bybit transaction-log 오류 (${tag} p${page}): retCode=${b?.retCode} msg=${b?.retMsg ?? rp.status}`);
        break;
      }
      const list = b?.result?.list ?? [];
      for (const d of list) {
        const row = normalizeTx(d);
        if (row) rows.push(row);
        if (d.type === "SETTLEMENT") settlements.push({ coin: d.symbol ?? "", time: num(d.transactionTime), usdc: num(d.change) });
      }
      cursor = b?.result?.nextPageCursor ?? "";
      if (!cursor || list.length === 0) break;
    }
  }

  // === ② execution/list (포지션 경계) ===
  for (const w of windows) {
    const tag = new Date(w.start).toISOString().slice(0, 10);
    let cursor = "";
    for (let page = 1; page <= MAX_PAGES; page++) {
      const qs = buildQuery({ category: "linear", limit: 100, startTime: w.start, endTime: w.end, cursor });
      requestCount++;
      const { page: rp, ok, body } = await bybitGet(apiKey, apiSecret, EXEC_PATH, qs);
      rp.label = `execution-list ${tag} p${page}`;
      rawPages.push(rp);
      const b = body as { retCode?: number; retMsg?: string; result?: { list?: BybitExec[]; nextPageCursor?: string } };
      if (!ok || (b?.retCode !== undefined && b.retCode !== 0)) {
        warnings.push(`Bybit execution-list 오류 (${tag} p${page}): retCode=${b?.retCode} msg=${b?.retMsg ?? rp.status}`);
        break;
      }
      const list = b?.result?.list ?? [];
      for (const d of list) {
        const t = d.execType ?? "";
        if (t !== "Trade" && t !== "AdlTrade" && t !== "BustTrade") continue;
        execs.push({
          symbol: d.symbol ?? "",
          time: num(d.execTime),
          sideSign: d.side === "Sell" ? -1 : 1,
          qty: num(d.execQty),
          closedSize: num(d.closedSize),
          orderId: String(d.orderId ?? ""),
          execId: String(d.execId ?? ""),
        });
      }
      cursor = b?.result?.nextPageCursor ?? "";
      if (!cursor || list.length === 0) break;
    }
  }

  // === ③ closed-pnl (실현손익·수수료, orderId 기준) ===
  for (const w of windows) {
    const tag = new Date(w.start).toISOString().slice(0, 10);
    let cursor = "";
    for (let page = 1; page <= MAX_PAGES; page++) {
      const qs = buildQuery({ category: "linear", limit: 100, startTime: w.start, endTime: w.end, cursor });
      requestCount++;
      const { page: rp, ok, body } = await bybitGet(apiKey, apiSecret, CPNL_PATH, qs);
      rp.label = `closed-pnl ${tag} p${page}`;
      rawPages.push(rp);
      const b = body as { retCode?: number; retMsg?: string; result?: { list?: BybitCpnl[]; nextPageCursor?: string } };
      if (!ok || (b?.retCode !== undefined && b.retCode !== 0)) {
        warnings.push(`Bybit closed-pnl 오류 (${tag} p${page}): retCode=${b?.retCode} msg=${b?.retMsg ?? rp.status}`);
        break;
      }
      const list = b?.result?.list ?? [];
      for (const d of list) {
        const oid = String(d.orderId ?? "");
        if (!oid) continue;
        const prev = cpnlByOrder.get(oid) ?? { pnl: 0, fee: 0 };
        prev.pnl += num(d.closedPnl);
        prev.fee += num(d.openFee) + num(d.closeFee);
        cpnlByOrder.set(oid, prev);
      }
      cursor = b?.result?.nextPageCursor ?? "";
      if (!cursor || list.length === 0) break;
    }
  }

  const positions = reconstructPositions(execs, cpnlByOrder, settlements);

  return {
    exchange: "bybit",
    rows,
    positions,
    rawPages,
    warnings,
    meta: { requestCount, endpoints: [TXLOG_PATH, EXEC_PATH, CPNL_PATH], startTime: req.startTime, endTime: req.endTime },
  };
}

interface BybitTxLog {
  symbol?: string;
  type?: string;
  change?: string;
  transactionTime?: string;
  id?: string;
  tradeId?: string;
}

function normalizeTx(d: BybitTxLog): NormalizedRow | null {
  const type = d.type ?? "";
  if (type === "TRANSFER_IN" || type === "TRANSFER_OUT") return null;
  const change = num(d.change);
  if (change === 0) return null;
  const close = num(d.transactionTime);
  const isFunding = type === "SETTLEMENT";
  return {
    exchange: "bybit",
    id: d.id ?? d.tradeId ?? `${type}-${d.symbol}-${close}`,
    symbol: d.symbol ?? "",
    side: null,
    pricePnl: isFunding ? 0 : change,
    fee: 0,
    funding: isFunding ? change : 0,
    netPnl: change,
    openTime: null,
    closeTime: close,
    holdTimeMs: null,
    win: null,
    unit: isFunding ? "income" : "fill",
  };
}

// === 포지션 재구성 ===

interface BybitExec {
  symbol?: string;
  side?: string;
  execQty?: string;
  execTime?: string;
  execType?: string;
  closedSize?: string;
  orderId?: string;
  execId?: string;
}
interface BybitCpnl {
  orderId?: string;
  closedPnl?: string;
  openFee?: string;
  closeFee?: string;
}
interface ExecP {
  symbol: string;
  time: number;
  sideSign: number;
  qty: number;
  closedSize: number;
  orderId: string;
  execId: string;
}
interface FundingEvent {
  coin: string;
  time: number;
  usdc: number;
}

interface PosAcc {
  symbol: string;
  side: "long" | "short";
  size: number;
  openTime: number | null;
  closeTime: number | null;
  lastTime: number;
  orphan: boolean;
  fillCount: number;
  maxSize: number;
  closeOrderIds: Set<string>; // 이 포지션을 청산한 주문들
  funding: number;
}

function newAcc(symbol: string, side: "long" | "short", size: number, openTime: number | null, orphan: boolean, time: number): PosAcc {
  return { symbol, side, size, openTime, closeTime: null, lastTime: time, orphan, fillCount: 0, maxSize: 0, closeOrderIds: new Set(), funding: 0 };
}

function reconstructPositions(execs: ExecP[], cpnlByOrder: Map<string, { pnl: number; fee: number }>, fundings: FundingEvent[]): ReconstructedPosition[] {
  const sorted = [...execs].sort((a, b) => a.time - b.time || a.execId.localeCompare(b.execId));
  const openBySym = new Map<string, PosAcc>();
  const done: PosAcc[] = [];

  for (const e of sorted) {
    let acc = openBySym.get(e.symbol);
    const isOpen = e.closedSize <= EPS;

    if (isOpen) {
      const side: "long" | "short" = e.sideSign > 0 ? "long" : "short";
      if (acc && !acc.orphan && acc.side === side) {
        acc.size = Math.round((acc.size + e.qty) * 1e8) / 1e8;
      } else {
        if (acc) {
          acc.closeTime = acc.lastTime;
          done.push(acc);
        }
        acc = newAcc(e.symbol, side, e.qty, e.time, false, e.time);
        openBySym.set(e.symbol, acc);
      }
    } else {
      if (!acc) {
        acc = newAcc(e.symbol, e.sideSign > 0 ? "short" : "long", 0, null, true, e.time);
        openBySym.set(e.symbol, acc);
      } else {
        acc.size = Math.round((acc.size - e.closedSize) * 1e8) / 1e8;
      }
      if (e.orderId) acc.closeOrderIds.add(e.orderId);
    }

    acc.lastTime = e.time;
    acc.fillCount += 1;
    acc.maxSize = Math.max(acc.maxSize, acc.size, e.closedSize);

    if (!acc.orphan && !isOpen && acc.size <= EPS) {
      acc.closeTime = e.time;
      done.push(acc);
      openBySym.delete(e.symbol);
    }
  }

  for (const acc of openBySym.values()) {
    if (acc.orphan) acc.closeTime = acc.lastTime;
    done.push(acc);
  }

  // 펀딩(SETTLEMENT) 시간구간 귀속
  for (const f of fundings) {
    let best: PosAcc | null = null;
    let bestStart = Number.NEGATIVE_INFINITY;
    for (const p of done) {
      if (p.symbol !== f.coin) continue;
      const start = p.openTime ?? Number.NEGATIVE_INFINITY;
      const end = p.closeTime ?? Number.POSITIVE_INFINITY;
      if (f.time < start || f.time > end) continue;
      if (start >= bestStart) {
        bestStart = start;
        best = p;
      }
    }
    if (best) best.funding += f.usdc;
  }

  return done.map((p): ReconstructedPosition => {
    // closedPnl·수수료를 청산 주문(orderId)에서 합산
    let pnlSum = 0;
    let feeSum = 0;
    for (const oid of p.closeOrderIds) {
      const c = cpnlByOrder.get(oid);
      if (c) {
        pnlSum += c.pnl;
        feeSum += c.fee;
      }
    }
    const open = p.closeTime === null;
    // Bybit closedPnl은 수수료가 반영된(net) 실현손익.
    // 표시 일관성(net = 가격손익 + 수수료 + 펀딩)을 위해 가격손익은 gross(=closedPnl + 수수료)로 환원.
    // net = closedPnl + 펀딩 (수수료 이중계상 없음).
    const netPnl = pnlSum + p.funding;
    return {
      exchange: "bybit",
      coin: p.symbol,
      side: p.side,
      openTime: p.openTime,
      closeTime: p.closeTime,
      holdTimeMs: p.openTime !== null && p.closeTime !== null ? p.closeTime - p.openTime : null,
      maxSize: p.maxSize,
      pricePnl: pnlSum + feeSum,
      fee: -feeSum,
      funding: p.funding,
      netPnl,
      win: open ? null : netPnl > 0,
      fillCount: p.fillCount,
      orphan: p.orphan,
      open,
    };
  });
}
