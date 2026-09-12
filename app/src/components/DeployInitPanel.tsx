import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fromNano } from '@ton/core';
import {
  useIsConnectionRestored,
  useTonAddress,
  useTonConnectUI,
} from '@tonconnect/ui-react';

import { Button } from '@/components/ui/button';
import { Field, AddrLink } from '@/components/ui/form';
import { ShareInput } from '@/components/ui/ShareInput';
import { ValidatorLimitInput } from '@/components/ui/ValidatorLimitInput';
import { WhitelistInput } from '@/components/ui/WhitelistInput';
import { RoundAllowanceSelect } from '@/components/ui/RoundAllowanceSelect';
import { useToast } from '@/components/ui/toast';
import { useRouter } from '@/lib/router';
import { prettyError } from '@/lib/errors';
import { getWalletBaselineLt, waitForInitResult } from '@/lib/refund';
import { tonscanTxUrl, formatAddressForNetwork } from '@/lib/ton';
import {
  deployAndInitPool,
  getNetworkStakingLimits,
  isContractDeployed,
  makeLimitShare,
  makeLimitTon,
  makeSender,
  poolAddress,
  SHARE_BASE,
  validateBigIntInput,
  validateGlobalGramLimits,
  validateGramInput,
  validateInitParams,
  validateNumberInput,
  validateValidatorGramLimit,
} from '@/lib/pool';

export function DeployInitPanel({
  onPoolAddress,
}: {
  onPoolAddress: (addr: string) => void;
}) {
  const { network } = useRouter();
  const wallet = useTonAddress();
  const restored = useIsConnectionRestored();
  const [tc] = useTonConnectUI();
  const sender = useMemo(
    () => (tc && wallet && tc.account ? makeSender(tc, network) : null),
    [tc, network, wallet],
  );

  const { data: networkLimits } = useQuery({
    queryKey: ['network-staking-limits', network],
    queryFn: () => getNetworkStakingLimits(network),
  });
  const networkMinStake = networkLimits?.minStake;
  const networkMaxStake = networkLimits?.maxStake;

  // Default the global validator range to the network staking range (config
  // param 17) once it loads, so the form opens with values the contract will
  // accept instead of hardcoded placeholders. The deps are primitive bigints,
  // so this only re-fires when the actual limits change (e.g. on network
  // switch) — edits made after the values first load are preserved across
  // refetches.
  useEffect(() => {
    if (!networkMinStake || !networkMaxStake) return;
    setMinTonPerValidator(fromNano(networkMinStake));
    setMaxTonPerValidator(fromNano(networkMaxStake));
  }, [networkMinStake, networkMaxStake]);

  // deploy params
  const [poolId, setPoolId] = useState('0');

  // init params
  const [mainValidator, setMainValidator] = useState('');
  const [roundAllowance, setRoundAllowance] = useState('3');
  const [ownerShare, setOwnerShare] = useState('8388608'); // SHARE_BASE / 2 = 50%
  const [ownerShareMode, setOwnerShareMode] = useState<'percent' | 'share'>(
    'percent',
  );
  const [ownerSharePercent, setOwnerSharePercent] = useState('50.00');
  const [maxTonPerValidator, setMaxTonPerValidator] = useState('10000000');
  const [minTonPerValidator, setMinTonPerValidator] = useState('300000');
  const [refundBonus, setRefundBonus] = useState('3');
  const [maxNominators, setMaxNominators] = useState('512');
  const [minStake, setMinStake] = useState('1000');
  const [minWithdrawableRewards, setMinWithdrawableRewards] = useState('1');
  // Nominator whitelist applied at init — the contract accepts it via
  // NominatorsSettings in InitPoolMessage. Empty (default) = open to all.
  const [whitelistEntries, setWhitelistEntries] = useState<string[]>([]);
  const [initValue, setInitValue] = useState('250');

  // first validator limit (applied at init time)
  const [limitType, setLimitType] = useState<'global' | 'ton' | 'share'>(
    'global',
  );
  const [limitTonMax, setLimitTonMax] = useState('1000000');
  const [limitShareMax, setLimitShareMax] = useState('8388608');
  const [limitShareMode, setLimitShareMode] = useState<'percent' | 'share'>(
    'percent',
  );
  const [limitPercentInput, setLimitPercentInput] = useState('50.00');

  const [busy, setBusy] = useState(false);

  const toast = useToast();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const setErr = (field: string, msg: string) =>
    setFieldErrors((p) => ({ ...p, [field]: msg }));
  const clearErr = (field: string) =>
    setFieldErrors((p) => {
      if (!(field in p)) return p;
      const n = { ...p };
      delete n[field];
      return n;
    });
  const withClear =
    (setter: (v: string) => void, field: string) => (v: string) => {
      setter(v);
      clearErr(field);
    };
  const clearAllErr = () => setFieldErrors({});

  // The connected wallet is the pool owner — it deploys and initializes.
  const owner = wallet
    ? (() => {
        try {
          return formatAddressForNetwork(wallet, network);
        } catch {
          return wallet;
        }
      })()
    : '';

  const computedAddr = useMemo(() => {
    if (!owner) return '';
    try {
      return poolAddress({ owner, poolId: Number(poolId), value: 0n }, network);
    } catch {
      return '';
    }
  }, [owner, poolId, network]);

  // Check whether a pool is already deployed at the computed address (derived
  // from owner + poolId). Deploying into an occupied address bounces on-chain,
  // so surface it as a warning under the Pool ID input as the user types.
  // staleTime: Infinity keeps the result cached per address — deployment state
  // only flips one way (absent -> present), and the user retries with a new
  // poolId, which yields a new query key.
  const { data: alreadyDeployed } = useQuery({
    queryKey: ['pool-deployed', network, computedAddr],
    enabled: !!computedAddr,
    queryFn: () => isContractDeployed(network, computedAddr),
    staleTime: Infinity,
  });

  async function onDeployAndInit() {
    if (!sender) {
      toast.error('Connect your wallet first.');
      return;
    }
    if (!owner) {
      toast.error(
        'Could not determine owner address from the connected wallet.',
      );
      return;
    }
    const pid = validateNumberInput(poolId, 'poolId', setErr, clearErr);
    if (pid === null) return;
    const ownerShareVal = validateBigIntInput(
      ownerShare,
      'ownerShare',
      setErr,
      clearErr,
    );
    if (ownerShareVal === null) return;
    const maxTonPerValidatorVal = validateGramInput(
      maxTonPerValidator,
      'maxTonPerValidator',
      setErr,
      clearErr,
    );
    if (maxTonPerValidatorVal === null) return;
    const minTonPerValidatorVal = validateGramInput(
      minTonPerValidator,
      'minTonPerValidator',
      setErr,
      clearErr,
    );
    if (minTonPerValidatorVal === null) return;
    // Validate the pool's global validator range against the network staking
    // range (same check the Update global validator limits tab performs) so an
    // out-of-range init bounces here with an inline error instead of on-chain,
    // and so the first validator's individual limit below can be checked against
    // a range that is already known to be valid.
    const gerr = validateGlobalGramLimits(
      minTonPerValidatorVal,
      maxTonPerValidatorVal,
      { minStake: networkMinStake, maxStake: networkMaxStake },
    );
    if (gerr) {
      setErr(
        gerr.field === 'min' ? 'minTonPerValidator' : 'maxTonPerValidator',
        gerr.msg,
      );
      return;
    }
    const refundBonusVal = validateGramInput(
      refundBonus,
      'refundBonus',
      setErr,
      clearErr,
    );
    if (refundBonusVal === null) return;
    const maxNominatorsVal = validateNumberInput(
      maxNominators,
      'maxNominators',
      setErr,
      clearErr,
    );
    if (maxNominatorsVal === null) return;
    const minStakeVal = validateGramInput(
      minStake,
      'minStake',
      setErr,
      clearErr,
    );
    if (minStakeVal === null) return;
    const minWithdrawableRewardsVal = validateGramInput(
      minWithdrawableRewards,
      'minWithdrawableRewards',
      setErr,
      clearErr,
    );
    if (minWithdrawableRewardsVal === null) return;
    const initValueVal = validateGramInput(
      initValue,
      'initValue',
      setErr,
      clearErr,
    );
    if (initValueVal === null) return;
    // Build the per-validator limit for the first validator. 'global' means
    // null (the validator uses the pool's global range).
    let limit = null;
    if (limitType === 'ton') {
      const maxTon = validateGramInput(
        limitTonMax,
        'limitTonMax',
        setErr,
        clearErr,
      );
      if (maxTon === null) return;
      // At init the pool's global range is being set in this same form, so
      // validate the individual limit against it plus the network range — the
      // same checks Add Validator and Individual Validator Limit perform
      // (IndividualLimitIsBelowGlobal / ...AboveGlobal and the network bounds).
      const err = validateValidatorGramLimit(maxTon, 'First validator limit', {
        globalMinTon: minTonPerValidatorVal,
        globalMaxTon: maxTonPerValidatorVal,
        networkMinStake,
        networkMaxStake,
      });
      if (err) {
        setErr('limitTonMax', err);
        return;
      }
      limit = makeLimitTon(maxTon);
    } else if (limitType === 'share') {
      const ms = validateBigIntInput(
        limitShareMax,
        'limitShareMax',
        setErr,
        clearErr,
      );
      if (ms === null) return;
      if (ms < 0n || ms > SHARE_BASE) {
        setErr('limitShareMax', `Max share must be in 0..${SHARE_BASE}.`);
        return;
      }
      limit = makeLimitShare(ms);
    }
    const initParams = {
      mainValidator,
      roundAllowance: BigInt(roundAllowance),
      ownerShare: ownerShareVal,
      maxTonPerValidator: maxTonPerValidatorVal,
      minTonPerValidator: minTonPerValidatorVal,
      refundBonus: refundBonusVal,
      maxNominators: maxNominatorsVal,
      minStake: minStakeVal,
      minWithdrawableRewards: minWithdrawableRewardsVal,
      whitelist: whitelistEntries,
      value: initValueVal,
      limit,
    };
    const verr = validateInitParams({
      poolAddress: computedAddr,
      ...initParams,
    });
    if (verr) {
      setErr(verr.field, verr.message);
      return;
    }
    clearAllErr();
    setBusy(true);
    const pendingId = toast.pending('Sending deploy & init transaction...');
    try {
      const baselineLt = await getWalletBaselineLt(network, wallet);
      await deployAndInitPool(
        network,
        sender!,
        { owner, poolId: pid, value: 0n },
        initParams,
      );
      onPoolAddress(computedAddr);

      toast.update(
        pendingId,
        'Transaction sent. Waiting for the pool to confirm on-chain...',
      );
      const result = await waitForInitResult(
        network,
        wallet,
        computedAddr,
        baselineLt,
      );
      toast.dismiss(pendingId);
      if (result.status === 'success') {
        toast.info(
          `Pool deployed and initialized successfully (queryId ${result.queryId}).`,
        );
      } else if (result.status === 'bounced') {
        toast.error(
          <>
            {'Deploy & init was rejected by the contract (message bounced back). ' +
              'Re-check the parameters against the network staking limits and the owner share. '}
            {result.sendTxHash && (
              <a
                href={tonscanTxUrl(network, result.sendTxHash)}
                target="_blank"
                rel="noopener noreferrer"
                className="underline text-primary break-all"
              >
                {tonscanTxUrl(network, result.sendTxHash)}
              </a>
            )}
          </>,
        );
      } else {
        toast.warn(
          <>
            {'Transaction sent, but no confirmation was received within the timeout. ' +
              'Check the result in a block explorer. '}
            {result.sendTxHash ? (
              <a
                href={tonscanTxUrl(network, result.sendTxHash)}
                target="_blank"
                rel="noopener noreferrer"
                className="underline text-primary break-all"
              >
                {tonscanTxUrl(network, result.sendTxHash)}
              </a>
            ) : (
              `Pool address: ${computedAddr}`
            )}
          </>,
        );
      }
    } catch (e) {
      toast.dismiss(pendingId);
      toast.error(prettyError('Deploy & Initialize', e));
    } finally {
      setBusy(false);
    }
  }

  if (!sender) {
    return (
      <div className="w-full max-w-md rounded-xl border p-6 text-center">
        <p className="text-muted-foreground text-[14px]">
          {restored
            ? 'Connect your wallet to deploy and initialize the pool.'
            : 'Restoring wallet connection...'}
        </p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-xl flex flex-col gap-6 text-left">
      <section className="rounded-xl border p-5 flex flex-col gap-3">
        <h2 className="text-[15px] font-semibold">Deploy & Initialize pool</h2>
        <p className="text-muted-foreground text-[12px]">
          Deploys the pool contract and initializes it with the first validator,
          limits, and nominator settings in a single flow. The connected wallet
          is the pool owner.
        </p>
        <div className="flex flex-col gap-0.5">
          <span className="text-muted-foreground text-[12px]">
            Owner (connected wallet)
          </span>
          {owner ? (
            <AddrLink addr={owner} network={network} />
          ) : (
            <span className="font-mono text-[13px]">—</span>
          )}
        </div>
        <Field
          label="Pool ID"
          type="number"
          value={poolId}
          onChange={withClear(setPoolId, 'poolId')}
          placeholder="0"
          error={fieldErrors.poolId}
        />
        {alreadyDeployed && (
          <div className="rounded-md border border-warning/50 bg-warning/10 p-3 text-[13px] text-warning">
            A pool is already deployed at the computed address for this pool ID.
          </div>
        )}
        <Field
          label="First validator address"
          value={mainValidator}
          onChange={withClear(setMainValidator, 'mainValidator')}
          placeholder="UQ..."
          error={fieldErrors.mainValidator}
        />
        <RoundAllowanceSelect
          value={roundAllowance}
          onChange={setRoundAllowance}
        />
        <ValidatorLimitInput
          allowGlobal
          type={limitType}
          onTypeChange={setLimitType}
          tonMax={limitTonMax}
          onTonMaxChange={setLimitTonMax}
          shareMax={limitShareMax}
          onShareMaxChange={setLimitShareMax}
          shareMode={limitShareMode}
          onShareModeChange={setLimitShareMode}
          percentInput={limitPercentInput}
          onPercentInputChange={setLimitPercentInput}
          networkMinStake={networkMinStake}
          networkMaxStake={networkMaxStake}
          errorTon={fieldErrors.limitTonMax}
          errorShare={fieldErrors.limitShareMax}
          onClearError={() => {
            clearErr('limitTonMax');
            clearErr('limitShareMax');
          }}
          typeLabel="First validator limit"
        />
        <div className="grid grid-cols-2 gap-3 items-start">
          <ShareInput
            share={ownerShare}
            onShareChange={(v) => setOwnerShare(v)}
            mode={ownerShareMode}
            onModeChange={setOwnerShareMode}
            percentInput={ownerSharePercent}
            onPercentInputChange={setOwnerSharePercent}
            label="Owner share"
            subject="round profit"
            error={fieldErrors.ownerShare}
            onClearError={() => clearErr('ownerShare')}
          />
          <Field
            label="Max nominators (0..512)"
            type="number"
            value={maxNominators}
            onChange={withClear(setMaxNominators, 'maxNominators')}
            error={fieldErrors.maxNominators}
          />
        </div>
        {networkMinStake && networkMaxStake && (
          <p className="text-muted-foreground text-[12px]">
            Network range:{' '}
            <span className="font-mono">
              {fromNano(networkMinStake)} – {fromNano(networkMaxStake)} GRAM
            </span>
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Min GRAM / validator"
            type="number"
            value={minTonPerValidator}
            onChange={withClear(setMinTonPerValidator, 'minTonPerValidator')}
            error={fieldErrors.minTonPerValidator}
          />
          <Field
            label="Max GRAM / validator"
            type="number"
            value={maxTonPerValidator}
            onChange={withClear(setMaxTonPerValidator, 'maxTonPerValidator')}
            error={fieldErrors.maxTonPerValidator}
          />
        </div>
        <Field
          label="Refund bonus (GRAM)"
          type="number"
          value={refundBonus}
          onChange={withClear(setRefundBonus, 'refundBonus')}
          error={fieldErrors.refundBonus}
        />
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Min stake (GRAM)"
            type="number"
            value={minStake}
            onChange={withClear(setMinStake, 'minStake')}
            error={fieldErrors.minStake}
          />
          <Field
            label="Min withdrawable rewards (GRAM)"
            type="number"
            value={minWithdrawableRewards}
            onChange={withClear(
              setMinWithdrawableRewards,
              'minWithdrawableRewards',
            )}
            error={fieldErrors.minWithdrawableRewards}
          />
        </div>
        <WhitelistInput
          entries={whitelistEntries}
          onEntriesChange={setWhitelistEntries}
          network={network}
          label="Nominator whitelist (optional)"
        />
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Init value (GRAM, covers proxies + reserve)"
            type="number"
            value={initValue}
            onChange={withClear(setInitValue, 'initValue')}
            error={fieldErrors.initValue}
          />
        </div>
        {computedAddr && (
          <div className="flex flex-col gap-0.5">
            <span className="text-muted-foreground text-[12px]">
              Computed pool address
            </span>
            <AddrLink addr={computedAddr} network={network} />
          </div>
        )}
        <Button
          onClick={onDeployAndInit}
          disabled={busy || !mainValidator || alreadyDeployed}
        >
          {busy ? 'Working...' : 'Deploy & Initialize'}
        </Button>
      </section>
    </div>
  );
}
