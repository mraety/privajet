import { WalletState } from "../App";

interface Props {
  walletState: WalletState | null;
  onConnect: () => void;
  onDisconnect: () => void;
}

export default function Header({ walletState, onConnect, onDisconnect }: Props) {
  return (
    <header style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "0 24px", height: 60,
      background: "var(--surface)",
      borderBottom: "1px solid var(--border)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 22 }}>🔒</span>
        <span style={{ fontWeight: 700, fontSize: 17, letterSpacing: "-0.3px" }}>PrivaJet</span>
        <span style={{
          background: "var(--accent-dim)", color: "var(--accent)",
          borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 600,
        }}>WALLET</span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {walletState && (
          <span style={{
            background: "var(--surface2)", border: "1px solid var(--border)",
            borderRadius: 8, padding: "5px 12px", fontSize: 13, color: "var(--muted)",
          }}>
            <span style={{ color: "var(--green)", marginRight: 6 }}>●</span>
            {walletState.chainName}
          </span>
        )}

        {walletState ? (
          <button
            onClick={onDisconnect}
            style={{
              background: "var(--surface2)", border: "1px solid var(--border)",
              color: "var(--text)", borderRadius: 8, padding: "5px 14px",
              fontSize: 13, fontWeight: 500,
            }}
          >
            {walletState.address.slice(0, 6)}…{walletState.address.slice(-4)}
          </button>
        ) : (
          <button
            onClick={onConnect}
            style={{
              background: "var(--accent)", color: "#fff", border: "none",
              borderRadius: 8, padding: "6px 18px", fontSize: 14, fontWeight: 600,
            }}
          >
            Connect
          </button>
        )}
      </div>
    </header>
  );
}
