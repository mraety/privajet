import { useState } from "react";
import { BrowserProvider, Contract, ethers } from "ethers";
import { WALLET_ABI } from "../abi/PrivaJetWallet";
import { ERC20_ABI } from "../abi/ERC20";
import { CONTRACTS } from "../config";
import { WalletState } from "../App";

type Tab = "deposit" | "withdraw" | "transfer" | "shield" | "unshield";

interface Props {
  state: WalletState;
  txPending: boolean;
  provider: BrowserProvider;
  onAction: (
    action: (signer: ethers.Signer) => Promise<ethers.TransactionResponse>,
    pendingMsg: string
  ) => void;
}

export default function ActionPanel({ state, txPending, provider, onAction }: Props) {
  const [tab, setTab] = useState<Tab>("deposit");

  const tabs: { id: Tab; label: string; privacy?: boolean }[] = [
    { id: "deposit", label: "Deposit" },
    { id: "withdraw", label: "Withdraw" },
    { id: "transfer", label: "Transfer" },
    { id: "shield", label: "Shield", privacy: true },
    { id: "unshield", label: "Unshield", privacy: true },
  ];

  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--border)",
      borderRadius: "var(--radius)", overflow: "hidden",
    }}>
      {/* Tab bar */}
      <div style={{
        display: "flex", borderBottom: "1px solid var(--border)",
        overflowX: "auto",
      }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              flex: 1, padding: "13px 0", border: "none",
              background: tab === t.id ? "var(--surface2)" : "transparent",
              color: tab === t.id ? "var(--text)" : "var(--muted)",
              fontWeight: tab === t.id ? 600 : 400,
              fontSize: 14,
              borderBottom: tab === t.id ? "2px solid var(--accent)" : "2px solid transparent",
              cursor: "pointer",
              whiteSpace: "nowrap",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            }}
          >
            {t.privacy && <span style={{ fontSize: 11 }}>🔒</span>}
            {t.label}
          </button>
        ))}
      </div>

      {/* Panel body */}
      <div style={{ padding: "28px 28px 32px" }}>
        {tab === "deposit" && (
          <DepositForm state={state} txPending={txPending} provider={provider} onAction={onAction} />
        )}
        {tab === "withdraw" && (
          <WithdrawForm state={state} txPending={txPending} onAction={onAction} />
        )}
        {tab === "transfer" && (
          <TransferForm state={state} txPending={txPending} onAction={onAction} />
        )}
        {tab === "shield" && (
          <ShieldForm state={state} txPending={txPending} onAction={onAction} />
        )}
        {tab === "unshield" && (
          <UnshieldForm state={state} txPending={txPending} onAction={onAction} />
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Deposit
// ──────────────────────────────────────────────────────────────────────────────
function DepositForm({ state, txPending, provider, onAction }: Props) {
  const [amount, setAmount] = useState("");

  const submit = async () => {
    const parsed = parse(amount);
    if (!parsed) return;
    onAction(async (signer) => {
      const token = new Contract(CONTRACTS.token, ERC20_ABI, signer);
      const wallet = new Contract(CONTRACTS.wallet, WALLET_ABI, signer);
      const allowance = await token.allowance(await signer.getAddress(), CONTRACTS.wallet);
      if (allowance < parsed) {
        const approveTx = await token.approve(CONTRACTS.wallet, ethers.MaxUint256);
        await approveTx.wait();
      }
      return wallet.deposit(parsed);
    }, `Depositing ${amount} PRIVA…`);
  };

  return (
    <Form
      title="Deposit PRIVA"
      desc="Move PRIVA from your Ethereum wallet into the PrivaJet wallet contract."
      disabled={txPending || state.paused}
      onSubmit={submit}
    >
      <AmountInput value={amount} onChange={setAmount} max={state.privaBalance} label="Amount" />
      <SubmitBtn label="Deposit" disabled={txPending || !amount || state.paused} />
    </Form>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Withdraw
// ──────────────────────────────────────────────────────────────────────────────
function WithdrawForm({ state, txPending, onAction }: Omit<Props, "provider">) {
  const [amount, setAmount] = useState("");

  const submit = () => {
    const parsed = parse(amount);
    if (!parsed) return;
    onAction(async (signer) => {
      const wallet = new Contract(CONTRACTS.wallet, WALLET_ABI, signer);
      return wallet.withdraw(parsed);
    }, `Withdrawing ${amount} PRIVA…`);
  };

  return (
    <Form
      title="Withdraw PRIVA"
      desc="Return PRIVA from the wallet contract back to your Ethereum wallet."
      disabled={txPending || state.paused}
      onSubmit={submit}
    >
      <AmountInput value={amount} onChange={setAmount} max={state.walletBalance} label="Amount" />
      <SubmitBtn label="Withdraw" disabled={txPending || !amount || state.paused} />
    </Form>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Transfer
// ──────────────────────────────────────────────────────────────────────────────
function TransferForm({ state, txPending, onAction }: Omit<Props, "provider">) {
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");

  const submit = () => {
    const parsed = parse(amount);
    if (!parsed || !ethers.isAddress(to)) return;
    onAction(async (signer) => {
      const wallet = new Contract(CONTRACTS.wallet, WALLET_ABI, signer);
      return wallet.transfer(to, parsed);
    }, `Transferring ${amount} PRIVA to ${to.slice(0, 8)}…`);
  };

  return (
    <Form
      title="Transfer PRIVA"
      desc="Send PRIVA to another address without moving tokens on-chain — instant and gas-efficient."
      disabled={txPending || state.paused}
      onSubmit={submit}
    >
      <Field label="Recipient address">
        <TextInput
          value={to}
          onChange={setTo}
          placeholder="0x…"
          invalid={to.length > 0 && !ethers.isAddress(to)}
        />
      </Field>
      <AmountInput value={amount} onChange={setAmount} max={state.walletBalance} label="Amount" />
      <SubmitBtn
        label="Transfer"
        disabled={txPending || !amount || !ethers.isAddress(to) || state.paused}
      />
    </Form>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Shield
// ──────────────────────────────────────────────────────────────────────────────
function ShieldForm({ state, txPending, onAction }: Omit<Props, "provider">) {
  const [amount, setAmount] = useState("");
  const [secret, setSecret] = useState("");

  const submit = () => {
    const parsed = parse(amount);
    if (!parsed || !secret) return;
    const commitment = ethers.keccak256(ethers.toUtf8Bytes(secret));
    onAction(async (signer) => {
      const wallet = new Contract(CONTRACTS.wallet, WALLET_ABI, signer);
      return wallet.shield(parsed, commitment);
    }, `Shielding ${amount} PRIVA…`);
  };

  if (!state.poolConfigured) {
    return (
      <PrivacyGate
        title="Shield PRIVA"
        message="ShieldedPool not yet configured on this contract. The pool will be wired by the owner when the V2 privacy module is deployed."
      />
    );
  }

  return (
    <Form
      title="Shield PRIVA 🔒"
      desc={
        <>
          Move PRIVA into the ShieldedPool under a cryptographic commitment.
          <br />
          <span style={{ color: "var(--yellow)", fontSize: 12 }}>
            ⚠ ZK withdrawals are gated until the V3 verifier goes live.
          </span>
        </>
      }
      disabled={txPending || state.paused}
      onSubmit={submit}
    >
      <AmountInput value={amount} onChange={setAmount} max={state.walletBalance} label="Amount" />
      <Field label="Note secret (your passphrase for this note — keep it safe)">
        <TextInput
          value={secret}
          onChange={setSecret}
          placeholder="a long random secret…"
          type="password"
        />
      </Field>
      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: -6 }}>
        Commitment = keccak256(secret). Save the secret to unshield later.
      </div>
      <SubmitBtn label="Shield" disabled={txPending || !amount || !secret || state.paused} />
    </Form>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Unshield
// ──────────────────────────────────────────────────────────────────────────────
function UnshieldForm({ state }: Omit<Props, "provider">) {
  return (
    <PrivacyGate
      title="Unshield PRIVA 🔒"
      message={
        state.poolConfigured
          ? "ZK proof verification is handled by VerifierStub — unshielding is blocked until the V3 Groth16/PLONK verifier is deployed by the multisig."
          : "ShieldedPool not yet configured on this contract."
      }
      comingSoon
    />
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Shared primitives
// ──────────────────────────────────────────────────────────────────────────────

function Form({
  title, desc, children, disabled, onSubmit,
}: {
  title: string;
  desc: React.ReactNode;
  children: React.ReactNode;
  disabled: boolean;
  onSubmit: () => void;
}) {
  return (
    <div>
      <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 6 }}>{title}</h3>
      <p style={{ color: "var(--muted)", fontSize: 13, marginBottom: 22 }}>{desc}</p>
      <form
        onSubmit={(e) => { e.preventDefault(); if (!disabled) onSubmit(); }}
        style={{ display: "flex", flexDirection: "column", gap: 16 }}
      >
        {children}
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={{ fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".08em" }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function AmountInput({ value, onChange, max, label }: { value: string; onChange: (v: string) => void; max: bigint; label: string }) {
  return (
    <Field label={label}>
      <div style={{ position: "relative" }}>
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0.0"
          min="0"
          step="any"
          style={inputStyle}
        />
        <button
          type="button"
          onClick={() => onChange(ethers.formatEther(max))}
          style={{
            position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
            background: "var(--accent-dim)", color: "var(--accent)",
            border: "none", borderRadius: 5, padding: "3px 9px", fontSize: 11, fontWeight: 700,
          }}
        >
          MAX
        </button>
      </div>
      <div style={{ fontSize: 11, color: "var(--muted)" }}>
        Available: {ethers.formatEther(max)} PRIVA
      </div>
    </Field>
  );
}

function TextInput({ value, onChange, placeholder, invalid, type = "text" }: {
  value: string; onChange: (v: string) => void; placeholder?: string; invalid?: boolean; type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{ ...inputStyle, borderColor: invalid ? "var(--red)" : undefined }}
    />
  );
}

function SubmitBtn({ label, disabled }: { label: string; disabled: boolean }) {
  return (
    <button
      type="submit"
      disabled={disabled}
      style={{
        background: disabled ? "var(--surface2)" : "var(--accent)",
        color: disabled ? "var(--muted)" : "#fff",
        border: "1px solid " + (disabled ? "var(--border)" : "var(--accent)"),
        borderRadius: 8, padding: "12px", fontSize: 15, fontWeight: 600,
        cursor: disabled ? "default" : "pointer",
        transition: "background .15s",
      }}
    >
      {label}
    </button>
  );
}

function PrivacyGate({ title, message, comingSoon }: { title: string; message: string; comingSoon?: boolean }) {
  return (
    <div>
      <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 14 }}>{title}</h3>
      <div style={{
        background: "var(--surface2)", border: "1px solid var(--border)",
        borderRadius: 10, padding: "24px", textAlign: "center",
        display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
      }}>
        <span style={{ fontSize: 36 }}>🔒</span>
        <p style={{ color: "var(--muted)", fontSize: 13, maxWidth: 400 }}>{message}</p>
        {comingSoon && (
          <span style={{
            background: "var(--accent-dim)", color: "var(--accent)",
            borderRadius: 6, padding: "3px 10px", fontSize: 11, fontWeight: 700,
          }}>
            Coming in V3
          </span>
        )}
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--surface2)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  color: "var(--text)",
  fontSize: 15,
  padding: "10px 14px",
  outline: "none",
};

function parse(value: string): bigint | null {
  try {
    const v = ethers.parseEther(value);
    return v > 0n ? v : null;
  } catch {
    return null;
  }
}
