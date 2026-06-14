import { useState } from "react";
import { WalletInfo } from "../App";
import { NETWORK_NAMES } from "../config";

interface Props {
  walletInfo: WalletInfo;
  onLock: () => void;
  onRefresh: () => void;
}

export default function Header({ walletInfo, onLock, onRefresh }: Props) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(walletInfo.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const netName = NETWORK_NAMES[walletInfo.network as keyof typeof NETWORK_NAMES] ?? walletInfo.network;

  return (
    <header style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "0 24px", height: 60,
      background: "var(--surface)", borderBottom: "1px solid var(--border)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 22 }}>🔒</span>
        <span style={{ fontWeight: 700, fontSize: 17 }}>PrivaJet</span>
        <span style={{
          background: "var(--accent-dim)", color: "var(--accent)",
          borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 600,
        }}>WALLET</span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{
          background: "var(--surface2)", border: "1px solid var(--border)",
          borderRadius: 8, padding: "4px 12px", fontSize: 12, color: "var(--muted)",
        }}>
          <span style={{ color: "var(--green)", marginRight: 5 }}>●</span>{netName}
        </span>

        <button onClick={copy} title="Copy address" style={{
          background: "var(--surface2)", border: "1px solid var(--border)",
          color: copied ? "var(--green)" : "var(--text)",
          borderRadius: 8, padding: "5px 12px", fontSize: 12, fontWeight: 500, cursor: "pointer",
        }}>
          {copied ? "Copied!" : `${walletInfo.address.slice(0, 6)}…${walletInfo.address.slice(-4)}`}
        </button>

        <button onClick={onRefresh} title="Refresh balances" style={iconBtn}>⟳</button>

        <button onClick={onLock} title="Lock wallet" style={iconBtn}>🔒</button>
      </div>
    </header>
  );
}

const iconBtn: React.CSSProperties = {
  background: "var(--surface2)", border: "1px solid var(--border)",
  color: "var(--muted)", borderRadius: 8, padding: "5px 10px",
  fontSize: 14, cursor: "pointer",
};
