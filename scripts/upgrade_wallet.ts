import { ethers, upgrades } from "hardhat";

// Mainnet proxy — set WALLET_PROXY_ADDRESS to override.
const WALLET_PROXY = process.env.WALLET_PROXY_ADDRESS || "";

async function main() {
  if (!WALLET_PROXY || !ethers.isAddress(WALLET_PROXY)) {
    throw new Error("Set WALLET_PROXY_ADDRESS=<proxy address> before running.");
  }

  console.log(`Upgrading PrivaJetWallet proxy at ${WALLET_PROXY}...`);

  const WalletV2 = await ethers.getContractFactory("PrivaJetWallet");

  // validateUpgrade ensures no storage-layout collisions before touching the chain.
  await upgrades.validateUpgrade(WALLET_PROXY, WalletV2, { kind: "uups" });
  console.log("Storage layout validated — no collisions detected.");

  const upgraded = await upgrades.upgradeProxy(WALLET_PROXY, WalletV2, {
    kind: "uups",
  });

  await upgraded.waitForDeployment();
  const newImpl = await upgrades.erc1967.getImplementationAddress(WALLET_PROXY);

  console.log(`\nUpgrade summary:`);
  console.log(`  Proxy (unchanged): ${WALLET_PROXY}`);
  console.log(`  New implementation: ${newImpl}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
