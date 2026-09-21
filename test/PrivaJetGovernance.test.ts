import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";

const DAY = 24 * 60 * 60;
const HANDOVER_DELAY = 7 * DAY;
const ZERO = ethers.ZeroAddress;

async function deployFixture() {
  const [deployer, guardian, newGuardian, outsider] = await ethers.getSigners();

  const Governance = await ethers.getContractFactory("PrivaJetGovernance");
  const governance = await Governance.deploy(guardian.address, HANDOVER_DELAY);
  await governance.waitForDeployment();

  const Caller = await ethers.getContractFactory("MockCaller");
  const dao = await Caller.deploy();
  const otherDao = await Caller.deploy();
  await dao.waitForDeployment();
  await otherDao.waitForDeployment();

  const Target = await ethers.getContractFactory("MockTarget");
  const target = await Target.deploy();
  await target.waitForDeployment();

  const Governed = await ethers.getContractFactory("MockGoverned");
  const governed = await Governed.deploy(await governance.getAddress());
  await governed.waitForDeployment();

  return { governance, dao, otherDao, target, governed, deployer, guardian, newGuardian, outsider };
}

/// Runs the full propose → wait → accept handover and returns the live DAO.
async function activateDao() {
  const ctx = await loadFixture(deployFixture);
  const { governance, dao, guardian } = ctx;

  await governance.connect(guardian).proposeDao(await dao.getAddress());
  await time.increase(HANDOVER_DELAY);
  await dao.forward(
    await governance.getAddress(),
    0,
    governance.interface.encodeFunctionData("acceptDao")
  );

  return ctx;
}

describe("PrivaJetGovernance", () => {
  describe("deployment", () => {
    it("starts with the guardian as authority and no DAO", async () => {
      const { governance, guardian } = await loadFixture(deployFixture);

      expect(await governance.guardian()).to.equal(guardian.address);
      expect(await governance.dao()).to.equal(ZERO);
      expect(await governance.pendingDao()).to.equal(ZERO);
      expect(await governance.authority()).to.equal(guardian.address);
      expect(await governance.daoIsActive()).to.equal(false);
      expect(await governance.daoActivatedAt()).to.equal(0n);
      expect(await governance.handoverDelay()).to.equal(BigInt(HANDOVER_DELAY));
      expect(await governance.isGovernor(guardian.address)).to.equal(true);
      expect(await governance.isGovernor(ZERO)).to.equal(false);
    });

    it("rejects a zero guardian", async () => {
      const Governance = await ethers.getContractFactory("PrivaJetGovernance");

      await expect(Governance.deploy(ZERO, HANDOVER_DELAY)).to.be.revertedWithCustomError(
        Governance,
        "ZeroAddress"
      );
    });

    it("rejects a handover delay outside the allowed range", async () => {
      const Governance = await ethers.getContractFactory("PrivaJetGovernance");
      const [, guardian] = await ethers.getSigners();

      await expect(Governance.deploy(guardian.address, DAY - 1))
        .to.be.revertedWithCustomError(Governance, "DelayOutOfRange")
        .withArgs(DAY - 1);

      await expect(Governance.deploy(guardian.address, 31 * DAY))
        .to.be.revertedWithCustomError(Governance, "DelayOutOfRange")
        .withArgs(31 * DAY);
    });
  });

  describe("proposeDao", () => {
    it("records the proposal and the time it becomes acceptable", async () => {
      const { governance, dao, guardian } = await loadFixture(deployFixture);
      const daoAddress = await dao.getAddress();

      const tx = await governance.connect(guardian).proposeDao(daoAddress);
      const block = await ethers.provider.getBlock(tx.blockNumber!);
      const readyAt = BigInt(block!.timestamp + HANDOVER_DELAY);

      await expect(tx).to.emit(governance, "DaoProposed").withArgs(daoAddress, readyAt);
      expect(await governance.pendingDao()).to.equal(daoAddress);
      expect(await governance.daoHandoverReadyAt()).to.equal(readyAt);
      // Nothing changes hands until the DAO accepts.
      expect(await governance.dao()).to.equal(ZERO);
      expect(await governance.authority()).to.equal(guardian.address);
    });

    it("is restricted to the current authority", async () => {
      const { governance, dao, outsider } = await loadFixture(deployFixture);

      await expect(governance.connect(outsider).proposeDao(await dao.getAddress()))
        .to.be.revertedWithCustomError(governance, "NotAuthority")
        .withArgs(outsider.address);
    });

    it("rejects the zero address and non-contract DAOs", async () => {
      const { governance, guardian, outsider } = await loadFixture(deployFixture);

      await expect(
        governance.connect(guardian).proposeDao(ZERO)
      ).to.be.revertedWithCustomError(governance, "ZeroAddress");

      await expect(governance.connect(guardian).proposeDao(outsider.address))
        .to.be.revertedWithCustomError(governance, "DaoNotAContract")
        .withArgs(outsider.address);
    });

    it("replaces a pending proposal and restarts the delay", async () => {
      const { governance, dao, otherDao, guardian } = await loadFixture(deployFixture);

      await governance.connect(guardian).proposeDao(await dao.getAddress());
      await time.increase(HANDOVER_DELAY);
      await governance.connect(guardian).proposeDao(await otherDao.getAddress());

      expect(await governance.pendingDao()).to.equal(await otherDao.getAddress());

      // The superseded DAO can no longer accept.
      await expect(
        dao.forward(
          await governance.getAddress(),
          0,
          governance.interface.encodeFunctionData("acceptDao")
        )
      ).to.be.revertedWithCustomError(governance, "NotPendingDao");

      // And the new one still has to wait out a fresh delay.
      await expect(
        otherDao.forward(
          await governance.getAddress(),
          0,
          governance.interface.encodeFunctionData("acceptDao")
        )
      ).to.be.revertedWithCustomError(governance, "HandoverNotReady");
    });
  });

  describe("cancelDaoProposal", () => {
    it("clears the pending DAO", async () => {
      const { governance, dao, guardian } = await loadFixture(deployFixture);
      const daoAddress = await dao.getAddress();

      await governance.connect(guardian).proposeDao(daoAddress);

      await expect(governance.connect(guardian).cancelDaoProposal())
        .to.emit(governance, "DaoProposalCancelled")
        .withArgs(daoAddress);

      expect(await governance.pendingDao()).to.equal(ZERO);
      expect(await governance.daoHandoverReadyAt()).to.equal(0n);
    });

    it("reverts when nothing is pending or the caller is not the authority", async () => {
      const { governance, dao, guardian, outsider } = await loadFixture(deployFixture);

      await expect(
        governance.connect(guardian).cancelDaoProposal()
      ).to.be.revertedWithCustomError(governance, "NoPendingDao");

      await governance.connect(guardian).proposeDao(await dao.getAddress());

      await expect(governance.connect(outsider).cancelDaoProposal())
        .to.be.revertedWithCustomError(governance, "NotAuthority")
        .withArgs(outsider.address);
    });
  });

  describe("acceptDao", () => {
    it("reverts before the delay has elapsed", async () => {
      const { governance, dao, guardian } = await loadFixture(deployFixture);

      await governance.connect(guardian).proposeDao(await dao.getAddress());
      await time.increase(HANDOVER_DELAY - 60);

      await expect(
        dao.forward(
          await governance.getAddress(),
          0,
          governance.interface.encodeFunctionData("acceptDao")
        )
      ).to.be.revertedWithCustomError(governance, "HandoverNotReady");
    });

    it("reverts for anyone other than the pending DAO", async () => {
      const { governance, dao, guardian, outsider } = await loadFixture(deployFixture);

      await governance.connect(guardian).proposeDao(await dao.getAddress());
      await time.increase(HANDOVER_DELAY);

      // Not even the guardian can complete the handover on the DAO's behalf.
      await expect(governance.connect(guardian).acceptDao())
        .to.be.revertedWithCustomError(governance, "NotPendingDao")
        .withArgs(guardian.address);

      await expect(governance.connect(outsider).acceptDao())
        .to.be.revertedWithCustomError(governance, "NotPendingDao")
        .withArgs(outsider.address);
    });

    it("reverts when no handover is pending", async () => {
      const { governance, guardian } = await loadFixture(deployFixture);

      await expect(governance.connect(guardian).acceptDao()).to.be.revertedWithCustomError(
        governance,
        "NoPendingDao"
      );
    });

    it("hands authority to the DAO", async () => {
      const { governance, dao, guardian } = await loadFixture(deployFixture);
      const daoAddress = await dao.getAddress();

      await governance.connect(guardian).proposeDao(daoAddress);
      await time.increase(HANDOVER_DELAY);

      await expect(
        dao.forward(
          await governance.getAddress(),
          0,
          governance.interface.encodeFunctionData("acceptDao")
        )
      )
        .to.emit(governance, "DaoActivated")
        .withArgs(ZERO, daoAddress);

      expect(await governance.dao()).to.equal(daoAddress);
      expect(await governance.authority()).to.equal(daoAddress);
      expect(await governance.daoIsActive()).to.equal(true);
      expect(await governance.daoActivatedAt()).to.be.greaterThan(0n);
      expect(await governance.pendingDao()).to.equal(ZERO);
      expect(await governance.daoHandoverReadyAt()).to.equal(0n);
      expect(await governance.isGovernor(daoAddress)).to.equal(true);
      expect(await governance.isGovernor(guardian.address)).to.equal(false);
    });

    it("leaves the guardian without authority once the DAO is live", async () => {
      const { governance, otherDao, target, guardian } = await activateDao();

      await expect(governance.connect(guardian).proposeDao(await otherDao.getAddress()))
        .to.be.revertedWithCustomError(governance, "NotAuthority")
        .withArgs(guardian.address);

      await expect(
        governance
          .connect(guardian)
          .execute(await target.getAddress(), 0, target.interface.encodeFunctionData("setValue", [1]))
      )
        .to.be.revertedWithCustomError(governance, "NotAuthority")
        .withArgs(guardian.address);
    });

    it("supports migrating from one DAO to the next", async () => {
      const { governance, dao, otherDao, guardian } = await activateDao();
      const governanceAddress = await governance.getAddress();
      const daoAddress = await dao.getAddress();
      const otherDaoAddress = await otherDao.getAddress();

      // Only the live DAO can start the migration.
      await expect(
        governance.connect(guardian).proposeDao(otherDaoAddress)
      ).to.be.revertedWithCustomError(governance, "NotAuthority");

      await dao.forward(
        governanceAddress,
        0,
        governance.interface.encodeFunctionData("proposeDao", [otherDaoAddress])
      );
      await time.increase(HANDOVER_DELAY);
      await expect(
        otherDao.forward(
          governanceAddress,
          0,
          governance.interface.encodeFunctionData("acceptDao")
        )
      )
        .to.emit(governance, "DaoActivated")
        .withArgs(daoAddress, otherDaoAddress);

      expect(await governance.authority()).to.equal(otherDaoAddress);
    });

    it("rejects proposing the DAO that is already live", async () => {
      const { governance, dao } = await activateDao();
      const daoAddress = await dao.getAddress();

      await expect(
        dao.forward(
          await governance.getAddress(),
          0,
          governance.interface.encodeFunctionData("proposeDao", [daoAddress])
        )
      ).to.be.revertedWithCustomError(governance, "DaoUnchanged");
    });
  });

  describe("guardian role", () => {
    it("transfers in two steps", async () => {
      const { governance, guardian, newGuardian } = await loadFixture(deployFixture);

      await expect(governance.connect(guardian).transferGuardian(newGuardian.address))
        .to.emit(governance, "GuardianTransferProposed")
        .withArgs(newGuardian.address);

      // Unchanged until accepted.
      expect(await governance.guardian()).to.equal(guardian.address);

      await expect(governance.connect(newGuardian).acceptGuardian())
        .to.emit(governance, "GuardianTransferred")
        .withArgs(guardian.address, newGuardian.address);

      expect(await governance.guardian()).to.equal(newGuardian.address);
      expect(await governance.authority()).to.equal(newGuardian.address);
      expect(await governance.pendingGuardian()).to.equal(ZERO);
    });

    it("guards the transfer entry points", async () => {
      const { governance, guardian, newGuardian, outsider } = await loadFixture(deployFixture);

      await expect(governance.connect(outsider).transferGuardian(outsider.address))
        .to.be.revertedWithCustomError(governance, "NotGuardian")
        .withArgs(outsider.address);

      await expect(
        governance.connect(guardian).transferGuardian(ZERO)
      ).to.be.revertedWithCustomError(governance, "ZeroAddress");

      await expect(
        governance.connect(newGuardian).acceptGuardian()
      ).to.be.revertedWithCustomError(governance, "NoPendingGuardian");

      await governance.connect(guardian).transferGuardian(newGuardian.address);

      await expect(governance.connect(outsider).acceptGuardian())
        .to.be.revertedWithCustomError(governance, "NotPendingGuardian")
        .withArgs(outsider.address);
    });

    it("cancels a pending transfer", async () => {
      const { governance, guardian, newGuardian } = await loadFixture(deployFixture);

      await expect(
        governance.connect(guardian).cancelGuardianTransfer()
      ).to.be.revertedWithCustomError(governance, "NoPendingGuardian");

      await governance.connect(guardian).transferGuardian(newGuardian.address);

      await expect(governance.connect(guardian).cancelGuardianTransfer())
        .to.emit(governance, "GuardianTransferCancelled")
        .withArgs(newGuardian.address);

      await expect(
        governance.connect(newGuardian).acceptGuardian()
      ).to.be.revertedWithCustomError(governance, "NoPendingGuardian");
    });

    it("cannot renounce while it is still the only authority", async () => {
      const { governance, guardian } = await loadFixture(deployFixture);

      await expect(
        governance.connect(guardian).renounceGuardian()
      ).to.be.revertedWithCustomError(governance, "DaoNotActive");
    });

    it("renounces once the DAO is live, leaving DAO-only governance", async () => {
      const { governance, dao, guardian, newGuardian } = await activateDao();

      await governance.connect(guardian).transferGuardian(newGuardian.address);

      await expect(governance.connect(guardian).renounceGuardian())
        .to.emit(governance, "GuardianRenounced")
        .withArgs(guardian.address);

      expect(await governance.guardian()).to.equal(ZERO);
      expect(await governance.pendingGuardian()).to.equal(ZERO);
      expect(await governance.authority()).to.equal(await dao.getAddress());

      // The renounced guardian, and the transfer it had queued, are both dead.
      await expect(governance.connect(guardian).transferGuardian(newGuardian.address))
        .to.be.revertedWithCustomError(governance, "NotGuardian")
        .withArgs(guardian.address);
      await expect(
        governance.connect(newGuardian).acceptGuardian()
      ).to.be.revertedWithCustomError(governance, "NoPendingGuardian");
    });
  });

  describe("execute", () => {
    it("drives an owned contract as the guardian, then as the DAO", async () => {
      const { governance, dao, target, guardian } = await loadFixture(deployFixture);
      const governanceAddress = await governance.getAddress();
      const targetAddress = await target.getAddress();
      const setValue = (n: number) => target.interface.encodeFunctionData("setValue", [n]);

      await expect(governance.connect(guardian).execute(targetAddress, 0, setValue(7))).to.emit(
        governance,
        "CallExecuted"
      );
      expect(await target.value()).to.equal(7n);
      expect(await target.lastCaller()).to.equal(governanceAddress);

      await governance.connect(guardian).proposeDao(await dao.getAddress());
      await time.increase(HANDOVER_DELAY);
      await dao.forward(
        governanceAddress,
        0,
        governance.interface.encodeFunctionData("acceptDao")
      );

      await dao.forward(
        governanceAddress,
        0,
        governance.interface.encodeFunctionData("execute", [targetAddress, 0, setValue(9)])
      );
      expect(await target.value()).to.equal(9n);
      // Calls still originate from governance, so ownership never has to move.
      expect(await target.lastCaller()).to.equal(governanceAddress);
    });

    it("is restricted to the authority and rejects a zero target", async () => {
      const { governance, target, guardian, outsider } = await loadFixture(deployFixture);
      const data = target.interface.encodeFunctionData("setValue", [1]);

      await expect(governance.connect(outsider).execute(await target.getAddress(), 0, data))
        .to.be.revertedWithCustomError(governance, "NotAuthority")
        .withArgs(outsider.address);

      await expect(
        governance.connect(guardian).execute(ZERO, 0, data)
      ).to.be.revertedWithCustomError(governance, "ZeroAddress");
    });

    it("bubbles up the target's revert reason", async () => {
      const { governance, target, guardian } = await loadFixture(deployFixture);
      const targetAddress = await target.getAddress();

      await expect(
        governance
          .connect(guardian)
          .execute(targetAddress, 0, target.interface.encodeFunctionData("boom"))
      ).to.be.revertedWith("MockTarget: boom");

      await expect(
        governance
          .connect(guardian)
          .execute(targetAddress, 0, target.interface.encodeFunctionData("boomSilently"))
      ).to.be.revertedWith("PrivaJetGovernance: call reverted");
    });

    it("forwards ETH held by governance", async () => {
      const { governance, target, guardian, deployer } = await loadFixture(deployFixture);
      const governanceAddress = await governance.getAddress();
      const targetAddress = await target.getAddress();

      await expect(
        deployer.sendTransaction({ to: governanceAddress, value: ethers.parseEther("1") })
      )
        .to.emit(governance, "EtherReceived")
        .withArgs(deployer.address, ethers.parseEther("1"));

      await expect(
        governance.connect(guardian).execute(targetAddress, ethers.parseEther("0.25"), "0x")
      ).to.changeEtherBalances(
        [governanceAddress, targetAddress],
        [-ethers.parseEther("0.25"), ethers.parseEther("0.25")]
      );
    });
  });

  describe("executeBatch", () => {
    it("runs the calls in order", async () => {
      const { governance, target, guardian } = await loadFixture(deployFixture);
      const targetAddress = await target.getAddress();

      await governance.connect(guardian).executeBatch([
        { target: targetAddress, value: 0, data: target.interface.encodeFunctionData("setValue", [1]) },
        { target: targetAddress, value: 0, data: target.interface.encodeFunctionData("setValue", [2]) },
      ]);

      expect(await target.value()).to.equal(2n);
    });

    it("reverts the whole batch when one call fails", async () => {
      const { governance, target, guardian } = await loadFixture(deployFixture);
      const targetAddress = await target.getAddress();

      await expect(
        governance.connect(guardian).executeBatch([
          {
            target: targetAddress,
            value: 0,
            data: target.interface.encodeFunctionData("setValue", [42]),
          },
          { target: targetAddress, value: 0, data: target.interface.encodeFunctionData("boom") },
        ])
      ).to.be.revertedWith("MockTarget: boom");

      expect(await target.value()).to.equal(0n);
    });

    it("rejects an empty batch and non-authority callers", async () => {
      const { governance, guardian, outsider } = await loadFixture(deployFixture);

      await expect(
        governance.connect(guardian).executeBatch([])
      ).to.be.revertedWithCustomError(governance, "EmptyBatch");

      await expect(governance.connect(outsider).executeBatch([]))
        .to.be.revertedWithCustomError(governance, "NotAuthority")
        .withArgs(outsider.address);
    });
  });

  describe("Governed", () => {
    it("follows the authority across the handover without being redeployed", async () => {
      const { governance, governed, dao, guardian, outsider } = await loadFixture(deployFixture);
      const governanceAddress = await governance.getAddress();

      expect(await governed.governance()).to.equal(governanceAddress);

      await governed.connect(guardian).setValue(1);
      expect(await governed.value()).to.equal(1n);

      await expect(governed.connect(outsider).setValue(2))
        .to.be.revertedWithCustomError(governed, "NotGovernance")
        .withArgs(outsider.address);

      await governance.connect(guardian).proposeDao(await dao.getAddress());
      await time.increase(HANDOVER_DELAY);
      await dao.forward(
        governanceAddress,
        0,
        governance.interface.encodeFunctionData("acceptDao")
      );

      // Same contract, same address — the DAO now governs it.
      await dao.forward(
        await governed.getAddress(),
        0,
        governed.interface.encodeFunctionData("setValue", [3])
      );
      expect(await governed.value()).to.equal(3n);

      await expect(governed.connect(guardian).setValue(4))
        .to.be.revertedWithCustomError(governed, "NotGovernance")
        .withArgs(guardian.address);
    });

    it("rejects a zero governance address", async () => {
      const Governed = await ethers.getContractFactory("MockGoverned");

      await expect(Governed.deploy(ZERO)).to.be.revertedWithCustomError(Governed, "ZeroAddress");
    });
  });
});
