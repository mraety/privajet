import { ethers } from "hardhat";

async function main() {
  const tokenAddress = process.env.TOKEN_ADDRESS;
  if (!tokenAddress || !ethers.isAddress(tokenAddress)) {
    throw new Error(
      "Set TOKEN_ADDRESS=<PrivaJetTokenV2 proxy address> in your environment before running this script."
    );
  }

  console.log(`Deploying VestingManager with token: ${tokenAddress}`);

  const VestingManager = await ethers.getContractFactory(
    "contracts/Vestingmanager.sol:VestingManager"
  );
  const vestingManager = await VestingManager.deploy(tokenAddress);

  await vestingManager.waitForDeployment();
  const address = await vestingManager.getAddress();

  console.log(`VestingManager deployed to: ${address}`);
  console.log("Next: transfer PRIVA from treasury multisig to VestingManager.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
