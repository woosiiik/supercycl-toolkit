import { createWalletClient, createPublicClient, http, parseUnits, parseAbi } from 'viem';
import { arbitrum } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import {
  USDC_CONTRACT,
  USDC_ABI,
  USDC_DECIMALS,
  ARBITRUM_RPC,
} from './constants';

const publicClient = createPublicClient({
  chain: arbitrum,
  transport: http(ARBITRUM_RPC),
});

/**
 * Transfer USDC on Arbitrum via ERC-20 transfer.
 * Waits for tx confirmation before returning to avoid nonce conflicts.
 */
export async function transferUsdc(
  privateKey: string,
  toAddress: string,
  amountUsd: number,
): Promise<{ txHash: string }> {
  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const client = createWalletClient({
    account,
    chain: arbitrum,
    transport: http(ARBITRUM_RPC),
  });

  const amount = parseUnits(amountUsd.toString(), USDC_DECIMALS);
  const usdcAbi = parseAbi(USDC_ABI);

  const txHash = await client.writeContract({
    address: USDC_CONTRACT,
    abi: usdcAbi,
    functionName: 'transfer',
    args: [toAddress as `0x${string}`, amount],
  });

  // Wait for tx confirmation to avoid nonce conflicts on next transfer
  await publicClient.waitForTransactionReceipt({ hash: txHash });

  return { txHash };
}