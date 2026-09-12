import { useEffect, useState } from 'react';
import { fromNano } from '@ton/core';
import { useQuery } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/form';
import { usePoolOps } from './PoolOpsContext';
import { useFieldErrors } from './useFieldErrors';
import {
  getNominatorMinimalStake,
  getValidators,
  updateNominatorLimits,
  validateGramInput,
  validateNumberInput,
} from '@/lib/pool';

export function UpdateNominatorLimitsPanel() {
  const { network, poolAddress, sender, isOwner, busy, run } = usePoolOps();
  const { fieldErrors, setErr, clearErr, withClear, clearAllErr } =
    useFieldErrors();

  // nominator limits
  const [maxNominators, setMaxNominators] = useState('512');
  const [minStake, setMinStake] = useState('1000');
  const [msgValue, setMsgValue] = useState('1');

  // Fetch the pool's validators — getValidators calls get_pool_data internally,
  // so it also returns the pool's current maxNominators, reused here to
  // populate the form instead of a separate get_pool_data call.
  const { data: validatorsData } = useQuery({
    queryKey: ['pool-validators', network, poolAddress],
    enabled: !!poolAddress,
    queryFn: () => getValidators(network, poolAddress),
  });
  const poolMaxNominators = validatorsData?.maxNominators;

  // Fetch the pool's current nominator min stake so the form can show the
  // on-chain value. maxNominators is reused from the validators query above.
  const { data: nominatorMinStake } = useQuery({
    queryKey: ['pool-nominator-min-stake', network, poolAddress],
    enabled: !!poolAddress,
    queryFn: () => getNominatorMinimalStake(network, poolAddress),
  });

  // Populate the nominator limits form with the pool's current values when
  // they're first loaded, so the user sees what's on-chain rather than
  // hardcoded placeholders.
  useEffect(() => {
    if (poolMaxNominators !== undefined) {
      setMaxNominators(poolMaxNominators.toString());
    }
  }, [poolMaxNominators]);
  useEffect(() => {
    if (nominatorMinStake) {
      setMinStake(fromNano(nominatorMinStake.minStake));
    }
  }, [nominatorMinStake]);

  function onUpdateNominatorLimits() {
    const mn = validateNumberInput(
      maxNominators,
      'maxNominators',
      setErr,
      clearErr,
    );
    if (mn === null) return;
    if (mn < 0 || mn > 512) {
      setErr('maxNominators', 'Must be in 0..512.');
      return;
    }
    const stake = validateGramInput(minStake, 'minStake', setErr, clearErr);
    if (stake === null) return;
    const value = validateGramInput(msgValue, 'msgValue', setErr, clearErr);
    if (value === null) return;
    clearAllErr();
    run('Update nominator limits', () =>
      updateNominatorLimits(network, sender, {
        poolAddress,
        maxNominators: mn,
        minStake: stake,
        value,
      }),
    );
  }

  return (
    <>
      <h2 className="text-[15px] font-semibold">Update nominator limits</h2>
      <div className="grid grid-cols-2 gap-3 items-start">
        <Field
          label="Max nominators (0..512)"
          type="number"
          value={maxNominators}
          onChange={withClear(setMaxNominators, 'maxNominators')}
          error={fieldErrors.maxNominators}
        />
        <Field
          label="Min stake (GRAM)"
          type="number"
          value={minStake}
          onChange={withClear(setMinStake, 'minStake')}
          error={fieldErrors.minStake}
        />
      </div>
      <Field
        label="Message value (GRAM)"
        type="number"
        value={msgValue}
        onChange={withClear(setMsgValue, 'msgValue')}
        error={fieldErrors.msgValue}
      />
      <Button onClick={onUpdateNominatorLimits} disabled={busy || !isOwner}>
        Update limits{!isOwner && ' (not owner)'}
      </Button>
    </>
  );
}
