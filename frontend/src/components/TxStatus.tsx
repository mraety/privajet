import { TxState } from "../App";

export default function TxStatus({ tx, onDismiss }: { tx: TxState; onDismiss: () => void }) {
  if (tx.status === "idle") return null;

  const colors = {
    pending: { bg: "#1a1a2e", border: "#3d3d7a", text: "#a0a0ff" },
    success: { bg: "#0d2218", border: "#1a5c38", text: "#22c55e" },
    error: { bg: "#2a1515", border: "#5a2020", text: "#ff7070" },
  }[tx.status];

  return (
    <div style={{
      marginTop: 20,
      background: colors.bg, border: `1px solid ${colors.border}`,
      borderRadius: "var(--radius)", padding: "14px 18px",
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1 }}>
        {tx.status === "pending" && (
          <span style={{ display: "inline-block", animation: "spin 1s linear infinite", fontSize: 16 }}>⟳</span>
        )}
        {tx.status === "success" && <span>✓</span>}
        {tx.status === "error" && <span>✕</span>}
        <div>
          <div style={{ color: colors.text, fontWeight: 600, fontSize: 13 }}>
            {tx.status === "pending" ? "Transaction pending" : tx.status === "success" ? "Success" : "Error"}
          </div>
          <div style={{ color: colors.text, opacity: 0.8, fontSize: 12, marginTop: 2 }}>
            {tx.msg}
          </div>
          {tx.status === "success" && tx.hash && (
            <div style={{ fontSize: 11, marginTop: 4, opacity: 0.6 }}>
              Tx: {tx.hash.slice(0, 20)}…
            </div>
          )}
        </div>
      </div>
      {tx.status !== "pending" && (
        <button
          onClick={onDismiss}
          style={{
            background: "none", border: "none", color: colors.text,
            opacity: 0.6, fontSize: 18, cursor: "pointer", lineHeight: 1,
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}
