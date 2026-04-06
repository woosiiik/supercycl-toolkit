import * as hl from "@nktkas/hyperliquid";
import { privateKeyToAccount } from "viem/accounts";
import { FAUCET_API } from "./constants";

/**
 * Claim testnet USDC from the Hyperliquid faucet.
 * POST to FAUCET_API with { type: "claimDrip", user: address }
 */
export async function claimFaucet(
  address: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(FAUCET_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "claimDrip", user: address }),
    });

    if (!response.ok) {
      const text = await response.text();
      return { success: false, error: `HTTP ${response.status}: ${text}` };
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Send USD via @nktkas/hyperliquid WalletClient.usdSend().
 * The SDK handles EIP-712 signing and API calls internally.
 */
export async function sendUsd(
  privateKey: string,
  destination: string,
  amount: string,
  isTestnet: boolean,
): Promise<{ success: boolean; error?: string }> {
  try {
    const wallet = privateKeyToAccount(privateKey as `0x${string}`);
    const transport = new hl.HttpTransport({
      url: isTestnet
        ? "https://hyperliquid-testnet.xyz"
        : "https://hyperliquid.xyz",
    });
    const client = new hl.WalletClient({ wallet, transport, isTestnet });

    await client.usdSend({ destination: destination as `0x${string}`, amount });
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
