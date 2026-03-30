import type { ToolConfig } from "@/config/tools";

interface ToolHeaderProps {
  tool: ToolConfig;
}

export default function ToolHeader({ tool }: ToolHeaderProps) {
  return (
    <header className="border-b border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-950">
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        {tool.name}
      </h2>
      <p className="mt-1 whitespace-pre-line text-sm text-zinc-500 dark:text-zinc-400">
        {tool.description}
      </p>
    </header>
  );
}
