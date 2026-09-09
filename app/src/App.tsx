import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Address } from '@ton/core';
import {
  TonConnectButton,
  THEME,
  useTonAddress,
  useTonConnectUI,
} from '@tonconnect/ui-react';
import { Sun, Moon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { DeployInitPanel } from './components/DeployInitPanel';
import { PoolOpsPanel, type OpTab } from './components/PoolOpsPanel';
import { PoolLimitsAlert } from './components/PoolLimitsAlert';
import { PoolInfoPanel } from './components/PoolInfoPanel';
import { RoundInfoPanel } from './components/RoundInfoPanel';
import { Field, AddrLink } from './components/ui/form';
import { useRouter } from './lib/router';
import {
  formatAddressForNetwork,
  isValidAddress,
  detectAddressNetwork,
} from './lib/ton';
import { getPoolOwner, verifyPoolCode } from './lib/pool';
import { IconTonDiamond } from './components/TonDiamond';

type MainTab = 'deploy' | 'operations' | 'info' | 'rounds';

// Shown when a data tab is selected but the entered pool address is missing
// or invalid. Prevents the panels (which parse the address during render)
// from throwing and crashing the page.
function PanelPlaceholder({ poolAddr }: { poolAddr: string }) {
  return (
    <div className="w-full max-w-md rounded-xl border p-6 text-center">
      <p className="text-muted-foreground text-[14px]">
        {poolAddr
          ? 'The entered pool address is invalid. Fix it above to load this panel.'
          : 'Enter a pool address above to load this panel.'}
      </p>
    </div>
  );
}

function useTheme() {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const stored = localStorage.getItem('nominator-pool-dapp:theme');
    return stored === 'light' ? 'light' : 'dark';
  });
  const [tonConnectUI] = useTonConnectUI();

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('nominator-pool-dapp:theme', theme);
    tonConnectUI.uiOptions = {
      uiPreferences: { theme: theme === 'light' ? THEME.LIGHT : THEME.DARK },
    };
  }, [theme, tonConnectUI]);

  return { theme, setTheme };
}

export default function App() {
  const { network, setTestnet } = useRouter();
  const walletAddress = useTonAddress();
  const [tc] = useTonConnectUI();
  const { theme, setTheme } = useTheme();
  const [tab, setTab] = useState<MainTab>('deploy');
  // Operations sub-tab, lifted here so the PoolLimitsAlert banner can jump
  // straight to the Global Validator Limits form.
  const [opsTab, setOpsTab] = useState<OpTab>('add-funds');
  const [poolAddr, setPoolAddrRaw] = useState(
    () => localStorage.getItem('nominator-pool:address') ?? '',
  );
  const setPoolAddr = (addr: string) => {
    setPoolAddrRaw(addr);
    localStorage.setItem('nominator-pool:address', addr);
  };

  // Validate the entered pool address so we can show inline feedback and
  // avoid firing queries / parsing it elsewhere with an invalid string.
  const poolAddrValid = isValidAddress(poolAddr);

  // The pool address (in friendly form) carries a testnet flag and is the
  // source of truth for which network to query — pasting a testnet pool
  // address switches the app to testnet so the matching Toncenter API key is
  // used. Raw addresses carry no testnet bit, so when the address is absent or
  // raw we fall back to the connected wallet's chain, keeping the Deploy tab
  // aligned with the wallet when no pool address has been entered yet.
  const chain = tc?.account?.chain;
  const poolAddrNetwork = useMemo(
    () => (poolAddrValid ? detectAddressNetwork(poolAddr) : null),
    [poolAddr, poolAddrValid],
  );
  useEffect(() => {
    if (poolAddrNetwork) {
      setTestnet(poolAddrNetwork === 'testnet');
    } else if (chain) {
      setTestnet(chain === '-3');
    }
  }, [poolAddrNetwork, chain, setTestnet]);

  // Fetch the pool owner to show owner status near the network indicator.
  // A failed get-method means the contract is not deployed (or not reachable),
  // surfaced as "Not deployed" rather than stuck on "loading…".
  const {
    data: poolOwner,
    isError: poolOwnerError,
    isPending: poolOwnerPending,
  } = useQuery({
    queryKey: ['pool-owner', network, poolAddr],
    enabled: !!poolAddr && poolAddrValid,
    queryFn: () => getPoolOwner(network, poolAddr),
  });
  const isOwner = !!(
    poolOwner &&
    walletAddress &&
    poolOwner.equals(Address.parse(walletAddress))
  );

  // Verify the deployed contract's code matches the expected pool code.
  const { data: codeMismatch } = useQuery({
    queryKey: ['pool-code-verify', network, poolAddr],
    enabled: !!poolAddr && poolAddrValid,
    queryFn: () => verifyPoolCode(network, poolAddr),
    staleTime: Infinity,
  });

  const userWallet = walletAddress
    ? (() => {
        try {
          return formatAddressForNetwork(walletAddress, network);
        } catch {
          return walletAddress;
        }
      })()
    : '';

  return (
    <div className="min-h-screen flex flex-col">
      {network === 'testnet' && (
        <div className="bg-destructive text-white text-center text-[13px] font-semibold py-1.5 px-4 sticky top-0 z-[60]">
          ATTENTION! This is a test network — don't send real GRAM!
        </div>
      )}
      {/* ─── Topbar ─── */}
      <header className="flex items-center justify-between px-7 h-[60px] border-b sticky top-0 z-50 bg-background max-sm:px-4 max-sm:h-auto max-sm:flex-wrap max-sm:gap-2.5 max-sm:py-3">
        <div className="flex items-center gap-2.5 text-[17px] font-bold max-sm:text-[15px]">
          <IconTonDiamond size={32} theme={theme} />
          Nominator Pool
        </div>
        <div className="flex items-center gap-2.5">
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full size-10 bg-secondary max-sm:size-9"
            title="Toggle theme"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            {theme === 'dark' ? (
              <Sun className="size-[18px]" />
            ) : (
              <Moon className="size-[18px]" />
            )}
          </Button>
          <TonConnectButton />
        </div>
      </header>

      {/* ─── Main content ─── */}
      <main className="flex-1 py-8 px-6 max-w-[1200px] mx-auto w-full flex flex-col items-center gap-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <IconTonDiamond size={64} theme={theme} />
          <h1 className="text-[22px] font-semibold tracking-tight">
            Nominator Pool
          </h1>
          <p className="text-muted-foreground text-[15px] max-w-md">
            Deploy, initialize, and manage the nominator pool contract.
            {userWallet && (
              <span className="block mt-2 font-mono text-[13px] text-foreground/70 break-all">
                <AddrLink
                  addr={userWallet}
                  network={network}
                  display={userWallet}
                />
              </span>
            )}
          </p>
          {poolAddr && poolAddrValid && walletAddress && (
            <p className="text-muted-foreground text-[13px]">
              {poolOwnerPending ? (
                <span className="text-muted-foreground">Owner: loading…</span>
              ) : poolOwnerError ? (
                <span className="text-muted-foreground">Not deployed</span>
              ) : (
                <span
                  className={cn(
                    'font-semibold',
                    isOwner ? 'text-success' : 'text-destructive',
                  )}
                >
                  {isOwner ? 'You are the owner' : 'Not the owner'}
                </span>
              )}
            </p>
          )}
        </div>

        {/* ─── Pool selector ─── */}
        <div className="w-full max-w-xl flex flex-col gap-2">
          <Field
            label="Pool address"
            value={poolAddr}
            onChange={setPoolAddr}
            placeholder="Paste an existing pool address, or use Deploy & Init below"
            error={
              poolAddr && !poolAddrValid ? 'Invalid address format' : undefined
            }
          />
          {codeMismatch && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-[13px] text-destructive">
              {codeMismatch}
            </div>
          )}
          {poolAddr && (
            <button
              onClick={() => setPoolAddr('')}
              className="text-muted-foreground text-[12px] text-left hover:text-foreground"
            >
              Clear
            </button>
          )}
        </div>

        {/* Warns when the pool's global validator limits no longer fit the
            network staking range (config param 17) — staking is blocked until
            the owner updates the limits. */}
        {poolAddrValid && (
          <PoolLimitsAlert
            poolAddress={poolAddr}
            onOpenGlobalLimits={() => {
              setOpsTab('update-validator-limits');
              setTab('operations');
            }}
          />
        )}

        {/* ─── Tabs ─── */}
        <div className="flex gap-1.5">
          {(
            [
              { id: 'deploy', label: 'Deploy & Init' },
              { id: 'operations', label: 'Operations' },
              { id: 'rounds', label: 'Round Info' },
              { id: 'info', label: 'Pool Info' },
            ] as { id: MainTab; label: string }[]
          ).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={
                tab === t.id
                  ? 'rounded-lg bg-primary text-primary-foreground px-4 py-2 text-[14px] font-medium'
                  : 'rounded-lg border px-4 py-2 text-[14px] font-medium hover:bg-accent'
              }
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'deploy' && <DeployInitPanel onPoolAddress={setPoolAddr} />}

        {tab === 'operations' &&
          (poolAddrValid ? (
            <PoolOpsPanel
              poolAddress={poolAddr}
              tab={opsTab}
              onTabChange={setOpsTab}
            />
          ) : (
            <PanelPlaceholder poolAddr={poolAddr} />
          ))}

        {tab === 'rounds' &&
          (poolAddrValid ? (
            <RoundInfoPanel poolAddress={poolAddr} />
          ) : (
            <PanelPlaceholder poolAddr={poolAddr} />
          ))}

        {tab === 'info' &&
          (poolAddrValid ? (
            <PoolInfoPanel poolAddress={poolAddr} />
          ) : (
            <PanelPlaceholder poolAddr={poolAddr} />
          ))}
      </main>
    </div>
  );
}
