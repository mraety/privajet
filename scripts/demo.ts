import { ethers, upgrades } from "hardhat";

async function main() {
  const [deployer, alice, bob] = await ethers.getSigners();

  console.log("=== PrivaJet Wallet Demo ===\n");
  console.log(`Deployer : ${deployer.address}`);
  console.log(`Alice    : ${alice.address}`);
  console.log(`Bob      : ${bob.address}\n`);

  // ── Deploy token ──
  console.log("Deploying PrivaJetToken...");
  const Token = await ethers.getContractFactory("PrivaJetToken");
  const token = await upgrades.deployProxy(Token, [], { initializer: "initialize", kind: "uups" });
  await token.waitForDeployment();
  const tokenAddr = await token.getAddress();
  console.log(`  PrivaJetToken proxy : ${tokenAddr}`);

  // ── Deploy stub + pool ──
  console.log("Deploying VerifierStub + ShieldedPool...");
  const Stub = await ethers.getContractFactory("VerifierStub");
  const stub = await Stub.deploy();
  await stub.waitForDeployment();

  const Pool = await ethers.getContractFactory("ShieldedPool");
  const pool = await Pool.deploy(tokenAddr, await stub.getAddress());
  await pool.waitForDeployment();
  const poolAddr = await pool.getAddress();
  console.log(`  VerifierStub        : ${await stub.getAddress()}`);
  console.log(`  ShieldedPool        : ${poolAddr}`);

  // ── Deploy wallet ──
  console.log("Deploying PrivaJetWallet (UUPS proxy)...");
  const Wallet = await ethers.getContractFactory("PrivaJetWallet");
  const wallet = await upgrades.deployProxy(Wallet, [tokenAddr], { initializer: "initialize", kind: "uups" });
  await wallet.waitForDeployment();
  const walletAddr = await wallet.getAddress();
  const implAddr = await upgrades.erc1967.getImplementationAddress(walletAddr);
  console.log(`  Wallet proxy        : ${walletAddr}`);
  console.log(`  Implementation      : ${implAddr}`);

  // ── Wire pool ──
  await wallet.setShieldedPool(poolAddr);
  console.log(`  ShieldedPool wired  : ✓\n`);

  // ── Fund users ──
  const PRIVA = ethers.parseEther("10000");
  await (token as any).transfer(alice.address, PRIVA);
  await (token as any).transfer(bob.address, PRIVA);

  // ── Alice deposits ──
  console.log("--- Alice deposits 1000 PRIVA ---");
  await (token as any).connect(alice).approve(walletAddr, ethers.MaxUint256);
  await wallet.connect(alice).deposit(ethers.parseEther("1000"));
  console.log(`  Alice wallet balance : ${ethers.formatEther(await wallet.balanceOf(alice.address))} PRIVA`);

  // ── Alice transfers 300 to Bob ──
  console.log("\n--- Alice transfers 300 PRIVA to Bob (internal) ---");
  await wallet.connect(alice).transfer(bob.address, ethers.parseEther("300"));
  console.log(`  Alice wallet balance : ${ethers.formatEther(await wallet.balanceOf(alice.address))} PRIVA`);
  console.log(`  Bob   wallet balance : ${ethers.formatEther(await wallet.balanceOf(bob.address))} PRIVA`);

  // ── Bob withdraws ──
  console.log("\n--- Bob withdraws 300 PRIVA ---");
  const bobBefore = await (token as any).balanceOf(bob.address);
  await wallet.connect(bob).withdraw(ethers.parseEther("300"));
  const bobAfter = await (token as any).balanceOf(bob.address);
  console.log(`  Bob ERC20 balance change : +${ethers.formatEther(bobAfter - bobBefore)} PRIVA`);

  // ── Alice shields 200 ──
  console.log("\n--- Alice shields 200 PRIVA (into ShieldedPool) ---");
  const commitment = ethers.keccak256(ethers.toUtf8Bytes("alice-secret-note-1"));
  await wallet.connect(alice).shield(ethers.parseEther("200"), commitment);
  console.log(`  Alice wallet balance  : ${ethers.formatEther(await wallet.balanceOf(alice.address))} PRIVA`);
  console.log(`  ShieldedPool balance  : ${ethers.formatEther(await (token as any).balanceOf(poolAddr))} PRIVA`);

  // ── Unshield attempt blocked by VerifierStub ──
  console.log("\n--- Alice tries to unshield (blocked: VerifierStub active) ---");
  try {
    const fakeRoot = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["bytes32","uint256"],[commitment, ethers.parseEther("200")]));
    await wallet.connect(alice).unshield(ethers.parseEther("200"), "0x", ethers.ZeroHash, fakeRoot);
    console.log("  ERROR: should have reverted");
  } catch (e: any) {
    console.log(`  Reverted as expected : "${e.reason ?? e.message.split("'")[1] ?? 'Proof: invalid'}"`);
  }

  // ── UUPS upgrade simulation ──
  console.log("\n--- Upgrading wallet to new implementation ---");
  const WalletV2 = await ethers.getContractFactory("PrivaJetWallet");
  const upgraded = await upgrades.upgradeProxy(walletAddr, WalletV2, { kind: "uups" });
  await upgraded.waitForDeployment();
  const newImpl = await upgrades.erc1967.getImplementationAddress(walletAddr);
  console.log(`  Proxy address (unchanged) : ${walletAddr}`);
  console.log(`  New implementation        : ${newImpl}`);
  console.log(`  Alice balance preserved   : ${ethers.formatEther(await wallet.balanceOf(alice.address))} PRIVA`);

  console.log("\n=== Demo complete — all running on ephemeral in-process network ===");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
