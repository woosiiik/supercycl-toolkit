"use client";

import { useState, useRef } from "react";
import type { SubAccount } from "@/types/faucet";

interface SubAccountManagerProps {
  accounts: SubAccount[];
  onGenerate: (count: number) => void;
  onRestore: (file: File) => void;
  onDownloadBackup: () => void;
}

function truncateAddress(address: string): string {
  if (address.length <= 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export default function SubAccountManager({
  accounts,
  onGenerate,
  onRestore,
  onDownloadBackup,
}: SubAccountManagerProps) {
  const [count, setCount] = useState(1);
  const [showConfirm, setShowConfirm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleGenerate() {
    if (accounts.length > 0) {
      setShowConfirm(true);
      return;
    }
    onGenerate(count);
  }

  function handleConfirmGenerate() {
    onDownloadBackup();
    onGenerate(count);
    setShowConfirm(false);
  }

  function handleCancelGenerate() {
    setShowConfirm(false);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      onRestore(file);
      // Reset input so the same file can be selected again
      e.target.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-md border border-zinc-300 p-4 dark:border-zinc-600">
      <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
        Sub Account 관리
      </h3>

      {/* Account generation */}
      <div className="flex items-end gap-3">
        <div className="flex flex-col gap-1">
          <label
            htmlFor="account-count"
            className="text-xs text-zinc-500 dark:text-zinc-400"
          >
            생성할 계정 수
          </label>
          <input
            id="account-count"
            type="number"
            min={1}
            max={200}
            value={count}
            onChange={(e) => {
              const v = Math.max(1, Math.min(200, Number(e.target.value) || 1));
              setCount(v);
            }}
            className="w-24 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm tabular-nums text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
          />
        </div>
        <button
          type="button"
          onClick={handleGenerate}
          className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
        >
          계정 생성
        </button>
      </div>

      {/* Confirmation dialog when accounts already exist */}
      {showConfirm && (
        <div className="flex flex-col gap-2 rounded-md border border-yellow-500/30 bg-yellow-50 p-3 text-sm dark:border-yellow-500/20 dark:bg-yellow-900/20">
          <p className="text-yellow-800 dark:text-yellow-300">
            기존 {accounts.length}개 계정이 있습니다. 백업 후 새로 생성합니다.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleConfirmGenerate}
              className="rounded-md bg-yellow-600 px-3 py-1 text-xs font-medium text-white hover:bg-yellow-700 dark:bg-yellow-500 dark:hover:bg-yellow-600"
            >
              백업 후 생성
            </button>
            <button
              type="button"
              onClick={handleCancelGenerate}
              className="rounded-md border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-700"
            >
              취소
            </button>
          </div>
        </div>
      )}

      {/* Account count summary */}
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        총 {accounts.length}개 계정
      </p>

      {/* Account list */}
      {accounts.length > 0 && (
        <div className="max-h-48 overflow-y-auto rounded-md border border-zinc-200 dark:border-zinc-700">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-1.5 font-medium">#</th>
                <th className="px-3 py-1.5 font-medium">Address</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-700">
              {accounts.map((account, index) => (
                <tr
                  key={account.address}
                  className="text-zinc-900 dark:text-zinc-100"
                >
                  <td className="px-3 py-1 tabular-nums">{index + 1}</td>
                  <td className="px-3 py-1 font-mono text-xs">
                    {account.address}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Backup & Restore buttons */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onDownloadBackup}
          disabled={accounts.length === 0}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-700"
        >
          키 백업 다운로드
        </button>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-700"
        >
          JSON 파일 복원
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>
    </div>
  );
}
