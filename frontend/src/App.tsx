import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { WALLET_ABI } from "./abi/PrivaJetWallet";
import { ERC20_ABI } from "./abi/ERC20";
import { CONTRACTS, RPC_URLS } from "./config";
import WelcomeScreen from "./components/WelcomeScreen";
import Header from "./components/Header";
import BalanceCards from "./components/BalanceCards";
import ActionPanel from "./components/ActionPanel";
import TxStatus from "./components/TxStatus";

export type TxState =
  | { status: "idle" }
  | { status: "pending"; msg: string }
  | { status: "success"; msg: string; hash: string }
  | { status: "error"; msg: string };

export interface WalletInfo {
  address: string;
  signer: ethers.HDNodeWallet | ethers.Wallet;
  provider: ethers.JsonRpcProvider;
  network: string;
}

export interface Balances {
  priva: bigint;
  walletContract: bigint;
  poolConfigured: boolean;
  paused: boolean;
}

export default function App() {
  const [walletInfo, setWalletInfo] = useState<WalletInfo | null>(null);
  const [balances, setBalances] = useState<Balances | null>(null);
  const [tx, setTx] = useState<TxState>({ status: "idle" });
  const [network, setNetwork] = useState<keyof typeof RPC_URLS>("sepolia");

  const unlock = useCallback((signer: ethers.HDNodeWallet | ethers.Wallet, net: keyof typeof RPC_URLS) => {
    const provider = new ethers.JsonRpcProvider(RPC_URLS[net]);
    const connected = signer.connect(provider);
    setWalletInfo({ address: signer.address, signer: connected, provider, network: net });
    setNetwork(net);
  }, []);

  const lock = useCallback(() => {
    setWalletInfo(null);
    setBalances(null);
    setTx({ status: "idle" });
  }, []);

  const refresh = useCallback(async () => {
    if (!walletInfo || !CONTRACTS.wallet || !CONTRACTS.token) return;
    try {
      const { signer, provider } = walletInfo;
      const token = new ethers.Contract(CONTRACTS.token, ERC20_ABI, provider);
      const wallet = new ethers.Contract(CONTRACTS.wallet, WALLET_ABI, provider);
      const [priva, walletContract, poolAddr, paused] = await Promise.all([
        token.balanceOf(walletInfo.address),
        wallet.balanceOf(walletInfo.address),
        wallet.shieldedPool(),
        wallet.paused(),
      ]);
      setBalances({
        priva,
        walletContract,
        poolConfigured: poolAddr !== ethers.ZeroAddress,
        paused,
      });
    } catch {
      // RPC errors — balances stay stale
    }
  }, [walletInfo]);

  useEffect(() => { refresh(); }, [refresh]);

  const handleAction = useCallback(
    async (
      action: (signer: ethers.HDNodeWallet | ethers.Wallet) => Promise<ethers.TransactionResponse>,
      pendingMsg: string
    ) => {
      if (!walletInfo) return;
      setTx({ status: "pending", msg: pendingMsg });
      try {
        const txResponse = await action(walletInfo.signer);
        setTx({ status: "pending", msg: `Confirming… (${txResponse.hash.slice(0, 10)}…)` });
        await txResponse.wait();
        setTx({ status: "success", msg: "Transaction confirmed!", hash: txResponse.hash });
        await refresh();
      } catch (e: any) {
        const msg = e.reason ?? e.data?.message ?? e.shortMessage ?? e.message ?? "Transaction failed";
        setTx({ status: "error", msg });
      }
    },
    [walletInfo, refresh]
  );

  if (!walletInfo) {
    return <WelcomeScreen onUnlock={unlock} defaultNetwork={network} />;
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <Header walletInfo={walletInfo} onLock={lock} onRefresh={refresh} />
      <main style={{ flex: 1, maxWidth: 760, margin: "0 auto", width: "100%", padding: "32px 16px" }}>
        {!CONTRACTS.wallet && (
          <div style={warningBox}>
            ⚠ Contract addresses not set. Add VITE_WALLET_ADDRESS and VITE_TOKEN_ADDRESS to frontend/.env
          </div>
        )}
        {balances && <BalanceCards balances={balances} />}
        {balances && (
          <ActionPanel
            balances={balances}
            walletInfo={walletInfo}
            txPending={tx.status === "pending"}
            onAction={handleAction}
          />
        )}
        <TxStatus tx={tx} onDismiss={() => setTx({ status: "idle" })} />
      </main>
    </div>
  );
}

const warningBox: React.CSSProperties = {
  background: "#2a1a00", border: "1px solid #5a3a00", borderRadius: 10,
  padding: "13px 18px", marginBottom: 24, color: "#ffb060", fontSize: 13,
};
