import type { CollectRequest, CollectResult, NormalizedRow, RawPage, ReconstructedPosition } from "../../types";
import { fetchJson, hmacSha256Base64, buildQuery, splitWindows, num, DAY_MS } from "../util";
import { collectBitget } from "../bitget";
import { nativeToReconstructed } from "./native";

// Bitget 트레이드 방식 — 운영 웹앱(BitgetPnl)과 동일.
// GET /api/v2/mix/account/bill 원장을 businessType으로 분류. value = amount + fee.
// pnlTypes → 실현손익/펀딩(pnl), balanceTypes → 이체(dnw, 제외). 미지 타입은 경고 후 pnl로 귀속.
// 잔액(balance)이 직전과 동일한 항목은 value=0 처리(운영과 동일).

const BASE = "https://api.bitget.com";
const PATH = "/api/v2/mix/account/bill";
const MAX_PAGES = 50;
const WINDOW = 89 * DAY_MS;

const PNL_TYPES = new Set([
  "open_long", "open_short", "close_long", "close_short", "buy", "sell",
  "force_close_long", "force_close_short", "burst_long_loss_query", "burst_short_loss_query",
  "force_buy", "force_sell", "burst_buy", "burst_sell",
  "adl_close_long", "adl_close_short", "adl_buy_in_single_side_mode", "adl_sell_in_single_side_mode",
  "delivery_long", "delivery_short", "tracking_trader_income", "settle_interest", "contract_settle_fee",
]);
const BALANCE_TYPES = new Set([
  "trans_from_exchange", "trans_to_exchange", "trans_from_contract", "trans_to_contract",
  "trans_from_otc", "trans_to_otc", "trans_from_cross", "trans_to_cross",
  "trans_from_isolated", "trans_to_isolated", "append_margin", "reduce_margin",
  "auto_append_margin", "adjust_down_lever_append_margin", "cash_gift_issue", "cash_gift_recycle",
  "bonus_issue", "bonus_recycle", "bonus_expired", "tracking_follow_pay", "tracking_follow_back",
  "risk_captital_user_transfer", "user_exchange_buy", "user_exchange_sell",
]);
// 펀딩/이자 성격(pnlTypes 중) → funding 컴포넌트로 분해
const FUNDING_TYPES = new Set(["contract_settle_fee", "settle_interest"]);

export async function collectBitgetTrade(req: CollectRequest): Promise<CollectResult> {
  const { apiKey, apiSecret, passphrase } = req.credentials;
  const rawPages: RawPage[] = [];
  const warnings: string[] = [];
  let requestCount = 0;

  warnings.push("Bitget 트레이드 방식 — account bill 원장 합산(value=amount+fee, businessType 분류). 운영 웹앱과 동일. 보유시간·포지션 승/패는 제공되지 않습니다.");

  // 전체 bill 수집 후 cTime 오름차순 정렬 → 잔액변동 처리
  const bills: BitgetBill[] = [];
  const windows = splitWindows(req.startTime, req.endTime, WINDOW);
  outer: for (const w of windows) {
    const tag = new Date(w.start).toISOString().slice(0, 10);
    let idLessThan = "";
    for (let page = 1; page <= MAX_PAGES; page++) {
      const qs = buildQuery({ productType: "USDT-FUTURES", limit: 100, startTime: w.start, endTime: w.end, idLessThan });
      const requestPath = `${PATH}?${qs}`;
      const ts = Date.now().toString();
      const sign = hmacSha256Base64(apiSecret, ts + "GET" + requestPath);
      requestCount++;
      const { page: rp, ok, body } = await fetchJson(`bill ${tag} p${page}`, BASE + requestPath, {
        method: "GET",
        headers: {
          "ACCESS-KEY": apiKey,
          "ACCESS-SIGN": sign,
          "ACCESS-TIMESTAMP": ts,
          "ACCESS-PASSPHRASE": passphrase,
          locale: "en-US",
          "Content-Type": "application/json",
        },
      });
      rawPages.push(rp);
      const b = body as { code?: string; msg?: string; data?: { bills?: BitgetBill[]; endId?: string } };
      if (!ok || (b?.code && b.code !== "00000")) {
        warnings.push(`Bitget bill 오류 (${tag} p${page}): code=${b?.code} msg=${b?.msg ?? rp.status}`);
        break outer;
      }
      const list = b?.data?.bills ?? [];
      bills.push(...list);
      const endId = b?.data?.endId;
      if (list.length < 100 || !endId) break;
      idLessThan = endId;
    }
  }

  bills.sort((a, b) => num(a.cTime) - num(b.cTime));
  const rows: NormalizedRow[] = [];
  const unknownTypes = new Set<string>();
  let prevBalance: string | undefined;
  for (const bill of bills) {
    const bt = bill.businessType ?? "";
    // 이체류는 PnL 아님 → 제외
    if (BALANCE_TYPES.has(bt)) {
      prevBalance = bill.balance;
      continue;
    }
    if (!PNL_TYPES.has(bt)) unknownTypes.add(bt);
    // 잔액이 직전과 동일하면 실제 변동 없음 → 0 처리(스킵)
    if (prevBalance !== undefined && prevBalance === bill.balance) {
      prevBalance = bill.balance;
      continue;
    }
    prevBalance = bill.balance;

    const amount = num(bill.amount);
    const fee = num(bill.fee);
    if (amount === 0 && fee === 0) continue;
    const isFunding = FUNDING_TYPES.has(bt);
    rows.push({
      exchange: "bitget",
      id: `bill-${bill.billId}`,
      symbol: bill.symbol ?? "",
      side: null,
      pricePnl: isFunding ? 0 : amount,
      fee: isFunding ? 0 : fee,
      funding: isFunding ? amount + fee : 0,
      netPnl: amount + fee,
      openTime: null,
      closeTime: num(bill.cTime),
      holdTimeMs: null,
      win: null,
      unit: isFunding ? "income" : "fill",
    });
  }

  if (unknownTypes.size > 0) {
    warnings.push(`Bitget 미분류 businessType ${unknownTypes.size}종 → pnl로 귀속했습니다(검증 권장): ${[...unknownTypes].join(", ")}`);
  }

  // 네이티브 포지션 히스토리(history-position)도 수집 → 포지션 재구성 탭(win/loss)
  let positions: ReconstructedPosition[] = [];
  try {
    const native = await collectBitget(req);
    rawPages.push(...native.rawPages);
    requestCount += native.meta.requestCount;
    positions = nativeToReconstructed(native.rows);
  } catch (e) {
    warnings.push(`Bitget 포지션 히스토리 수집 실패: ${e instanceof Error ? e.message : String(e)}`);
  }

  return {
    exchange: "bitget",
    rows,
    positions,
    rawPages,
    warnings,
    meta: { requestCount, endpoints: [PATH], startTime: req.startTime, endTime: req.endTime },
  };
}

interface BitgetBill {
  billId?: string;
  symbol?: string;
  amount?: string;
  fee?: string;
  businessType?: string;
  balance?: string;
  cTime?: string;
}
