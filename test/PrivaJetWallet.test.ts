import { ethers, upgrades } from "hardhat";
import { expect } from "chai";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import {
  PrivaJetToken,
  PrivaJetWallet,
  ShieldedPool,
  VerifierStub,
} from "../typechain-types";

describe("PrivaJetWallet", () => {
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;

  let token: PrivaJetToken;
  let wallet: PrivaJetWallet;
  let pool: ShieldedPool;
  let stub: VerifierStub;

  const DEPOSIT_AMOUNT = ethers.parseEther("1000");
  const HALF = ethers.parseEther("500");

  beforeEach(async () => {
    [owner, alice, bob] = await ethers.getSigners();

    // Deploy PRIVA token
    const Token = await ethers.getContractFactory("PrivaJetToken");
    token = (await upgrades.deployProxy(Token, [], {
      initializer: "initialize",
      kind: "uups",
    })) as unknown as PrivaJetToken;
    await token.waitForDeployment();

    // Deploy wallet
    const Wallet = await ethers.getContractFactory("PrivaJetWallet");
    wallet = (await upgrades.deployProxy(Wallet, [await token.getAddress()], {
      initializer: "initialize",
      kind: "uups",
    })) as unknown as PrivaJetWallet;
    await wallet.waitForDeployment();

    // Deploy stub verifier + shielded pool
    const Stub = await ethers.getContractFactory("VerifierStub");
    stub = (await Stub.deploy()) as unknown as VerifierStub;
    await stub.waitForDeployment();

    const Pool = await ethers.getContractFactory("ShieldedPool");
    pool = (await Pool.deploy(
      await token.getAddress(),
      await stub.getAddress()
    )) as unknown as ShieldedPool;
    await pool.waitForDeployment();

    // Fund alice and bob from owner's supply
    await token.transfer(alice.address, DEPOSIT_AMOUNT * 2n);
    await token.transfer(bob.address, DEPOSIT_AMOUNT * 2n);

    // Pre-approve wallet for deposits
    await token.connect(alice).approve(await wallet.getAddress(), ethers.MaxUint256);
    await token.connect(bob).approve(await wallet.getAddress(), ethers.MaxUint256);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Initialization
  // ──────────────────────────────────────────────────────────────────────────

  describe("initialization", () => {
    it("sets the token address", async () => {
      expect(await wallet.token()).to.equal(await token.getAddress());
    });

    it("sets owner to deployer", async () => {
      expect(await wallet.owner()).to.equal(owner.address);
    });

    it("starts with zero shieldedPool", async () => {
      expect(await wallet.shieldedPool()).to.equal(ethers.ZeroAddress);
    });

    it("reverts on initialize with zero token", async () => {
      const Wallet = await ethers.getContractFactory("PrivaJetWallet");
      await expect(
        upgrades.deployProxy(Wallet, [ethers.ZeroAddress], {
          initializer: "initialize",
          kind: "uups",
        })
      ).to.be.revertedWith("Token: zero address");
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Deposit
  // ──────────────────────────────────────────────────────────────────────────

  describe("deposit", () => {
    it("transfers tokens from caller to wallet contract", async () => {
      const before = await token.balanceOf(alice.address);
      await wallet.connect(alice).deposit(DEPOSIT_AMOUNT);
      expect(await token.balanceOf(alice.address)).to.equal(before - DEPOSIT_AMOUNT);
      expect(await token.balanceOf(await wallet.getAddress())).to.equal(DEPOSIT_AMOUNT);
    });

    it("credits the internal balance", async () => {
      await wallet.connect(alice).deposit(DEPOSIT_AMOUNT);
      expect(await wallet.balanceOf(alice.address)).to.equal(DEPOSIT_AMOUNT);
    });

    it("emits Deposited event", async () => {
      await expect(wallet.connect(alice).deposit(DEPOSIT_AMOUNT))
        .to.emit(wallet, "Deposited")
        .withArgs(alice.address, DEPOSIT_AMOUNT);
    });

    it("reverts on zero amount", async () => {
      await expect(wallet.connect(alice).deposit(0)).to.be.revertedWith("Amount: zero");
    });

    it("reverts when paused", async () => {
      await wallet.connect(owner).pause();
      await expect(wallet.connect(alice).deposit(DEPOSIT_AMOUNT)).to.be.revertedWith(
        "Pausable: paused"
      );
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Withdraw
  // ──────────────────────────────────────────────────────────────────────────

  describe("withdraw", () => {
    beforeEach(async () => {
      await wallet.connect(alice).deposit(DEPOSIT_AMOUNT);
    });

    it("returns tokens to caller", async () => {
      const before = await token.balanceOf(alice.address);
      await wallet.connect(alice).withdraw(HALF);
      expect(await token.balanceOf(alice.address)).to.equal(before + HALF);
    });

    it("decrements internal balance", async () => {
      await wallet.connect(alice).withdraw(HALF);
      expect(await wallet.balanceOf(alice.address)).to.equal(HALF);
    });

    it("emits Withdrawn event", async () => {
      await expect(wallet.connect(alice).withdraw(HALF))
        .to.emit(wallet, "Withdrawn")
        .withArgs(alice.address, HALF);
    });

    it("reverts when balance insufficient", async () => {
      await expect(
        wallet.connect(alice).withdraw(DEPOSIT_AMOUNT + 1n)
      ).to.be.revertedWith("Wallet: insufficient balance");
    });

    it("reverts on zero amount", async () => {
      await expect(wallet.connect(alice).withdraw(0)).to.be.revertedWith("Amount: zero");
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Transfer
  // ──────────────────────────────────────────────────────────────────────────

  describe("transfer", () => {
    beforeEach(async () => {
      await wallet.connect(alice).deposit(DEPOSIT_AMOUNT);
    });

    it("moves internal balance without touching ERC20", async () => {
      const aliceBefore = await token.balanceOf(alice.address);
      await wallet.connect(alice).transfer(bob.address, HALF);
      expect(await wallet.balanceOf(alice.address)).to.equal(HALF);
      expect(await wallet.balanceOf(bob.address)).to.equal(HALF);
      // No ERC20 movement
      expect(await token.balanceOf(alice.address)).to.equal(aliceBefore);
    });

    it("emits Transferred event", async () => {
      await expect(wallet.connect(alice).transfer(bob.address, HALF))
        .to.emit(wallet, "Transferred")
        .withArgs(alice.address, bob.address, HALF);
    });

    it("reverts when balance insufficient", async () => {
      await expect(
        wallet.connect(alice).transfer(bob.address, DEPOSIT_AMOUNT + 1n)
      ).to.be.revertedWith("Wallet: insufficient balance");
    });

    it("reverts on zero address recipient", async () => {
      await expect(
        wallet.connect(alice).transfer(ethers.ZeroAddress, HALF)
      ).to.be.revertedWith("To: zero address");
    });

    it("reverts on self-transfer", async () => {
      await expect(
        wallet.connect(alice).transfer(alice.address, HALF)
      ).to.be.revertedWith("To: self");
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Shield (privacy hook)
  // ──────────────────────────────────────────────────────────────────────────

  describe("shield", () => {
    const commitment = ethers.keccak256(ethers.toUtf8Bytes("test-note"));

    beforeEach(async () => {
      await wallet.connect(alice).deposit(DEPOSIT_AMOUNT);
    });

    it("reverts when shieldedPool is not configured", async () => {
      await expect(
        wallet.connect(alice).shield(HALF, commitment)
      ).to.be.revertedWith("Privacy: pool not configured");
    });

    it("reverts on zero commitment", async () => {
      await wallet.connect(owner).setShieldedPool(await pool.getAddress());
      // Also approve pool to pull from wallet
      await token.connect(owner).approve(await pool.getAddress(), ethers.MaxUint256);
      await expect(
        wallet.connect(alice).shield(HALF, ethers.ZeroHash)
      ).to.be.revertedWith("Commitment: zero");
    });

    it("moves balance to ShieldedPool once configured", async () => {
      await wallet.connect(owner).setShieldedPool(await pool.getAddress());
      await wallet.connect(alice).shield(HALF, commitment);

      expect(await wallet.balanceOf(alice.address)).to.equal(HALF);
      expect(await token.balanceOf(await pool.getAddress())).to.equal(HALF);
    });

    it("emits Shielded event", async () => {
      await wallet.connect(owner).setShieldedPool(await pool.getAddress());
      await expect(wallet.connect(alice).shield(HALF, commitment))
        .to.emit(wallet, "Shielded")
        .withArgs(alice.address, HALF, commitment);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Unshield (privacy hook — blocked by VerifierStub)
  // ──────────────────────────────────────────────────────────────────────────

  describe("unshield", () => {
    it("reverts when shieldedPool not configured", async () => {
      await expect(
        wallet
          .connect(alice)
          .unshield(HALF, "0x", ethers.ZeroHash, ethers.ZeroHash)
      ).to.be.revertedWith("Privacy: pool not configured");
    });

    it("reverts with invalid proof while VerifierStub is active", async () => {
      await wallet.connect(owner).setShieldedPool(await pool.getAddress());
      // Provide a fake root to pass the root check
      const fakeRoot = ethers.ZeroHash;
      await expect(
        wallet
          .connect(alice)
          .unshield(HALF, "0x1234", ethers.ZeroHash, fakeRoot)
      ).to.be.reverted; // Root: unknown or Proof: invalid
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Admin
  // ──────────────────────────────────────────────────────────────────────────

  describe("admin", () => {
    it("setShieldedPool emits ShieldedPoolSet", async () => {
      const poolAddr = await pool.getAddress();
      await expect(wallet.connect(owner).setShieldedPool(poolAddr))
        .to.emit(wallet, "ShieldedPoolSet")
        .withArgs(ethers.ZeroAddress, poolAddr);
    });

    it("setShieldedPool reverts for non-owner", async () => {
      await expect(
        wallet.connect(alice).setShieldedPool(await pool.getAddress())
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("pause / unpause toggles correctly", async () => {
      await wallet.connect(owner).pause();
      expect(await wallet.paused()).to.be.true;
      await wallet.connect(owner).unpause();
      expect(await wallet.paused()).to.be.false;
    });

    it("pause reverts for non-owner", async () => {
      await expect(wallet.connect(alice).pause()).to.be.revertedWith(
        "Ownable: caller is not the owner"
      );
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // UUPS upgrade
  // ──────────────────────────────────────────────────────────────────────────

  describe("UUPS upgrade", () => {
    it("non-owner cannot upgrade", async () => {
      const WalletV2 = await ethers.getContractFactory("PrivaJetWallet", alice);
      await expect(
        upgrades.upgradeProxy(await wallet.getAddress(), WalletV2, { kind: "uups" })
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("owner can upgrade to new implementation", async () => {
      const WalletV2 = await ethers.getContractFactory("PrivaJetWallet");
      const upgraded = await upgrades.upgradeProxy(
        await wallet.getAddress(),
        WalletV2,
        { kind: "uups" }
      );
      await upgraded.waitForDeployment();
      // Proxy address unchanged, state preserved
      expect(await upgraded.getAddress()).to.equal(await wallet.getAddress());
      expect(await (upgraded as unknown as PrivaJetWallet).token()).to.equal(
        await token.getAddress()
      );
    });

    it("preserves balances across upgrade", async () => {
      await wallet.connect(alice).deposit(DEPOSIT_AMOUNT);

      const WalletV2 = await ethers.getContractFactory("PrivaJetWallet");
      const upgraded = (await upgrades.upgradeProxy(
        await wallet.getAddress(),
        WalletV2,
        { kind: "uups" }
      )) as unknown as PrivaJetWallet;
      await upgraded.waitForDeployment();

      expect(await upgraded.balanceOf(alice.address)).to.equal(DEPOSIT_AMOUNT);
    });
  });
});
