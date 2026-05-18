import { ethers } from "hardhat";

async function main() {
  const tokenAddress = process.env.TOKEN_ADDRESS;
  if (!tokenAddress || !ethers.isAddress(tokenAddress)) {
    throw new Error("Set TOKEN_ADDRESS=<PrivaJetTokenV2 proxy address> before running.");
  }

  // Deploy the stub verifier (blocks ZK operations until V3).
  console.log("Deploying VerifierStub...");
  const Stub = await ethers.getContractFactory("VerifierStub");
  const stub = await Stub.deploy();
  await stub.waitForDeployment();
  const stubAddress = await stub.getAddress();
  console.log(`VerifierStub deployed to: ${stubAddress}`);

  // Deploy the shielded pool with the stub verifier.
  console.log("Deploying ShieldedPool...");
  const Pool = await ethers.getContractFactory("ShieldedPool");
  const pool = await Pool.deploy(tokenAddress, stubAddress);
  await pool.waitForDeployment();
  const poolAddress = await pool.getAddress();
  console.log(`ShieldedPool deployed to: ${poolAddress}`);

  console.log("\nDeployment summary:");
  console.log(`  Token proxy:    ${tokenAddress}`);
  console.log(`  VerifierStub:   ${stubAddress}`);
  console.log(`  ShieldedPool:   ${poolAddress}`);
  console.log("\nTo enable ZK transfers: multisig calls pool.setVerifier(<realVerifier>).");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
