"use client";

import { useState } from "react";
import { PRIVATE_KEY_REGEX, normalizePrivateKey } from "@/types/stress";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createWalletClient, custom } from "viem";
import {
  WalletClient as HLWalletClient,
  HttpTransport,
} from "@nktkas/hyperliquid";
import { TESTNET_HTTP_URL } from "@/lib/stress/constants";
import { getHyperliquidBalance } from "@/lib/faucet/balance";

type AuthMode = "privateKey" | "metamask";

interface StressConfigProps {
  onStart: (
    privateKey: string,
    instanceCount: number,
    walletAddress?: string,
    enableWs?: boolean,
  ) => void;
  onStop: () => void;
  isRunning: boolean;
  canStart: boolean;
}

export default function StressConfig({
  onStart,
  onStop,
  isRunning,
  canStart,
}: StressConfigProps) {
  const [authMode, setAuthMode] = useState<AuthMode>("privateKey");
  const [privateKey, setPrivateKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [instanceCount, setInstanceCount] = useState(30);
  const [enableWs, setEnableWs] = useState(true);

  // MetaMask state
  const [mmAddress, setMmAddress] = useState<string | null>(null);
  const [agentKey, setAgentKey] = useState<string | null>(null);
  const [mmLoading, setMmLoading] = useState(false);
  const [mmError, setMmError] = useState<string | null>(null);
  const [testnetBalance, setTestnetBalance] = useState<string | null>(null);

  const isValidKey = PRIVATE_KEY_REGEX.test(privateKey);
  const showError =
    authMode === "privateKey" && privateKey.length > 0 && !isValidKey;
  const canStartTest =
    authMode === "privateKey"
      ? isValidKey && canStart
      : agentKey !== null && canStart;

  async function handleConnectMetaMask() {
    if (typeof window === "undefined" || !window.ethereum) {
      setMmError("지갑 확장이 설치되어 있지 않습니다");
      return;
    }

    setMmLoading(true);
    setMmError(null);

    try {
      // MetaMask provider 찾기 (여러 지갑 확장이 있을 수 있음)
      let provider = window.ethereum;
      if ((window.ethereum as unknown as { providers?: unknown[] }).providers) {
        const providers = (
          window.ethereum as unknown as {
            providers: Array<{ isMetaMask?: boolean }>;
          }
        ).providers;
        const mm = providers.find((p) => p.isMetaMask);
        if (mm) provider = mm as typeof window.ethereum;
      }

      if (!provider) {
        setMmError("MetaMask가 설치되어 있지 않습니다");
        return;
      }

      // 1. MetaMask 연결
      const accounts = (await provider!.request({
        method: "eth_requestAccounts",
      })) as string[];
      const address = accounts[0];
      setMmAddress(address);

      // 2. Agent private key 생성
      const newAgentKey = generatePrivateKey();
      const agentAccount = privateKeyToAccount(newAgentKey);

      // 3. MetaMask로 viem walletClient 생성
      const viemWallet = createWalletClient({
        account: address as `0x${string}`,
        transport: custom(provider!),
      });

      // 4. Hyperliquid WalletClient로 approveAgent 호출
      const hlTransport = new HttpTransport({ url: TESTNET_HTTP_URL });
      const hlClient = new HLWalletClient({
        transport: hlTransport,
        wallet: viemWallet,
        isTestnet: true,
      });

      await hlClient.approveAgent({
        agentAddress: agentAccount.address,
        agentName: "stress-tester",
      });

      setAgentKey(newAgentKey);
      setMmError(null);

      // 테스트넷 잔액 조회
      try {
        const balance = await getHyperliquidBalance(address, true);
        setTestnetBalance(balance);
      } catch {
        setTestnetBalance("조회 실패");
      }
    } catch (err) {
      setMmError(err instanceof Error ? err.message : String(err));
      setAgentKey(null);
    } finally {
      setMmLoading(false);
    }
  }

  function handleStart() {
    if (authMode === "privateKey") {
      if (!isValidKey) return;
      onStart(
        normalizePrivateKey(privateKey),
        instanceCount,
        undefined,
        enableWs,
      );
    } else {
      if (!agentKey || !mmAddress) return;
      onStart(agentKey, instanceCount, mmAddress, enableWs);
    }
  }

  function handleInstanceCountChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = parseInt(e.target.value, 10);
    setInstanceCount(Number.isNaN(val) || val < 1 ? 1 : val);
  }

  return (
    <div className="flex flex-col gap-4 rounded-md border border-zinc-300 p-4 dark:border-zinc-600">
      <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
        Stress Test 설정
      </h3>

      {/* Auth Mode Toggle */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setAuthMode("privateKey")}
          disabled={isRunning}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            authMode === "privateKey"
              ? "bg-blue-600 text-white dark:bg-blue-500"
              : "border border-zinc-300 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-700"
          }`}
        >
          Private Key
        </button>
        <button
          type="button"
          onClick={() => setAuthMode("metamask")}
          disabled={isRunning}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            authMode === "metamask"
              ? "bg-orange-600 text-white dark:bg-orange-500"
              : "border border-zinc-300 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-700"
          }`}
        >
          MetaMask
        </button>
      </div>

      {/* Private Key Mode */}
      {authMode === "privateKey" && (
        <div className="flex flex-col gap-1">
          <label
            htmlFor="stress-private-key"
            className="text-xs text-zinc-500 dark:text-zinc-400"
          >
            Private Key
          </label>
          <div className="relative">
            <input
              id="stress-private-key"
              type={showKey ? "text" : "password"}
              value={privateKey}
              onChange={(e) => setPrivateKey(e.target.value)}
              placeholder="0x..."
              autoComplete="off"
              disabled={isRunning}
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 pr-16 font-mono text-sm text-zinc-900 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
            />
            <button
              type="button"
              onClick={() => setShowKey((prev) => !prev)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-0.5 text-xs text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
            >
              {showKey ? "숨기기" : "보기"}
            </button>
          </div>
          {showError && (
            <p className="text-xs text-red-600 dark:text-red-400">
              유효한 private key를 입력해주세요 (0x + 64자리 hex)
            </p>
          )}
          <p className="text-xs text-zinc-400 dark:text-zinc-500">
            Private key는 브라우저 메모리에만 보관되며 저장되지 않습니다
          </p>
        </div>
      )}

      {/* MetaMask Mode */}
      {authMode === "metamask" && (
        <div className="flex flex-col gap-3">
          {!agentKey ? (
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={handleConnectMetaMask}
                disabled={isRunning || mmLoading}
                className="inline-flex items-center gap-2 self-start rounded-md bg-orange-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-orange-500 dark:hover:bg-orange-600"
              >
                {mmLoading ? "연결 중..." : "MetaMask 연결 + Agent 생성"}
              </button>
              <p className="text-xs text-zinc-400 dark:text-zinc-500">
                MetaMask로 연결 후 API Agent 계정을 자동 생성합니다 (서명 1회
                필요)
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2 rounded-md border border-green-300 bg-green-50 p-3 dark:border-green-700 dark:bg-green-900/20">
              <p className="text-sm text-green-700 dark:text-green-400">
                ✅ Agent 계정 생성 완료
              </p>
              <div className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
                <span>Master: {mmAddress}</span>
                <span>
                  Agent:{" "}
                  {privateKeyToAccount(agentKey as `0x${string}`).address}
                </span>
                {testnetBalance !== null && (
                  <span>테스트넷 USDC: {testnetBalance}</span>
                )}
              </div>
            </div>
          )}
          {mmError && (
            <p className="text-xs text-red-600 dark:text-red-400">{mmError}</p>
          )}
        </div>
      )}

      {/* WebSocket Toggle */}
      <div className="flex items-center gap-3">
        <label
          htmlFor="stress-ws-toggle"
          className="text-xs text-zinc-500 dark:text-zinc-400"
        >
          WebSocket 연결
        </label>
        <button
          id="stress-ws-toggle"
          type="button"
          onClick={() => setEnableWs((prev) => !prev)}
          disabled={isRunning}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors disabled:opacity-50 ${
            enableWs
              ? "bg-blue-600 dark:bg-blue-500"
              : "bg-zinc-300 dark:bg-zinc-600"
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
              enableWs ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          {enableWs ? "ON — WS 구독 포함" : "OFF — REST API만 테스트"}
        </span>
      </div>

      {/* Instance Count */}
      <div className="flex flex-col gap-1">
        <label
          htmlFor="stress-instance-count"
          className="text-xs text-zinc-500 dark:text-zinc-400"
        >
          인스턴스 수 (N)
        </label>
        <input
          id="stress-instance-count"
          type="number"
          min={1}
          value={instanceCount}
          onChange={handleInstanceCountChange}
          disabled={isRunning}
          className="w-32 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
        />
      </div>

      {/* Start / Stop */}
      <div className="flex gap-2">
        {!isRunning ? (
          <button
            type="button"
            onClick={handleStart}
            disabled={!canStartTest}
            className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-blue-500 dark:hover:bg-blue-600"
          >
            시작
          </button>
        ) : (
          <button
            type="button"
            onClick={onStop}
            className="rounded-md bg-red-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600"
          >
            중단
          </button>
        )}
      </div>
    </div>
  );
}
