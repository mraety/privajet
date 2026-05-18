import { ethers, upgrades } from "hardhat";

async function main() {
  console.log("Deploying PrivaJetToken...");

  const Token = await ethers.getContractFactory("PrivaJetToken");
  const token = await upgrades.deployProxy(Token, [], {
    initializer: "initialize",
    kind: "uups",
  });

  await token.waitForDeployment();
  const proxyAddress = await token.getAddress();

  console.log(`PrivaJetToken proxy deployed to: ${proxyAddress}`);
  console.log("Next: deploy VestingManager with this address as constructor arg.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
