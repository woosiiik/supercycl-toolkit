"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { tools } from "@/config/tools";

export default function Sidebar() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* 모바일 햄버거 버튼 */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="fixed left-3 top-3 z-40 rounded-md bg-zinc-100 p-2 text-zinc-700 shadow-sm md:hidden dark:bg-zinc-800 dark:text-zinc-300"
        aria-label="메뉴 열기"
      >
        <svg
          className="h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4 6h16M4 12h16M4 18h16"
          />
        </svg>
      </button>

      {/* 모바일 오버레이 */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* 사이드바 */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-56 flex-col border-r border-zinc-200 bg-zinc-50 transition-transform md:static md:translate-x-0 dark:border-zinc-800 dark:bg-zinc-900 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* 모바일 닫기 버튼 */}
        <div className="flex items-center justify-between px-4 py-5">
          <h1 className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            Supercycl Toolkit
          </h1>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="rounded-md p-1 text-zinc-500 hover:text-zinc-700 md:hidden dark:text-zinc-400 dark:hover:text-zinc-200"
            aria-label="메뉴 닫기"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 px-2 pb-4">
          {tools.map((tool) => {
            const href = `/tools/${tool.slug}`;
            const isActive = pathname === href;

            return (
              <Link
                key={tool.slug}
                href={href}
                onClick={() => setIsOpen(false)}
                className={`rounded-md px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? "bg-zinc-200 font-medium text-zinc-900 dark:bg-zinc-700 dark:text-zinc-100"
                    : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                }`}
              >
                {tool.name}
              </Link>
            );
          })}
        </nav>

        <div className="px-4 py-3 text-xs text-zinc-400 dark:text-zinc-600">
          v1.0.0
        </div>
      </aside>
    </>
  );
}
