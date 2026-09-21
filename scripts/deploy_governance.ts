import { ethers } from "hardhat";

// Seconds a DAO handover must sit for before the proposed DAO can accept it.
// Must be within [MIN_HANDOVER_DELAY, MAX_HANDOVER_DELAY] on the contract.
const DEFAULT_HANDOVER_DELAY = 7 * 24 * 60 * 60; // 7 days

async function main() {
  const guardian = process.env.GUARDIAN_ADDRESS;
  if (!guardian || !ethers.isAddress(guardian)) {
    throw new Error(
      "Set GUARDIAN_ADDRESS=<treasury multisig> before running this script."
    );
  }

  const handoverDelay = process.env.HANDOVER_DELAY
    ? Number(process.env.HANDOVER_DELAY)
    : DEFAULT_HANDOVER_DELAY;

  if (!Number.isInteger(handoverDelay) || handoverDelay <= 0) {
    throw new Error("HANDOVER_DELAY must be a positive whole number of seconds.");
  }

  console.log("Deploying PrivaJetGovernance...");
  console.log(`  Guardian:       ${guardian}`);
  console.log(`  Handover delay: ${handoverDelay}s`);

  const Governance = await ethers.getContractFactory("PrivaJetGovernance");
  const governance = await Governance.deploy(guardian, handoverDelay);
  await governance.waitForDeployment();
  const address = await governance.getAddress();

  console.log(`\nPrivaJetGovernance deployed to: ${address}`);
  console.log(`Current authority:              ${await governance.authority()}`);
  console.log(`DAO:                            (unset — set it later)`);

  console.log("\nNext steps:");
  console.log("  1. Point the protocol contracts at governance (transfer ownership");
  console.log(`     of the token proxy, VestingManager and ShieldedPool to ${address}).`);
  console.log("  2. Run protocol actions through governance.execute(target, 0, calldata).");
  console.log("  3. When the DAO exists: guardian calls proposeDao(<dao>), waits out the");
  console.log("     delay, then the DAO itself calls acceptDao().");
  console.log("  4. Once the DAO is live, the guardian may call renounceGuardian().");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
