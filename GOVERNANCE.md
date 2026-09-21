# PrivaJet governance

`PrivaJetGovernance` is the permanent governance root of the protocol. It exists
so the DAO address can be set **later**, without redeploying or re-owning any
protocol contract.

## Shape

```
guardian multisig ──┐
                    ├──> PrivaJetGovernance ──> PrivaJetToken proxy
DAO (set later) ────┘        (authority)        VestingManager
                                                ShieldedPool
```

- `authority()` returns the DAO once it is live, the guardian before that.
- Protocol contracts are owned by, or read `authority()` from, the governance
  contract — they never need to know the DAO address.
- Handover is one-way. A live DAO may hand over to a successor DAO; it can never
  fall back to the guardian.

## Deploy

```cmd
set GUARDIAN_ADDRESS=0xYourTreasuryMultisig
set HANDOVER_DELAY=604800
npm run deploy:governance:mainnet
```

`HANDOVER_DELAY` is the time a DAO handover must sit before it can be accepted.
It is fixed at deployment and must be between 1 and 30 days.

Then point the protocol at governance, e.g. transfer ownership of the token
proxy, `VestingManager` and `ShieldedPool` to the governance address.

## Operating before the DAO exists

The guardian multisig drives everything through governance:

```solidity
governance.execute(pool, 0, abi.encodeCall(ShieldedPool.setVerifier, (verifier)));
```

`executeBatch` runs several calls atomically. Target reverts are bubbled up, so a
failed governance action reports the target's own reason.

## Setting the DAO address

1. **Propose** — the guardian calls `proposeDao(dao)`. The DAO must be a deployed
   contract; an EOA is rejected, because a mistyped address would brick
   governance permanently.
2. **Wait** — the proposal matures after `handoverDelay`. Until then nothing has
   changed and the guardian can `cancelDaoProposal()`.
3. **Accept** — the DAO itself calls `acceptDao()`. Nobody can accept on its
   behalf, so the handover doubles as proof that the address is controllable.

From that moment `authority()` is the DAO, and the guardian has no powers left
beyond `renounceGuardian()`.

4. **Renounce** (optional, final) — the guardian calls `renounceGuardian()` to
   step down permanently. Only possible once the DAO is live, so the protocol is
   never left without an authority.

## Gating your own contracts

Non-upgradeable contracts can inherit `Governed`:

```solidity
contract ShieldedPool is Governed {
    constructor(address governance_) Governed(governance_) {}

    function setVerifier(address verifier) external onlyGovernance { ... }
}
```

The governance address is fixed at construction; the authority behind it is
resolved on every call. Contracts behind a proxy should store the governance
address in an initializer instead — `immutable` values live in the
implementation's bytecode, not in proxy storage.
