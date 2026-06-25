import type { CollectRequest, CollectResult, ExchangeId } from "../types";
import { collectOkx } from "./okx";
import { collectBingx } from "./bingx";
import { collectBitget } from "./bitget";
import { collectGate } from "./gate";
import { collectBybit } from "./bybit";
import { collectBinance } from "./binance";
import { collectHyperliquid } from "./hyperliquid";

type Adapter = (req: CollectRequest) => Promise<CollectResult>;

const ADAPTERS: Record<ExchangeId, Adapter> = {
  okx: collectOkx,
  bingx: collectBingx,
  bitget: collectBitget,
  gate: collectGate,
  bybit: collectBybit,
  binance: collectBinance,
  hyperliquid: collectHyperliquid,
};

export function getAdapter(exchange: ExchangeId): Adapter | undefined {
  return ADAPTERS[exchange];
}
