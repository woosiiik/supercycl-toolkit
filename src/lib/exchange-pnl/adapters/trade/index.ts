import type { CollectRequest, CollectResult, ExchangeId } from "../../types";
import { collectOkxTrade } from "./okx";
import { collectBingxTrade } from "./bingx";
import { collectBitgetTrade } from "./bitget";
import { collectGateTrade } from "./gate";
import { collectBybitTrade } from "./bybit";
import { collectHyperliquidTrade } from "./hyperliquid";
// Binance(income)는 이미 원장 기반이라 포지션 어댑터를 재사용한다.
// (운영 웹앱 Binance PnL은 서버 계산이지만 데이터 소스는 동일하게 income.)
import { collectBinance } from "../binance";

type Adapter = (req: CollectRequest) => Promise<CollectResult>;

const TRADE_ADAPTERS: Record<ExchangeId, Adapter> = {
  okx: collectOkxTrade,
  bingx: collectBingxTrade,
  bitget: collectBitgetTrade,
  gate: collectGateTrade,
  bybit: collectBybitTrade,
  binance: collectBinance,
  hyperliquid: collectHyperliquidTrade,
};

export function getTradeAdapter(exchange: ExchangeId): Adapter | undefined {
  return TRADE_ADAPTERS[exchange];
}
