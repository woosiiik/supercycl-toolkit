"use client";

import { useState } from "react";
import { privateKeyToAccount } from "viem/accounts";
import {
  getUsdcBalance,
  getEthBalance,
  formatUsdcBalance,
  formatEthBalance,
} from "@/lib/faucet/balance";
import { isBalanceSufficient } from "@/lib/faucet/account";
import type { MainAccountInfo } from "@/types/faucet";

interface MainAccountInputProps {
  onAccountSet: (account: MainAccountInfo) => void;
  subAccountCount: number;
}

export default function MainAccountInput({
  onAccountSet,
  subAccountCount,
}: MainAccountInputProps) {
  const [privateKey, setPrivateKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accountInfo, setAccountInfo] = useState<MainAccountInfo | null>(null);
  const [rawUsdcBalance, setRawUsdcBalance] = useState<bigint | null>(null);

  const isValidKey = /^(0x)?[0-9a-fA-F]{64}$/.test(privateKey);

  function normalizeKey(key: string): `0x${string}` {
    const trimmed = key.trim();
    if (/^[0-9a-fA-F]{64}$/.test(trimmed))
      return `0x${trimmed}` as `0x${string}`;
    return trimmed as `0x${string}`;
  }

  async function handleConfirm() {
    if (!isValidKey) return;

    setLoading(true);
    setError(null);
    setAccountInfo(null);
    setRawUsdcBalance(null);

    try {
      const normalizedKey = normalizeKey(privateKey);
      const account = privateKeyToAccount(normalizedKey);
      const address = account.address;

      const [usdcRaw, ethRaw] = await Promise.all([
        getUsdcBalance(address),
        getEthBalance(address),
      ]);

      const info: MainAccountInfo = {
        address,
        privateKey: normalizedKey,
        usdcBalance: formatUsdcBalance(usdcRaw),
        ethBalance: formatEthBalance(ethRaw),
      };

      setAccountInfo(info);
      setRawUsdcBalance(usdcRaw);
      onAccountSet(info);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "계정 정보를 불러올 수 없습니다",
      );
    } finally {
      setLoading(false);
    }
  }

  const balanceSufficient =
    rawUsdcBalance !== null && subAccountCount > 0
      ? isBalanceSufficient(rawUsdcBalance, subAccountCount)
      : true;

  return (
    <div className="flex flex-col gap-4 rounded-md border border-zinc-300 p-4 dark:border-zinc-600">
      <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
        Main Account
      </h3>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="main-private-key"
          className="text-xs text-zinc-500 dark:text-zinc-400"
        >
          Private Key
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              id="main-private-key"
              type={showKey ? "text" : "password"}
              value={privateKey}
              onChange={(e) => setPrivateKey(e.target.value)}
              placeholder="0x..."
              autoComplete="off"
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 pr-16 font-mono text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
            />
            <button
              type="button"
              onClick={() => setShowKey((prev) => !prev)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-0.5 text-xs text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
            >
              {showKey ? "숨기기" : "보기"}
            </button>
          </div>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!isValidKey || loading}
            className="shrink-0 rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-blue-500 dark:hover:bg-blue-600"
          >
            {loading ? "조회 중..." : "잔액 확인"}
          </button>
        </div>
        <p className="text-xs text-zinc-400 dark:text-zinc-500">
          Private key는 브라우저 메모리에만 보관되며 저장되지 않습니다
        </p>
      </div>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      {accountInfo && !loading && (
        <div className="flex flex-col gap-2 rounded-md border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800/50">
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              Address
            </span>
            <span className="font-mono text-xs text-zinc-900 dark:text-zinc-100">
              {accountInfo.address}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              USDC 잔액
            </span>
            <span className="text-sm font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
              {accountInfo.usdcBalance} USDC
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              ETH 잔액
            </span>
            <span className="text-sm font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
              {accountInfo.ethBalance} ETH
            </span>
          </div>
        </div>
      )}

      {accountInfo && !loading && !balanceSufficient && (
        <div className="rounded-md border border-red-500/30 bg-red-50 px-3 py-2 dark:border-red-500/20 dark:bg-red-900/20">
          <p className="text-sm font-medium text-red-700 dark:text-red-400">
            잔액 부족 — {subAccountCount}개 계정 × 5.5 USDC ={" "}
            {(subAccountCount * 5.5).toFixed(1)} USDC 필요 (현재{" "}
            {accountInfo.usdcBalance} USDC)
          </p>
        </div>
      )}
    </div>
  );
}
