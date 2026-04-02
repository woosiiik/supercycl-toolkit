import { privateKeyToAccount } from 'viem/accounts';
import { createPublicClient, http, parseAbi, parseUnits } from 'viem';
import { arbitrum } from 'viem/chains';
import type { PermitSignature } from '@/types/faucet';
import {
  USDC_CONTRACT,
  USDC_ABI,
  BRIDGE_ADDRESS,
  ARBITRUM_RPC,
  PERMIT_DOMAIN,
  PERMIT_TYPES,
  DEPOSIT_API,
  USDC_DECIMALS,
} from './constants';

const publicClient = createPublicClient({
  chain: arbitrum,
  transport: http(ARBITRUM_RPC),
});

const usdcAbi = parseAbi(USDC_ABI);

/** Query the USDC contract for the current nonce of an address */
export async function getNonce(owner: string): Promise<bigint> {
  const nonce = await publicClient.readContract({
    address: USDC_CONTRACT,
    abi: usdcAbi,
    functionName: 'nonces',
    args: [owner as `0x${string}`],
  });
  return nonce as bigint;
}

/** Sign an EIP-2612 Permit and split the signature into r, s, v */
export async function signPermit(
  privateKey: string,
  owner: string,
  value: bigint,
  nonce: bigint,
  deadline: bigint,
): Promise<PermitSignature> {
  const account = privateKeyToAccount(privateKey as `0x${string}`);

  const signatureHex = await account.signTypedData({
    domain: PERMIT_DOMAIN,
    types: PERMIT_TYPES,
    primaryType: 'Permit',
    message: {
      owner: owner as `0x${string}`,
      spender: BRIDGE_ADDRESS,
      value,
      nonce,
      deadline,
    },
  });

  // Split signature: r (32 bytes), s (32 bytes), v (1 byte)
  const r = signatureHex.slice(0, 66);
  const s = ('0x' + signatureHex.slice(66, 130)) as string;
  const vRaw = parseInt(signatureHex.slice(130, 132), 16);
  const v = vRaw < 27 ? vRaw + 27 : vRaw;

  return { r, s, v };
}

/** POST depositWithPermit to Hyperliquid API */
export async function submitDeposit(
  user: string,
  usd: number,
  deadline: number,
  signature: PermitSignature,
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(DEPOSIT_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'depositWithPermit',
        user: user.toLowerCase(),
        usd,
        deadline,
        signature: { r: signature.r, s: signature.s, v: signature.v },
      }),
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
 * Full depositWithPermit flow for a single Sub_Account:
 * 1. Query USDC balance (전액 deposit)
 * 2. Query nonce from USDC contract
 * 3. Sign EIP-2612 Permit
 * 4. Submit deposit to Hyperliquid API
 */
export async function depositWithPermit(
  privateKey: string,
  address: string,
): Promise<{ success: boolean; error?: string }> {
  // 전액 deposit: Sub Account의 USDC 잔액 전체를 사용
  const balance = await publicClient.readContract({
    address: USDC_CONTRACT,
    abi: usdcAbi,
    functionName: 'balanceOf',
    args: [address as `0x${string}`],
  }) as bigint;

  if (balance === BigInt(0)) {
    return { success: false, error: 'USDC 잔액 없음' };
  }

  const nonce = await getNonce(address);
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);

  const signature = await signPermit(privateKey, address, balance, nonce, deadline);

  return submitDeposit(address, Number(balance), Number(deadline), signature);
}
