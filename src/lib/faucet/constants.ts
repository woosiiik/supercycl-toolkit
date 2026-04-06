// Arbitrum USDC contract and Hyperliquid bridge addresses
export const USDC_CONTRACT =
  "0xaf88d065e77c8cc2239327c5edb3a432268e5831" as const;
export const BRIDGE_ADDRESS =
  "0x2df1c51e09aecf9cacb7bc98cb1742757f163df7" as const;
export const ARBITRUM_RPC = "https://arb1.arbitrum.io/rpc" as const;

// Hyperliquid API endpoints
export const MAINNET_INFO_API = "https://api.hyperliquid.xyz/info" as const;
export const MAINNET_EXCHANGE_API =
  "https://api.hyperliquid.xyz/exchange" as const;
export const TESTNET_INFO_API =
  "https://api.hyperliquid-testnet.xyz/info" as const;
export const TESTNET_EXCHANGE_API =
  "https://api.hyperliquid-testnet.xyz/exchange" as const;
export const DEPOSIT_API = "https://api-ui.hyperliquid.xyz/info" as const; // depositWithPermit 전용
export const FAUCET_API =
  "https://api-ui.hyperliquid-testnet.xyz/info" as const; // claimDrip 전용

// USDC token config
export const USDC_DECIMALS = 6;
export const DEPOSIT_AMOUNT_USD = 5.1; // deposit할 USDC 금액
export const TRANSFER_AMOUNT_USD = 5.1; // Main→Sub 전송 금액 (deposit + 여유분)

// EIP-2612 Permit domain for Arbitrum USDC
export const PERMIT_DOMAIN = {
  name: "USD Coin",
  version: "2",
  chainId: 42161,
  verifyingContract: USDC_CONTRACT,
} as const;

// EIP-2612 Permit typed data types
export const PERMIT_TYPES = {
  Permit: [
    { name: "owner", type: "address" },
    { name: "spender", type: "address" },
    { name: "value", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

// ERC-20 minimal ABI (balanceOf, transfer, nonces, approve)
export const USDC_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function nonces(address owner) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
] as const;
