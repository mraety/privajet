import { ethers, upgrades } from "hardhat";

async function main() {
  const tokenAddress = process.env.TOKEN_ADDRESS;
  if (!tokenAddress || !ethers.isAddress(tokenAddress)) {
    throw new Error("Set TOKEN_ADDRESS=<PrivaJetToken proxy address> before running.");
  }

  console.log("Deploying PrivaJetWallet (UUPS proxy)...");

  const Wallet = await ethers.getContractFactory("PrivaJetWallet");
  const wallet = await upgrades.deployProxy(Wallet, [tokenAddress], {
    initializer: "initialize",
    kind: "uups",
  });

  await wallet.waitForDeployment();
  const proxyAddress = await wallet.getAddress();
  const implAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);

  console.log(`\nDeployment summary:`);
  console.log(`  PrivaJetWallet proxy: ${proxyAddress}`);
  console.log(`  Implementation:       ${implAddress}`);
  console.log(`  Token:                ${tokenAddress}`);
  console.log(`\nNext: call wallet.setShieldedPool(<poolAddress>) once ShieldedPool is live.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
