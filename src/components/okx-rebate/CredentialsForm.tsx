"use client";

import { useState } from "react";
import type { CachedRange } from "@/lib/okx-rebate/types";

interface ExistingLink {
  cTime: number;
  cTimeStr: string;
  state: string;
  fileHref: string | null;
}

interface CredentialsFormProps {
  onSubmit: (params: { beginDate: string; endDate: string; forceDownload: boolean }) => void;
  onUseExistingLink: (downloadUrl: string, beginDate: string, endDate: string) => void;
  disabled: boolean;
  cachedRanges: CachedRange[];
}

export default function CredentialsForm({
  onSubmit,
  onUseExistingLink,
  disabled,
  cachedRanges,
}: CredentialsFormProps) {
  const [beginDate, setBeginDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [forceDownload, setForceDownload] = useState(false);
  const [existingLinks, setExistingLinks] = useState<ExistingLink[] | null>(null);
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  const dateError =
    beginDate && endDate && endDate < beginDate
      ? "종료 날짜가 시작 날짜보다 이전입니다"
      : null;

  const canSubmit = !disabled && beginDate && endDate && !dateError;
  const canCheckLinks = !disabled && !linkLoading;

  const hasCacheForRange =
    beginDate &&
    endDate &&
    cachedRanges.some(
      (c) => c.beginDate === beginDate && c.endDate === endDate,
    );

  function handleSubmit() {
    if (!canSubmit) return;
    onSubmit({ beginDate, endDate, forceDownload });
  }

  async function handleCheckLinks() {
    if (!canCheckLinks) return;
    setLinkLoading(true);
    setLinkError(null);
    setExistingLinks(null);
    try {
      // 최근 5일~오늘 범위로 조회 (링크 생성 시점 기준)
      const now = new Date();
      const ago = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
      const listBegin = ago.toISOString().slice(0, 10);
      const listEnd = now.toISOString().slice(0, 10);

      const res = await fetch("/api/okx-rebate/csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "list-links",
          beginDate: listBegin,
          endDate: listEnd,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setExistingLinks(data.links as ExistingLink[]);
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : String(err));
    } finally {
      setLinkLoading(false);
    }
  }

  const labelCls =
    "block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1";
  const inputCls =
    "w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500";

  return (
    <div className="space-y-4">
      {/* 기간 */}
      <fieldset className="rounded-md border border-zinc-200 p-4 dark:border-zinc-700">
        <legend className="px-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
          조회 기간
        </legend>
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className={labelCls}>시작</label>
            <input
              type="date"
              value={beginDate}
              onChange={(e) => setBeginDate(e.target.value)}
              className={inputCls}
              disabled={disabled}
            />
          </div>
          <span className="pb-1.5 text-zinc-400">~</span>
          <div className="flex-1">
            <label className={labelCls}>종료</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className={inputCls}
              disabled={disabled}
            />
          </div>
        </div>
        {dateError && (
          <p className="mt-1 text-xs text-red-500">{dateError}</p>
        )}
        {hasCacheForRange && !forceDownload && (
          <p className="mt-2 text-xs text-blue-500">
            이 기간의 캐시 데이터가 있습니다. OKX 다운로드를 건너뜁니다.
          </p>
        )}
      </fieldset>

      {/* 실행 버튼들 */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="rounded-md bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {disabled ? "진행 중..." : "실행"}
        </button>
        <button
          onClick={handleCheckLinks}
          disabled={!canCheckLinks}
          className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-700"
        >
          {linkLoading ? "조회 중..." : "기존 링크 조회"}
        </button>
        <span className="text-xs text-zinc-400">(최근 5일)</span>
        <label className="flex items-center gap-1.5 text-sm text-zinc-500 dark:text-zinc-400">
          <input
            type="checkbox"
            checked={forceDownload}
            onChange={(e) => setForceDownload(e.target.checked)}
            className="rounded"
            disabled={disabled}
          />
          캐시 무시 (새로 다운로드)
        </label>
      </div>

      {/* 기존 링크 조회 결과 */}
      {linkError && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-700 dark:bg-red-950 dark:text-red-300">
          {linkError}
        </div>
      )}
      {existingLinks !== null && (
        <div className="rounded-md border border-zinc-200 p-4 dark:border-zinc-700">
          <h4 className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            OKX 다운로드 링크 목록 ({existingLinks.length}건)
          </h4>
          {existingLinks.length === 0 ? (
            <p className="text-xs text-zinc-400">생성된 링크가 없습니다.</p>
          ) : (
            <div className="space-y-2">
              {existingLinks.map((link) => (
                <div
                  key={link.cTime}
                  className="flex items-center justify-between rounded-md border border-zinc-100 px-3 py-2 text-xs dark:border-zinc-700"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`inline-block rounded px-1.5 py-0.5 font-medium ${
                        link.state === "finished"
                          ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                          : "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300"
                      }`}
                    >
                      {link.state}
                    </span>
                    <span className="tabular-nums text-zinc-500 dark:text-zinc-400">
                      {link.cTimeStr.replace("T", " ").slice(0, 19)} UTC
                    </span>
                    <span className="font-mono text-zinc-400">
                      cTime={link.cTime}
                    </span>
                  </div>
                  {link.state === "finished" && link.fileHref && (
                    <button
                      onClick={() => onUseExistingLink(link.fileHref!, beginDate, endDate)}
                      disabled={disabled}
                      className="rounded-md bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                    >
                      이 링크로 다운로드
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
        <p className="font-medium">OKX API Rate Limit</p>
        <ul className="mt-1 list-inside list-disc space-y-0.5">
          <li>CSV 생성 요청 (POST): <strong>1회 / 60분</strong> — 429 발생 시 1시간 대기</li>
          <li>링크 조회 (GET): 2회 / 분</li>
          <li>CSV 생성 소요: 최대 2시간</li>
          <li>한 번 다운로드하면 캐시되어 재호출 불필요</li>
        </ul>
        <p className="mt-1 text-amber-600 dark:text-amber-400">OKX 브로커 인증 및 DB 접속 정보는 .env 파일에서 읽습니다.</p>
      </div>
    </div>
  );
}
