// Contract addresses — update after deployment.
// For local Hardhat dev: run `scripts/demo.ts` and copy the printed addresses.
// For Sepolia/mainnet: set VITE_WALLET_ADDRESS and VITE_TOKEN_ADDRESS env vars.

export const CONTRACTS = {
  wallet: import.meta.env.VITE_WALLET_ADDRESS ?? "",
  token: import.meta.env.VITE_TOKEN_ADDRESS ?? "",
};

export const SUPPORTED_CHAINS: Record<number, string> = {
  1: "Ethereum Mainnet",
  11155111: "Sepolia",
  31337: "Hardhat Local",
};
