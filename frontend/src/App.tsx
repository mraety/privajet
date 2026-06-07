import { useState, useEffect, useCallback } from "react";
import { BrowserProvider, Contract, ethers } from "ethers";
import { WALLET_ABI } from "./abi/PrivaJetWallet";
import { ERC20_ABI } from "./abi/ERC20";
import { CONTRACTS, SUPPORTED_CHAINS } from "./config";
import Header from "./components/Header";
import BalanceCards from "./components/BalanceCards";
import ActionPanel from "./components/ActionPanel";
import TxStatus from "./components/TxStatus";

export type TxState =
  | { status: "idle" }
  | { status: "pending"; msg: string }
  | { status: "success"; msg: string; hash: string }
  | { status: "error"; msg: string };

export interface WalletState {
  address: string;
  chainId: number;
  chainName: string;
  privaBalance: bigint;
  walletBalance: bigint;
  poolConfigured: boolean;
  paused: boolean;
}

declare global {
  interface Window {
    ethereum?: any;
  }
}

export default function App() {
  const [provider, setProvider] = useState<BrowserProvider | null>(null);
  const [walletState, setWalletState] = useState<WalletState | null>(null);
  const [tx, setTx] = useState<TxState>({ status: "idle" });
  const [configError, setConfigError] = useState("");

  const connect = useCallback(async () => {
    if (!window.ethereum) {
      alert("No Ethereum wallet detected. Install MetaMask to continue.");
      return;
    }
    try {
      const p = new BrowserProvider(window.ethereum);
      await p.send("eth_requestAccounts", []);
      setProvider(p);
    } catch {
      setTx({ status: "error", msg: "Wallet connection rejected." });
    }
  }, []);

  const disconnect = useCallback(() => {
    setProvider(null);
    setWalletState(null);
    setTx({ status: "idle" });
  }, []);

  const refresh = useCallback(async () => {
    if (!provider) return;
    setConfigError("");

    if (!CONTRACTS.wallet || !CONTRACTS.token) {
      setConfigError(
        "Contract addresses not configured. Set VITE_WALLET_ADDRESS and VITE_TOKEN_ADDRESS in frontend/.env"
      );
      return;
    }

    try {
      const signer = await provider.getSigner();
      const address = await signer.getAddress();
      const { chainId } = await provider.getNetwork();
      const chainName = SUPPORTED_CHAINS[Number(chainId)] ?? `Chain ${chainId}`;

      const wallet = new Contract(CONTRACTS.wallet, WALLET_ABI, provider);
      const token = new Contract(CONTRACTS.token, ERC20_ABI, provider);

      const [privaBalance, walletBalance, poolAddr, paused] = await Promise.all([
        token.balanceOf(address),
        wallet.balanceOf(address),
        wallet.shieldedPool(),
        wallet.paused(),
      ]);

      setWalletState({
        address,
        chainId: Number(chainId),
        chainName,
        privaBalance,
        walletBalance,
        poolConfigured: poolAddr !== ethers.ZeroAddress,
        paused,
      });
    } catch (e: any) {
      setConfigError(`Failed to load balances: ${e.message}`);
    }
  }, [provider]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!window.ethereum) return;
    const onAccountsChanged = () => refresh();
    const onChainChanged = () => window.location.reload();
    window.ethereum.on("accountsChanged", onAccountsChanged);
    window.ethereum.on("chainChanged", onChainChanged);
    return () => {
      window.ethereum?.removeListener("accountsChanged", onAccountsChanged);
      window.ethereum?.removeListener("chainChanged", onChainChanged);
    };
  }, [refresh]);

  const handleAction = useCallback(
    async (
      action: (signer: ethers.Signer) => Promise<ethers.TransactionResponse>,
      pendingMsg: string
    ) => {
      if (!provider) return;
      setTx({ status: "pending", msg: pendingMsg });
      try {
        const signer = await provider.getSigner();
        const txResponse = await action(signer);
        setTx({ status: "pending", msg: `Confirming… (${txResponse.hash.slice(0, 10)}…)` });
        await txResponse.wait();
        setTx({ status: "success", msg: "Transaction confirmed!", hash: txResponse.hash });
        await refresh();
      } catch (e: any) {
        const msg =
          e.reason ?? e.data?.message ?? e.message ?? "Transaction failed";
        setTx({ status: "error", msg });
      }
    },
    [provider, refresh]
  );

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <Header
        walletState={walletState}
        onConnect={connect}
        onDisconnect={disconnect}
      />

      <main style={{ flex: 1, maxWidth: 760, margin: "0 auto", width: "100%", padding: "32px 16px" }}>
        {configError && (
          <div style={{
            background: "#2a1515", border: "1px solid #5a2020", borderRadius: "var(--radius)",
            padding: "14px 18px", marginBottom: 24, color: "#ff9090", fontSize: 13,
          }}>
            ⚠ {configError}
          </div>
        )}

        {!provider ? (
          <ConnectPrompt onConnect={connect} />
        ) : (
          <>
            {walletState && <BalanceCards state={walletState} />}
            {walletState && (
              <ActionPanel
                state={walletState}
                txPending={tx.status === "pending"}
                provider={provider}
                onAction={handleAction}
              />
            )}
            <TxStatus tx={tx} onDismiss={() => setTx({ status: "idle" })} />
          </>
        )}
      </main>
    </div>
  );
}

function ConnectPrompt({ onConnect }: { onConnect: () => void }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", paddingTop: 80, gap: 24, textAlign: "center",
    }}>
      <div style={{ fontSize: 56 }}>🔒</div>
      <h2 style={{ fontSize: 28, fontWeight: 700 }}>PrivaJet Wallet</h2>
      <p style={{ color: "var(--muted)", maxWidth: 400 }}>
        Private, upgradeable token wallet with ZK privacy features.<br />
        Connect your Ethereum wallet to get started.
      </p>
      <button onClick={onConnect} style={primaryBtn}>
        Connect Wallet
      </button>
    </div>
  );
}

export const primaryBtn: React.CSSProperties = {
  background: "var(--accent)",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  padding: "11px 28px",
  fontSize: 15,
  fontWeight: 600,
  cursor: "pointer",
  transition: "opacity .15s",
};
