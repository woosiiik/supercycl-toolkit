"use client";

import { useState } from "react";
import type { SubAccount, AccountStepStatus } from "@/types/faucet";
import { maskPrivateKey } from "@/lib/faucet/account";

interface AccountStatusTableProps {
  accounts: SubAccount[];
  statuses: Map<string, AccountStepStatus>;
  showAmount?: boolean;
}

function truncateAddress(address: string): string {
  if (address.length <= 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function truncateHash(hash: string): string {
  if (hash.length <= 14) return hash;
  return `${hash.slice(0, 8)}...${hash.slice(-4)}`;
}

const statusConfig: Record<string, { label: string; className: string }> = {
  idle: {
    label: "대기",
    className:
      "bg-zinc-100 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300",
  },
  pending: {
    label: "대기중",
    className:
      "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
  },
  running: {
    label: "진행중",
    className:
      "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  },
  success: {
    label: "성공",
    className:
      "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  },
  failed: {
    label: "실패",
    className:
      "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  },
};

export default function AccountStatusTable({
  accounts,
  statuses,
  showAmount = false,
}: AccountStatusTableProps) {
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set());

  function toggleKeyReveal(address: string) {
    setRevealedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(address)) {
        next.delete(address);
      } else {
        next.add(address);
      }
      return next;
    });
  }

  if (accounts.length === 0) {
    return (
      <div className="rounded-md border border-zinc-300 p-4 dark:border-zinc-600">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">계정 없음</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-zinc-300 dark:border-zinc-600">
      <div className="max-h-80 overflow-y-auto">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
            <tr>
              <th className="px-3 py-2 font-medium">#</th>
              <th className="px-3 py-2 font-medium">Address</th>
              <th className="px-3 py-2 font-medium">Private Key</th>
              <th className="px-3 py-2 font-medium">Status</th>
              {showAmount && (
                <th className="px-3 py-2 font-medium">Amount</th>
              )}
              <th className="px-3 py-2 font-medium">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-700">
            {accounts.map((account, index) => {
              const status = statuses.get(account.address);
              const statusType = status?.status ?? "idle";
              const config = statusConfig[statusType] ?? statusConfig.idle;
              const isRevealed = revealedKeys.has(account.address);

              return (
                <tr
                  key={account.address}
                  className="text-zinc-900 dark:text-zinc-100"
                >
                  <td className="px-3 py-1.5 tabular-nums">{index + 1}</td>
                  <td className="px-3 py-1.5 font-mono text-xs">
                    {account.address}
                  </td>
                  <td className="px-3 py-1.5">
                    <button
                      type="button"
                      onClick={() => toggleKeyReveal(account.address)}
                      className="cursor-pointer font-mono text-xs text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                      title={isRevealed ? "클릭하여 숨기기" : "클릭하여 표시"}
                    >
                      {isRevealed
                        ? account.privateKey
                        : maskPrivateKey(account.privateKey)}
                    </button>
                  </td>
                  <td className="px-3 py-1.5">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${config.className}`}
                    >
                      {config.label}
                    </span>
                  </td>
                  {showAmount && (
                    <td className="px-3 py-1.5 tabular-nums">
                      {status?.amount ?? "-"}
                    </td>
                  )}
                  <td className="px-3 py-1.5 text-xs">
                    {status?.txHash && (
                      <span className="font-mono text-zinc-500 dark:text-zinc-400">
                        tx: {truncateHash(status.txHash)}
                      </span>
                    )}
                    {status?.error && (
                      <span className="text-red-500 dark:text-red-400">
                        {status.error}
                      </span>
                    )}
                    {!status?.txHash && !status?.error && (
                      <span className="text-zinc-400 dark:text-zinc-500">
                        -
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
