import { createPublicClient, http, formatUnits, parseAbi } from "viem";
import { arbitrum } from "viem/chains";
import {
  USDC_CONTRACT,
  USDC_ABI,
  USDC_DECIMALS,
  ARBITRUM_RPC,
  MAINNET_INFO_API,
  TESTNET_INFO_API,
} from "./constants";

const publicClient = createPublicClient({
  chain: arbitrum,
  transport: http(ARBITRUM_RPC),
});

const usdcAbi = parseAbi(USDC_ABI);

/** Get USDC balance for an address on Arbitrum */
export async function getUsdcBalance(address: string): Promise<bigint> {
  const balance = await publicClient.readContract({
    address: USDC_CONTRACT,
    abi: usdcAbi,
    functionName: "balanceOf",
    args: [address as `0x${string}`],
  });
  return balance as bigint;
}

/** Get ETH balance for an address on Arbitrum */
export async function getEthBalance(address: string): Promise<bigint> {
  return publicClient.getBalance({
    address: address as `0x${string}`,
  });
}

/** Get Hyperliquid account balance via info API */
export async function getHyperliquidBalance(
  address: string,
  isTestnet: boolean,
): Promise<string> {
  const apiUrl = isTestnet ? TESTNET_INFO_API : MAINNET_INFO_API;
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "clearinghouseState", user: address }),
  });

  if (!response.ok) {
    throw new Error(`Hyperliquid API error: ${response.status}`);
  }

  const data = await response.json();
  const accountValue = data?.marginSummary?.accountValue ?? "0";
  return accountValue;
}

/** Format raw USDC balance (6 decimals) to string with 2 decimal places */
export function formatUsdcBalance(raw: bigint): string {
  const formatted = formatUnits(raw, USDC_DECIMALS);
  const num = parseFloat(formatted);
  return num.toFixed(2);
}

/** Format raw ETH balance (18 decimals) to string with 6 decimal places */
export function formatEthBalance(raw: bigint): string {
  const formatted = formatUnits(raw, 18);
  const num = parseFloat(formatted);
  return num.toFixed(6);
}
