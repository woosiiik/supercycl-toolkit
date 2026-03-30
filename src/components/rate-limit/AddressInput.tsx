"use client";

interface AddressInputProps {
  value: string;
  onChange: (value: string) => void;
  error: string | null;
  disabled: boolean;
}

export default function AddressInput({
  value,
  onChange,
  error,
  disabled,
}: AddressInputProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor="hl-address"
        className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
      >
        Hyperliquid 주소
      </label>
      <input
        id="hl-address"
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0x..."
        disabled={disabled}
        className={`rounded-md border px-3 py-2 text-sm outline-none transition-colors ${
          error
            ? "border-red-400 focus:border-red-500 focus:ring-1 focus:ring-red-500"
            : "border-zinc-300 focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 dark:border-zinc-600 dark:focus:border-zinc-400 dark:focus:ring-zinc-400"
        } ${
          disabled
            ? "cursor-not-allowed bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500"
            : "bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100"
        }`}
      />
      {error && (
        <p className="text-sm text-red-500 dark:text-red-400">{error}</p>
      )}
    </div>
  );
}
