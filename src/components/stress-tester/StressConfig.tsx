"use client";

import { useState } from "react";
import { PRIVATE_KEY_REGEX } from "@/types/stress";

interface StressConfigProps {
  onStart: (privateKey: string, instanceCount: number) => void;
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
  const [privateKey, setPrivateKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [instanceCount, setInstanceCount] = useState(1);

  const isValidKey = PRIVATE_KEY_REGEX.test(privateKey);
  const showError = privateKey.length > 0 && !isValidKey;

  function handleStart() {
    if (!isValidKey) return;
    onStart(privateKey, instanceCount);
  }

  function handleInstanceCountChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = parseInt(e.target.value, 10);
    if (Number.isNaN(val) || val < 1) {
      setInstanceCount(1);
    } else {
      setInstanceCount(val);
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-md border border-zinc-300 p-4 dark:border-zinc-600">
      <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
        Stress Test 설정
      </h3>

      {/* Private Key */}
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
            disabled={!isValidKey || !canStart}
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
