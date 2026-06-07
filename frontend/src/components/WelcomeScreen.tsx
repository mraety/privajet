import { useState } from "react";
import { ethers } from "ethers";
import { RPC_URLS, NETWORK_NAMES } from "../config";

type Screen = "home" | "create-show" | "create-confirm" | "import";

interface Props {
  onUnlock: (signer: ethers.HDNodeWallet | ethers.Wallet, network: keyof typeof RPC_URLS) => void;
  defaultNetwork: keyof typeof RPC_URLS;
}

export default function WelcomeScreen({ onUnlock, defaultNetwork }: Props) {
  const [screen, setScreen] = useState<Screen>("home");
  const [network, setNetwork] = useState<keyof typeof RPC_URLS>(defaultNetwork);
  const [generated, setGenerated] = useState("");
  const [confirmWord, setConfirmWord] = useState("");
  const [confirmIdx, setConfirmIdx] = useState(0);
  const [confirmError, setConfirmError] = useState("");
  const [importPhrase, setImportPhrase] = useState("");
  const [importError, setImportError] = useState("");
  const [revealed, setRevealed] = useState(false);

  // ── Create ──────────────────────────────────────────────────────────────

  const startCreate = () => {
    const wallet = ethers.Wallet.createRandom();
    const phrase = wallet.mnemonic!.phrase;
    setGenerated(phrase);
    const words = phrase.split(" ");
    setConfirmIdx(Math.floor(Math.random() * words.length));
    setConfirmWord("");
    setConfirmError("");
    setRevealed(false);
    setScreen("create-show");
  };

  const proceedToConfirm = () => {
    setScreen("create-confirm");
  };

  const finishCreate = () => {
    const words = generated.split(" ");
    if (confirmWord.trim().toLowerCase() !== words[confirmIdx]) {
      setConfirmError("Wrong word. Check your backup and try again.");
      return;
    }
    const wallet = ethers.Wallet.fromPhrase(generated);
    onUnlock(wallet, network);
  };

  // ── Import ───────────────────────────────────────────────────────────────

  const doImport = () => {
    const phrase = importPhrase.trim().toLowerCase();
    const wordCount = phrase.split(/\s+/).filter(Boolean).length;
    if (wordCount !== 12 && wordCount !== 24) {
      setImportError("Seed phrase must be 12 or 24 words.");
      return;
    }
    try {
      const wallet = ethers.Wallet.fromPhrase(phrase);
      onUnlock(wallet, network);
    } catch {
      setImportError("Invalid seed phrase. Check every word and try again.");
    }
  };

  // ── Network picker (shared) ───────────────────────────────────────────

  const NetworkPicker = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={labelStyle}>Network</label>
      <select
        value={network}
        onChange={(e) => setNetwork(e.target.value as keyof typeof RPC_URLS)}
        style={selectStyle}
      >
        {(Object.keys(RPC_URLS) as Array<keyof typeof RPC_URLS>).map((k) => (
          <option key={k} value={k}>{NETWORK_NAMES[k]}</option>
        ))}
      </select>
    </div>
  );

  // ── Render ────────────────────────────────────────────────────────────

  if (screen === "home") {
    return (
      <div style={pageCenter}>
        <div style={{ fontSize: 52, marginBottom: 16 }}>🔒</div>
        <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>PrivaJet Wallet</h1>
        <p style={{ color: "var(--muted)", marginBottom: 36, maxWidth: 380, textAlign: "center" }}>
          Self-custodial PRIVA wallet with stealth address privacy.<br />
          Your keys. Your coins.
        </p>
        <NetworkPicker />
        <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
          <button onClick={startCreate} style={primaryBtn}>Create new wallet</button>
          <button onClick={() => setScreen("import")} style={outlineBtn}>Import seed phrase</button>
        </div>
      </div>
    );
  }

  if (screen === "create-show") {
    const words = generated.split(" ");
    return (
      <div style={pageCenter}>
        <div style={card}>
          <h2 style={cardTitle}>Your seed phrase</h2>
          <p style={cardDesc}>
            Write these {words.length} words down in order and store them somewhere safe.
            Anyone with this phrase can access your funds.
          </p>
          <div style={{
            position: "relative", marginBottom: 20,
            filter: revealed ? "none" : "blur(6px)",
            userSelect: revealed ? "auto" : "none",
            pointerEvents: revealed ? "auto" : "none",
          }}>
            <div style={phraseGrid}>
              {words.map((w, i) => (
                <div key={i} style={wordChip}>
                  <span style={{ color: "var(--muted)", fontSize: 10, marginRight: 4 }}>{i + 1}.</span>
                  {w}
                </div>
              ))}
            </div>
          </div>
          {!revealed && (
            <button onClick={() => setRevealed(true)} style={{ ...outlineBtn, width: "100%", marginBottom: 16 }}>
              👁 Reveal seed phrase
            </button>
          )}
          <div style={warnBox}>
            ⚠ Never share this phrase. PrivaJet will never ask for it.
          </div>
          <button
            onClick={proceedToConfirm}
            disabled={!revealed}
            style={{ ...primaryBtn, width: "100%", marginTop: 16, opacity: revealed ? 1 : 0.4 }}
          >
            I've written it down →
          </button>
          <button onClick={() => setScreen("home")} style={ghostBtn}>← Back</button>
        </div>
      </div>
    );
  }

  if (screen === "create-confirm") {
    return (
      <div style={pageCenter}>
        <div style={card}>
          <h2 style={cardTitle}>Confirm your backup</h2>
          <p style={cardDesc}>
            Enter word <strong style={{ color: "var(--accent)" }}>#{confirmIdx + 1}</strong> from your seed phrase.
          </p>
          <input
            autoFocus
            type="text"
            value={confirmWord}
            onChange={(e) => { setConfirmWord(e.target.value); setConfirmError(""); }}
            onKeyDown={(e) => e.key === "Enter" && finishCreate()}
            placeholder={`Word #${confirmIdx + 1}`}
            style={inputStyle}
          />
          {confirmError && <div style={errorText}>{confirmError}</div>}
          <button onClick={finishCreate} style={{ ...primaryBtn, width: "100%", marginTop: 16 }}>
            Open wallet
          </button>
          <button onClick={() => setScreen("create-show")} style={ghostBtn}>← Back</button>
        </div>
      </div>
    );
  }

  // Import
  return (
    <div style={pageCenter}>
      <div style={card}>
        <h2 style={cardTitle}>Import wallet</h2>
        <p style={cardDesc}>Enter your 12 or 24-word seed phrase, separated by spaces.</p>
        <NetworkPicker />
        <textarea
          autoFocus
          value={importPhrase}
          onChange={(e) => { setImportPhrase(e.target.value); setImportError(""); }}
          placeholder="word1 word2 word3 … word12"
          rows={4}
          style={{ ...inputStyle, resize: "vertical", marginTop: 16 }}
        />
        {importError && <div style={errorText}>{importError}</div>}
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>
          Your phrase is processed locally and never leaves this device.
        </div>
        <button onClick={doImport} style={{ ...primaryBtn, width: "100%", marginTop: 16 }}>
          Import wallet
        </button>
        <button onClick={() => setScreen("home")} style={ghostBtn}>← Back</button>
      </div>
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const pageCenter: React.CSSProperties = {
  minHeight: "100vh", display: "flex", flexDirection: "column",
  alignItems: "center", justifyContent: "center",
  padding: "24px 16px", gap: 0,
};

const card: React.CSSProperties = {
  background: "var(--surface)", border: "1px solid var(--border)",
  borderRadius: "var(--radius)", padding: "32px 28px",
  width: "100%", maxWidth: 460,
  display: "flex", flexDirection: "column", gap: 4,
};

const cardTitle: React.CSSProperties = { fontSize: 20, fontWeight: 700, marginBottom: 6 };
const cardDesc: React.CSSProperties = { fontSize: 13, color: "var(--muted)", marginBottom: 16, lineHeight: 1.6 };

const phraseGrid: React.CSSProperties = {
  display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 4,
};

const wordChip: React.CSSProperties = {
  background: "var(--surface2)", border: "1px solid var(--border)",
  borderRadius: 6, padding: "6px 10px", fontSize: 13, fontWeight: 500,
};

const warnBox: React.CSSProperties = {
  background: "#2a1a00", border: "1px solid #5a3a00",
  borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#ffb060",
};

export const primaryBtn: React.CSSProperties = {
  background: "var(--accent)", color: "#fff", border: "none",
  borderRadius: 8, padding: "11px 24px", fontSize: 15, fontWeight: 600, cursor: "pointer",
};

export const outlineBtn: React.CSSProperties = {
  background: "transparent", color: "var(--text)",
  border: "1px solid var(--border)", borderRadius: 8,
  padding: "11px 24px", fontSize: 15, fontWeight: 500, cursor: "pointer",
};

const ghostBtn: React.CSSProperties = {
  background: "none", border: "none", color: "var(--muted)",
  fontSize: 13, cursor: "pointer", marginTop: 12, alignSelf: "center",
};

export const inputStyle: React.CSSProperties = {
  width: "100%", background: "var(--surface2)", border: "1px solid var(--border)",
  borderRadius: 8, color: "var(--text)", fontSize: 14,
  padding: "10px 14px", outline: "none", fontFamily: "inherit",
};

const selectStyle: React.CSSProperties = {
  ...inputStyle, cursor: "pointer",
};

const labelStyle: React.CSSProperties = {
  fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".08em",
};

const errorText: React.CSSProperties = {
  color: "var(--red)", fontSize: 12, marginTop: 6,
};
