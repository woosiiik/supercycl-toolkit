import type {
  OkxRebateRow,
  TradeRecord,
  TradeDetail,
  AddressRebateSummary,
  UnmatchedOrder,
  AllOrderRow,
  RebateSummary,
  CrossCheckResult,
} from "./types";

export function aggregateByAddress(
  csvRows: OkxRebateRow[],
  trades: TradeRecord[],
  unmappedOrderIds: string[],
  exAccountIdMap: Record<string, string>,
  registeredDateMap: Record<string, string>,
  exchangeUidToAddress: Record<string, string>,
  crossCheckMap: Record<string, CrossCheckResult>,
): {
  addressSummaries: AddressRebateSummary[];
  unmatchedOrders: UnmatchedOrder[];
  allOrders: AllOrderRow[];
  summary: RebateSummary;
} {
  // orderId → CSV row 맵
  const csvByOrderId = new Map<string, OkxRebateRow>();
  for (const row of csvRows) {
    csvByOrderId.set(row.orderId, row);
  }

  // orderId → trades 맵
  const tradesByOrderId = new Map<string, TradeRecord[]>();
  for (const t of trades) {
    const list = tradesByOrderId.get(t.orderId) || [];
    list.push(t);
    tradesByOrderId.set(t.orderId, list);
  }

  const unmappedSet = new Set(unmappedOrderIds);

  // orderId → 직접 address (t_trade_history 원본)
  const orderToDirectAddress = new Map<string, string | null>();
  // orderId → 표시용 address (직접 또는 유추)
  const orderToDisplayAddress = new Map<string, string | null>();
  const orderToExchangeUid = new Map<string, string | null>();
  for (const t of trades) {
    if (!orderToDirectAddress.has(t.orderId)) {
      orderToDirectAddress.set(t.orderId, t.address);
      let displayAddr = t.address;
      if (!displayAddr && t.exchangeUid) {
        displayAddr = exchangeUidToAddress[t.exchangeUid] || null;
      }
      orderToDisplayAddress.set(t.orderId, displayAddr);
      orderToExchangeUid.set(t.orderId, t.exchangeUid);
    }
  }

  const addressMap = new Map<string, AddressRebateSummary>();
  const unmatchedOrders: UnmatchedOrder[] = [];
  const allOrders: AllOrderRow[] = [];

  for (const csvRow of csvRows) {
    const inTradeHistory = !unmappedSet.has(csvRow.orderId);
    const directAddress = orderToDirectAddress.get(csvRow.orderId) ?? null;
    const resolvedAddress = orderToDisplayAddress.get(csvRow.orderId) ?? null;
    const exchangeUid = orderToExchangeUid.get(csvRow.orderId) ?? null;
    const cc = crossCheckMap[csvRow.orderId];

    // mainnet order에 있으면 매핑으로 승격
    const promotedByMainOrder = !inTradeHistory && !!cc?.mainnetOrder;

    // 미매핑인 경우 crossCheck에서 address/exchangeUid 보충
    const displayAddress = resolvedAddress || (cc?.resolvedAddress ?? null);
    const displayExchangeUid = exchangeUid || (cc?.resolvedExchangeUid ?? null);

    // 매핑 = trade_history에서 찾았거나, mainnet order로 승격 + 주소가 있음
    const mapped = (inTradeHistory && !!resolvedAddress) || (promotedByMainOrder && !!displayAddress);

    // 노트
    let unmapReason: AllOrderRow["unmapReason"] = null;
    if (!inTradeHistory && !promotedByMainOrder) {
      unmapReason = "no_trade";
    } else if (!inTradeHistory && promotedByMainOrder) {
      unmapReason = "no_address"; // mainnet order로 승격 (trade 없음)
    } else if (inTradeHistory && !directAddress && resolvedAddress) {
      unmapReason = "no_address"; // 매핑되었지만 주소는 유추됨
    } else if (inTradeHistory && !directAddress && !resolvedAddress) {
      unmapReason = "no_address";
    }

    // allOrders에 항상 추가
    allOrders.push({
      orderId: csvRow.orderId,
      instId: csvRow.instId,
      level: csvRow.level,
      fee: csvRow.fee,
      netFee: csvRow.netFee,
      brokerRebate: csvRow.brokerRebate,
      subBrokerRebate: csvRow.subBrokerRebate,
      userRebate: csvRow.userRebate,
      affiliated: csvRow.affiliated,
      derivativeTradeAmt: csvRow.derivativeTradeAmt,
      ts: csvRow.ts,
      mapped,
      address: displayAddress,
      exchangeUid: displayExchangeUid,
      unmapReason,
      crossCheck: cc,
    });

    // 미매핑 처리: trade_history에 없고 mainnet order에도 없는 경우
    if (!inTradeHistory && !promotedByMainOrder) {
      unmatchedOrders.push({
        orderId: csvRow.orderId,
        instId: csvRow.instId,
        fee: csvRow.fee,
        brokerRebate: csvRow.brokerRebate,
        derivativeTradeAmt: csvRow.derivativeTradeAmt,
        ts: csvRow.ts,
      });
      continue;
    }

    // 집계용 주소 결정
    const aggAddress = resolvedAddress || displayAddress;

    if (!aggAddress) {
      unmatchedOrders.push({
        orderId: csvRow.orderId,
        instId: csvRow.instId,
        fee: csvRow.fee,
        brokerRebate: csvRow.brokerRebate,
        derivativeTradeAmt: csvRow.derivativeTradeAmt,
        ts: csvRow.ts,
      });
      allOrders[allOrders.length - 1].mapped = false;
      continue;
    }

    const orderTrades = tradesByOrderId.get(csvRow.orderId);

    let entry = addressMap.get(aggAddress);
    if (!entry) {
      entry = {
        address: aggAddress,
        exAccountId: exAccountIdMap[aggAddress] || "",
        totalRebate: 0,
        totalFee: 0,
        totalVolume: 0,
        tradeCount: 0,
        orderCount: 0,
        registeredDate: registeredDateMap[aggAddress] || "",
        details: [],
      };
      addressMap.set(aggAddress, entry);
    }

    // rebate/fee/volume은 order 단위 (CSV 기준, 중복 합산 안 함)
    entry.totalRebate += csvRow.brokerRebate;
    entry.totalFee += Math.abs(csvRow.fee);
    entry.totalVolume += csvRow.derivativeTradeAmt;
    entry.orderCount += 1;

    if (!orderTrades || orderTrades.length === 0) {
      // trade_history에 없지만 order_history로 매핑된 경우 CSV 정보로 detail 생성
      entry.tradeCount += 1;
      entry.details.push({
        orderId: csvRow.orderId,
        tradeId: "",
        symbol: csvRow.instId,
        direction: "",
        price: 0,
        quantity: 0,
        tradedAt: null,
        instId: csvRow.instId,
        brokerRebate: csvRow.brokerRebate,
        derivativeTradeAmt: csvRow.derivativeTradeAmt,
        csvFee: csvRow.fee,
        ts: csvRow.ts,
      });
      continue;
    }

    // 각 trade를 detail로 추가 (rebate/fee는 첫 trade에만, 나머지 0)
    for (let ti = 0; ti < orderTrades.length; ti++) {
      const t = orderTrades[ti];
      const price = parseFloat(t.price) || 0;
      const quantity = parseFloat(t.quantity) || 0;
      const isFirst = ti === 0;
      entry.tradeCount += 1;
      entry.details.push({
        orderId: t.orderId,
        tradeId: t.tradeId,
        symbol: t.symbol,
        direction: t.direction,
        price,
        quantity,
        tradedAt: t.tradedAt,
        instId: csvRow.instId,
        brokerRebate: isFirst ? csvRow.brokerRebate : 0,
        derivativeTradeAmt: isFirst ? csvRow.derivativeTradeAmt : 0,
        csvFee: isFirst ? csvRow.fee : 0,
        ts: csvRow.ts,
      });
    }
  }

  const addressSummaries = Array.from(addressMap.values());
  const summary = recalculateSummary(addressSummaries, unmatchedOrders);

  return { addressSummaries, unmatchedOrders, allOrders, summary };
}

export function filterByAffiliate(
  addressSummaries: AddressRebateSummary[],
  affiliateUsers: Set<string>,
): AddressRebateSummary[] {
  return addressSummaries.filter((s) => affiliateUsers.has(s.address));
}

export function recalculateSummary(
  addressSummaries: AddressRebateSummary[],
  unmatchedOrders: UnmatchedOrder[],
): RebateSummary {
  let totalRebate = 0;
  let totalFee = 0;
  let totalVolume = 0;
  let totalTradeCount = 0;
  let totalOrderCount = 0;

  for (const s of addressSummaries) {
    totalRebate += s.totalRebate;
    totalFee += s.totalFee;
    totalVolume += s.totalVolume;
    totalTradeCount += s.tradeCount;
    totalOrderCount += s.orderCount;
  }

  let unmatchedRebate = 0;
  for (const u of unmatchedOrders) {
    unmatchedRebate += u.brokerRebate;
  }

  return {
    totalRebate,
    totalFee,
    totalVolume,
    totalTradeCount,
    totalOrderCount,
    addressCount: addressSummaries.length,
    unmatchedCount: unmatchedOrders.length,
    unmatchedRebate,
  };
}
