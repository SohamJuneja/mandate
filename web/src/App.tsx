import { useEffect, useState } from "react";
import type { Address } from "viem";
import { FACTORY, connect, short } from "./chain";
import { Addr } from "./components/ui";
import { CreateVaultPage } from "./pages/CreateVault";
import { VaultDetailPage } from "./pages/VaultDetail";
import { VaultsPage } from "./pages/Vaults";

function useHash() {
  const [h, setH] = useState(location.hash || "#/");
  useEffect(() => {
    const on = () => {
      setH(location.hash || "#/");
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return h;
}

export function App() {
  const hash = useHash();
  const [account, setAccount] = useState<Address>();
  const [walletErr, setWalletErr] = useState<string>();

  useEffect(() => {
    window.ethereum?.request?.({ method: "eth_accounts" }).then((a: string[]) => a[0] && setAccount(a[0] as Address)).catch(() => {});
    const on = (a: string[]) => setAccount(a[0] as Address | undefined);
    window.ethereum?.on?.("accountsChanged", on);
    return () => window.ethereum?.removeListener?.("accountsChanged", on);
  }, []);

  const onConnect = async () => {
    setWalletErr(undefined);
    try {
      setAccount(await connect());
    } catch (e: any) {
      setWalletErr(e?.message ?? String(e));
    }
  };

  const vaultMatch = hash.match(/^#\/vault\/(0x[0-9a-fA-F]{40})/);
  let page;
  if (vaultMatch) page = <VaultDetailPage address={vaultMatch[1] as Address} account={account} onConnect={onConnect} />;
  else if (hash.startsWith("#/create")) page = <CreateVaultPage account={account} onConnect={onConnect} />;
  else page = <VaultsPage />;

  return (
    <>
      <header className="topbar">
        <a href="#/" className="brand">
          <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden>
            <path d="M6 25V7l10 10L26 7v18" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinejoin="round" strokeLinecap="round" />
          </svg>
          Mandate
        </a>
        <nav>
          <a href="#/" className={!vaultMatch && !hash.startsWith("#/create") ? "on" : ""}>Vaults</a>
          <a href="#/create" className={hash.startsWith("#/create") ? "on" : ""}>Create</a>
        </nav>
        <div className="topbar-right">
          <span className="chain-pill" title="Somnia Hideki testnet">
            <span className="dot-live" /> Hideki · 50383
          </span>
          {account ? <span className="wallet mono">{short(account)}</span> : <button className="primary small" onClick={onConnect}>Connect wallet</button>}
        </div>
      </header>
      {walletErr && <div className="note note-bad banner">{walletErr}</div>}
      <main>{page}</main>
      <footer className="footer muted small">
        Factory <Addr a={FACTORY} /> · dreamDEX perps on Somnia · no backend of our own: state is read from chain; order history comes from the public explorer API
      </footer>
    </>
  );
}
