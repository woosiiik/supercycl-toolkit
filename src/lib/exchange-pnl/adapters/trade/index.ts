import type { CollectRequest, CollectResult, ExchangeId } from "../../types";
import { collectOkxTrade } from "./okx";
import { collectBingxTrade } from "./bingx";
import { collectBitgetTrade } from "./bitget";
import { collectGateTrade } from "./gate";
import { collectBybitTrade } from "./bybit";
import { collectHyperliquidTrade } from "./hyperliquid";
import { collectBinanceTrade } from "./binance";

type Adapter = (req: CollectRequest) => Promise<CollectResult>;

const TRADE_ADAPTERS: Record<ExchangeId, Adapter> = {
  okx: collectOkxTrade,
  bingx: collectBingxTrade,
  bitget: collectBitgetTrade,
  gate: collectGateTrade,
  bybit: collectBybitTrade,
  binance: collectBinanceTrade,
  hyperliquid: collectHyperliquidTrade,
};

export function getTradeAdapter(exchange: ExchangeId): Adapter | undefined {
  return TRADE_ADAPTERS[exchange];
}
