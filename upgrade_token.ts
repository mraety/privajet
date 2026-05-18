import { ethers, upgrades } from "hardhat";

// V1 proxy address — already deployed on mainnet.
const V1_PROXY = "0xd0781707659cbb0dAeB70a36A31Cd076e48c2f88";

async function main() {
  const proxyAddress = process.env.PROXY_ADDRESS || V1_PROXY;

  console.log(`Upgrading proxy at ${proxyAddress} to PrivaJetToken...`);

  const TokenV2 = await ethers.getContractFactory("PrivaJetToken");
  const upgraded = await upgrades.upgradeProxy(proxyAddress, TokenV2, {
    kind: "uups",
  });

  await upgraded.waitForDeployment();
  const newImplAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);

  console.log(`Proxy:          ${proxyAddress} (unchanged)`);
  console.log(`New impl:       ${newImplAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
