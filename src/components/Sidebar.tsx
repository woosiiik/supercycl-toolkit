"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { tools } from "@/config/tools";

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-56 shrink-0 border-r border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="px-4 py-5">
        <h1 className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          Supercycl Toolkit
        </h1>
      </div>
      <nav className="flex flex-col gap-0.5 px-2 pb-4">
        {tools.map((tool) => {
          const href = `/tools/${tool.slug}`;
          const isActive = pathname === href;

          return (
            <Link
              key={tool.slug}
              href={href}
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
    </aside>
  );
}
