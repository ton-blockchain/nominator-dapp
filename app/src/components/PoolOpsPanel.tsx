import { AddrLink } from '@/components/ui/form';
import { PoolOpsProvider, usePoolOps } from './ops/PoolOpsContext';
import { AddFundsPanel } from './ops/AddFundsPanel';
import { OwnerWithdrawalPanel } from './ops/OwnerWithdrawalPanel';
import { AddValidatorPanel } from './ops/AddValidatorPanel';
import { RemoveValidatorPanel } from './ops/RemoveValidatorPanel';
import { UpdateValidatorLimitsPanel } from './ops/UpdateValidatorLimitsPanel';
import { UpdateValidatorLimitPanel } from './ops/UpdateValidatorLimitPanel';
import { RecoverStakePanel } from './ops/RecoverStakePanel';
import { UpdateVsetPanel } from './ops/UpdateVsetPanel';
import { UpdateNominatorLimitsPanel } from './ops/UpdateNominatorLimitsPanel';
import { UpdateWhitelistPanel } from './ops/UpdateWhitelistPanel';
import { EvictNominatorPanel } from './ops/EvictNominatorPanel';

export type OpTab =
  | 'add-funds'
  | 'add-validator'
  | 'remove-validator'
  | 'recover-stake'
  | 'owner-withdrawal'
  | 'update-validator-limits'
  | 'update-nominator-limits'
  | 'update-validator-limit'
  | 'update-whitelist'
  | 'evict-nominator'
  | 'update-vset';

const TAB_GROUPS: { group: string; tabs: { id: OpTab; label: string }[] }[] = [
  {
    group: 'Pool',
    tabs: [
      { id: 'add-funds', label: 'Add Funds' },
      { id: 'owner-withdrawal', label: 'Owner Withdrawal' },
    ],
  },
  {
    group: 'Validators',
    tabs: [
      { id: 'add-validator', label: 'Add Validator' },
      { id: 'remove-validator', label: 'Remove Validator' },
      { id: 'update-validator-limits', label: 'Global Validator Limits' },
      { id: 'update-validator-limit', label: 'Individual Validator Limit' },
      { id: 'recover-stake', label: 'Recover Stake' },
      { id: 'update-vset', label: 'Update Vset' },
    ],
  },
  {
    group: 'Nominators',
    tabs: [
      { id: 'update-nominator-limits', label: 'Nominator Limits' },
      { id: 'update-whitelist', label: 'Nominator Whitelist' },
      { id: 'evict-nominator', label: 'Evict Nominator' },
    ],
  },
];

// Renders the tab bar and the active sub-panel. The sub-tab is owned by the
// caller so other UI (e.g. the PoolLimitsAlert banner) can focus a specific
// panel. Each sub-panel is mounted only when its tab is active, so its local
// state (selected validator, form inputs, field errors) is discarded on tab
// switch — no leakage between panels.
function PoolOpsTabs({
  tab,
  onTabChange,
}: {
  tab: OpTab;
  onTabChange: (tab: OpTab) => void;
}) {
  const { network, poolAddress } = usePoolOps();

  return (
    <div className="w-full max-w-xl flex flex-col gap-4 text-left">
      <div className="flex flex-col gap-2">
        {TAB_GROUPS.map((group) => (
          <div key={group.group} className="flex flex-col gap-1">
            <span className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wide">
              {group.group}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {group.tabs.map((t) => (
                <button
                  key={t.id}
                  onClick={() => onTabChange(t.id)}
                  className={
                    tab === t.id
                      ? 'rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-[12px] font-medium'
                      : 'rounded-md border px-3 py-1.5 text-[12px] font-medium hover:bg-accent'
                  }
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <section className="rounded-xl border p-5 flex flex-col gap-3">
        {tab === 'add-funds' && <AddFundsPanel />}
        {tab === 'add-validator' && <AddValidatorPanel />}
        {tab === 'remove-validator' && <RemoveValidatorPanel />}
        {tab === 'owner-withdrawal' && <OwnerWithdrawalPanel />}
        {tab === 'update-validator-limits' && <UpdateValidatorLimitsPanel />}
        {tab === 'update-nominator-limits' && <UpdateNominatorLimitsPanel />}
        {tab === 'update-validator-limit' && <UpdateValidatorLimitPanel />}
        {tab === 'recover-stake' && (
          <RecoverStakePanel
            onGoToUpdateVset={() => onTabChange('update-vset')}
          />
        )}
        {tab === 'update-vset' && <UpdateVsetPanel />}
        {tab === 'update-whitelist' && <UpdateWhitelistPanel />}
        {tab === 'evict-nominator' && <EvictNominatorPanel />}
      </section>

      <div className="text-muted-foreground text-[12px] flex flex-col gap-1">
        <div className="flex flex-col gap-0.5">
          <span className="text-muted-foreground text-[12px]">Pool</span>
          <AddrLink addr={poolAddress} network={network} bounceable />
        </div>
      </div>
    </div>
  );
}

export function PoolOpsPanel({
  poolAddress,
  tab,
  onTabChange,
}: {
  poolAddress: string;
  tab: OpTab;
  onTabChange: (tab: OpTab) => void;
}) {
  return (
    <PoolOpsProvider poolAddress={poolAddress}>
      <PoolOpsTabs tab={tab} onTabChange={onTabChange} />
    </PoolOpsProvider>
  );
}
