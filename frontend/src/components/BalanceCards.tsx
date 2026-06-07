import { ethers } from "ethers";
import { WalletState } from "../App";

export default function BalanceCards({ state }: { state: WalletState }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 28 }}>
      <Card
        label="PRIVA Balance"
        sublabel="In your Ethereum wallet"
        value={fmt(state.privaBalance)}
        unit="PRIVA"
        color="var(--accent)"
      />
      <Card
        label="Wallet Balance"
        sublabel="Deposited in PrivaJetWallet"
        value={fmt(state.walletBalance)}
        unit="PRIVA"
        color="var(--green)"
        badge={state.paused ? { text: "PAUSED", color: "var(--red)" } : undefined}
      />
    </div>
  );
}

function Card({
  label, sublabel, value, unit, color, badge,
}: {
  label: string;
  sublabel: string;
  value: string;
  unit: string;
  color: string;
  badge?: { text: string; color: string };
}) {
  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--border)",
      borderRadius: "var(--radius)", padding: "20px 22px",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".08em" }}>
            {label}
          </div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{sublabel}</div>
        </div>
        {badge && (
          <span style={{
            background: badge.color + "22", color: badge.color,
            borderRadius: 5, padding: "2px 7px", fontSize: 10, fontWeight: 700,
          }}>
            {badge.text}
          </span>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span style={{ fontSize: 28, fontWeight: 700, color }}>{value}</span>
        <span style={{ fontSize: 13, color: "var(--muted)" }}>{unit}</span>
      </div>
    </div>
  );
}

function fmt(v: bigint): string {
  const s = ethers.formatEther(v);
  const n = parseFloat(s);
  if (n === 0) return "0";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(2) + "K";
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
}
