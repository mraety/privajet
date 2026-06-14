export const CONTRACTS = {
  wallet: import.meta.env.VITE_WALLET_ADDRESS ?? "",
  token:  import.meta.env.VITE_TOKEN_ADDRESS  ?? "",
};

export const RPC_URLS = {
  mainnet: import.meta.env.VITE_MAINNET_RPC  ?? "https://cloudflare-eth.com",
  sepolia: import.meta.env.VITE_SEPOLIA_RPC   ?? "https://rpc.sepolia.org",
  local:   "http://127.0.0.1:8545",
} as const;

export const NETWORK_NAMES: Record<keyof typeof RPC_URLS, string> = {
  mainnet: "Ethereum Mainnet",
  sepolia: "Sepolia Testnet",
  local:   "Hardhat Local",
};
