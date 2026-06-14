import { useState } from "react";
import { ethers, Contract } from "ethers";
import { WALLET_ABI } from "../abi/PrivaJetWallet";
import { ERC20_ABI } from "../abi/ERC20";
import { CONTRACTS } from "../config";
import { Balances, WalletInfo } from "../App";
import { inputStyle, primaryBtn } from "./WelcomeScreen";

type Tab = "send" | "deposit" | "withdraw" | "transfer" | "shield";

interface Props {
  balances: Balances;
  walletInfo: WalletInfo;
  txPending: boolean;
  onAction: (
    fn: (signer: ethers.HDNodeWallet | ethers.Wallet) => Promise<ethers.TransactionResponse>,
    msg: string
  ) => void;
}

type ActionFn = (signer: ethers.HDNodeWallet | ethers.Wallet) => Promise<ethers.TransactionResponse>;

export default function ActionPanel({ balances, walletInfo, txPending, onAction }: Props) {
  const [tab, setTab] = useState<Tab>("send");

  const tabs: { id: Tab; label: string; icon?: string }[] = [
    { id: "send",     label: "Send",     icon: "↗" },
    { id: "deposit",  label: "Deposit",  icon: "⬇" },
    { id: "withdraw", label: "Withdraw", icon: "⬆" },
    { id: "transfer", label: "Internal", icon: "⇄" },
    { id: "shield",   label: "Shield",   icon: "🔒" },
  ];

  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--border)",
      borderRadius: "var(--radius)", overflow: "hidden",
    }}>
      <div style={{ display: "flex", borderBottom: "1px solid var(--border)" }}>
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            flex: 1, padding: "12px 0", border: "none",
            background: tab === t.id ? "var(--surface2)" : "transparent",
            color: tab === t.id ? "var(--text)" : "var(--muted)",
            fontWeight: tab === t.id ? 600 : 400, fontSize: 13,
            borderBottom: `2px solid ${tab === t.id ? "var(--accent)" : "transparent"}`,
            cursor: "pointer",
          }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <div style={{ padding: "28px" }}>
        {tab === "send"     && <SendForm     balances={balances} txPending={txPending} walletInfo={walletInfo} onAction={onAction} />}
        {tab === "deposit"  && <DepositForm  balances={balances} txPending={txPending} walletInfo={walletInfo} onAction={onAction} />}
        {tab === "withdraw" && <WithdrawForm balances={balances} txPending={txPending} onAction={onAction} />}
        {tab === "transfer" && <TransferForm balances={balances} txPending={txPending} onAction={onAction} />}
        {tab === "shield"   && <ShieldForm   balances={balances} txPending={txPending} onAction={onAction} />}
      </div>
    </div>
  );
}

// ── Send (standard ERC-20 transfer to any address) ─────────────────────────
function SendForm({ balances, txPending, onAction }: Props) {
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");

  const submit = () => {
    const parsed = parse(amount);
    if (!parsed || !ethers.isAddress(to)) return;
    onAction(async (signer) => {
      const token = new Contract(CONTRACTS.token, ERC20_ABI, signer);
      return token.transfer(to, parsed);
    }, `Sending ${amount} PRIVA to ${to.slice(0, 8)}…`);
  };

  return (
    <Form title="Send PRIVA" desc="Standard ERC-20 transfer directly from your address." onSubmit={submit}>
      <Field label="Recipient">
        <input type="text" value={to} onChange={e => setTo(e.target.value)}
          placeholder="0x…" style={{ ...inputStyle, borderColor: to && !ethers.isAddress(to) ? "var(--red)" : undefined }} />
      </Field>
      <AmountField value={amount} onChange={setAmount} max={balances.priva} label="Amount (from wallet)" />
      <Btn label="Send" disabled={txPending || !parse(amount) || !ethers.isAddress(to)} />
    </Form>
  );
}

// ── Deposit into contract ───────────────────────────────────────────────────
function DepositForm({ balances, txPending, walletInfo, onAction }: Props) {
  const [amount, setAmount] = useState("");

  const submit = () => {
    const parsed = parse(amount);
    if (!parsed) return;
    onAction(async (signer) => {
      const token = new Contract(CONTRACTS.token, ERC20_ABI, signer);
      const wallet = new Contract(CONTRACTS.wallet, WALLET_ABI, signer);
      const allowance: bigint = await token.allowance(walletInfo.address, CONTRACTS.wallet);
      if (allowance < parsed) {
        const approveTx = await token.approve(CONTRACTS.wallet, ethers.MaxUint256);
        await approveTx.wait();
      }
      return wallet.deposit(parsed);
    }, `Depositing ${amount} PRIVA…`);
  };

  return (
    <Form title="Deposit to Contract" desc="Move PRIVA into the PrivaJetWallet contract for internal transfers and shielding." onSubmit={submit}>
      <AmountField value={amount} onChange={setAmount} max={balances.priva} label="Amount" />
      <Btn label="Deposit" disabled={txPending || !parse(amount) || balances.paused} />
    </Form>
  );
}

// ── Withdraw from contract ─────────────────────────────────────────────────
function WithdrawForm({ balances, txPending, onAction }: Omit<Props, "walletInfo">) {
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
    <Form title="Withdraw from Contract" desc="Return PRIVA from the wallet contract back to your address." onSubmit={submit}>
      <AmountField value={amount} onChange={setAmount} max={balances.walletContract} label="Amount" />
      <Btn label="Withdraw" disabled={txPending || !parse(amount) || balances.paused} />
    </Form>
  );
}

// ── Internal transfer (contract-to-contract) ───────────────────────────────
function TransferForm({ balances, txPending, onAction }: Omit<Props, "walletInfo">) {
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");

  const submit = () => {
    const parsed = parse(amount);
    if (!parsed || !ethers.isAddress(to)) return;
    onAction(async (signer) => {
      const wallet = new Contract(CONTRACTS.wallet, WALLET_ABI, signer);
      return wallet.transfer(to, parsed);
    }, `Transferring ${amount} PRIVA internally…`);
  };

  return (
    <Form title="Internal Transfer" desc="Move deposited PRIVA to another wallet user — no ERC-20 event emitted, gas-efficient." onSubmit={submit}>
      <Field label="Recipient address">
        <input type="text" value={to} onChange={e => setTo(e.target.value)}
          placeholder="0x…" style={{ ...inputStyle, borderColor: to && !ethers.isAddress(to) ? "var(--red)" : undefined }} />
      </Field>
      <AmountField value={amount} onChange={setAmount} max={balances.walletContract} label="Amount (from deposited balance)" />
      <Btn label="Transfer" disabled={txPending || !parse(amount) || !ethers.isAddress(to) || balances.paused} />
    </Form>
  );
}

// ── Shield ─────────────────────────────────────────────────────────────────
function ShieldForm({ balances, txPending, onAction }: Omit<Props, "walletInfo">) {
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

  if (!balances.poolConfigured) {
    return (
      <div>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Shield PRIVA 🔒</h3>
        <div style={{
          background: "var(--surface2)", border: "1px solid var(--border)",
          borderRadius: 10, padding: 24, textAlign: "center", color: "var(--muted)", fontSize: 13,
        }}>
          ShieldedPool not yet configured. Available in V2.
        </div>
      </div>
    );
  }

  return (
    <Form title="Shield PRIVA 🔒" desc="Move deposited PRIVA into the ShieldedPool under a cryptographic commitment. ZK withdrawals live in V3." onSubmit={submit}>
      <AmountField value={amount} onChange={setAmount} max={balances.walletContract} label="Amount" />
      <Field label="Note secret — save this to unshield later">
        <input type="password" value={secret} onChange={e => setSecret(e.target.value)}
          placeholder="a long random passphrase…" style={inputStyle} />
      </Field>
      <Btn label="Shield" disabled={txPending || !parse(amount) || !secret || balances.paused} />
    </Form>
  );
}

// ── Primitives ─────────────────────────────────────────────────────────────

function Form({ title, desc, children, onSubmit }: {
  title: string; desc: string; children: React.ReactNode; onSubmit: () => void;
}) {
  return (
    <div>
      <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{title}</h3>
      <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 20 }}>{desc}</p>
      <form onSubmit={e => { e.preventDefault(); onSubmit(); }}
        style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {children}
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <label style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".08em" }}>{label}</label>
      {children}
    </div>
  );
}

function AmountField({ value, onChange, max, label }: {
  value: string; onChange: (v: string) => void; max: bigint; label: string;
}) {
  return (
    <Field label={label}>
      <div style={{ position: "relative" }}>
        <input type="number" value={value} onChange={e => onChange(e.target.value)}
          placeholder="0.0" min="0" step="any" style={inputStyle} />
        <button type="button" onClick={() => onChange(ethers.formatEther(max))} style={{
          position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
          background: "var(--accent-dim)", color: "var(--accent)",
          border: "none", borderRadius: 5, padding: "3px 8px", fontSize: 10, fontWeight: 700, cursor: "pointer",
        }}>MAX</button>
      </div>
      <div style={{ fontSize: 11, color: "var(--muted)" }}>Available: {ethers.formatEther(max)} PRIVA</div>
    </Field>
  );
}

function Btn({ label, disabled }: { label: string; disabled: boolean }) {
  return (
    <button type="submit" disabled={disabled} style={{
      ...primaryBtn,
      background: disabled ? "var(--surface2)" : "var(--accent)",
      color: disabled ? "var(--muted)" : "#fff",
      border: `1px solid ${disabled ? "var(--border)" : "var(--accent)"}`,
      width: "100%",
    }}>{label}</button>
  );
}

function parse(v: string): bigint | null {
  try { const n = ethers.parseEther(v); return n > 0n ? n : null; }
  catch { return null; }
}
