import { PublicClient, HttpTransport } from '@nktkas/hyperliquid';
import type { CoinInfo } from '@/types/stress';
import { TESTNET_HTTP_URL, ORDER_PRICE_RATIO } from './constants';

/** 공유 PublicClient 생성 (테스트넷 HTTP) */
export function createSharedPublicClient(): PublicClient<HttpTransport> {
  const httpTransport = new HttpTransport({ url: TESTNET_HTTP_URL });
  return new PublicClient({ transport: httpTransport });
}

/** 코인 목록 조회 — meta().universe에서 CoinInfo[] 추출 */
export async function fetchCoinList(
  client: PublicClient,
  signal?: AbortSignal,
): Promise<CoinInfo[]> {
  const meta = await client.meta(signal);
  return meta.universe
    .map((item, index) => ({
      name: item.name,
      index,
      szDecimals: item.szDecimals,
      maxLeverage: item.maxLeverage,
    }))
    .filter((coin) => {
      const raw = meta.universe[coin.index];
      // isDelisted 코인 제외 (Trading is halted)
      return !('isDelisted' in raw && raw.isDelisted);
    });
}

/** 현재 mid price 조회 */
export async function fetchAllMids(
  client: PublicClient,
  signal?: AbortSignal,
): Promise<Record<string, string>> {
  return client.allMids(signal);
}

/** 배열에서 랜덤 코인 선택 */
export function pickRandomCoin(coins: CoinInfo[]): CoinInfo {
  const idx = Math.floor(Math.random() * coins.length);
  return coins[idx];
}

/** mid price × ORDER_PRICE_RATIO 계산, 유효 숫자 5자리로 포맷 */
export function calculateLimitPrice(midPrice: string): string {
  const mid = parseFloat(midPrice);
  const raw = mid * ORDER_PRICE_RATIO;
  // Hyperliquid 가격은 유효 숫자 5자리
  return formatPriceToSigFigs(raw, 5);
}

/** 숫자를 유효 숫자 N자리로 포맷 (trailing zeros 제거) */
function formatPriceToSigFigs(value: number, sigFigs: number): string {
  if (value === 0) return '0';
  const d = Math.ceil(Math.log10(Math.abs(value)));
  const power = sigFigs - d;
  const magnitude = Math.pow(10, power);
  const shifted = Math.round(value * magnitude);
  const result = shifted / magnitude;
  // 소수점 자릿수 결정
  const decimals = Math.max(0, power);
  return result.toFixed(decimals);
}

/** 주문 수량을 szDecimals에 맞게 올림 포맷 */
export function calculateOrderSize(minUsd: number, price: string, szDecimals: number): string {
  const priceNum = parseFloat(price);
  if (priceNum <= 0) return '1';
  const rawSize = minUsd / priceNum;
  const factor = Math.pow(10, szDecimals);
  const rounded = Math.ceil(rawSize * factor) / factor;
  return rounded.toFixed(szDecimals);
}
