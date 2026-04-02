"use client";

export default function SecurityWarning() {
  return (
    <div className="flex items-center gap-2 rounded-md border border-yellow-500/30 bg-yellow-50 p-3 text-sm text-yellow-800 dark:border-yellow-500/20 dark:bg-yellow-900/20 dark:text-yellow-300">
      <span className="shrink-0 text-base">⚠️</span>
      <p>
        이 도구는 브라우저에서 private key를 처리합니다. 신뢰할 수 있는
        환경에서만 사용하세요.
      </p>
    </div>
  );
}
