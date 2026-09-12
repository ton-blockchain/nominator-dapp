# Nominator Pool DApp

A web frontend for the TON Nominator Pool smart contract. Deploy, initialize,
and manage a nominator pool — add validators, recover stakes, adjust limits,
manage the nominator whitelist, and inspect per-round economics.

Built with React, Vite, Tailwind CSS, and TonConnect for wallet interaction.

## Key concepts

| Term                   | Meaning                                                                                                                                                                                  |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Pool**               | The nominator pool smart contract. Collects funds from nominators, stakes them via validators, and distributes rewards.                                                                  |
| **Owner**              | The wallet that deployed the pool. Controls owner-only operations (add/remove validators, update limits, withdraw rewards).                                                              |
| **Validator**          | A node that stakes GRAM on behalf of the pool to secure the network and earn rewards. Each validator has one or two proxies.                                                             |
| **Nominator**          | Someone who deposits GRAM into the pool. Their funds are staked by validators; they earn a share of rewards proportional to their deposit.                                               |
| **Round**              | An elector staking cycle. The pool participates in rounds, staking and recovering funds each cycle.                                                                                      |
| **Round allowance**    | Which rounds a validator participates in: odd (1), even (2), or all (3). Determines how many proxies the validator has. See [Step 3](#step-3-add-the-remaining-2-validators).            |
| **Parity**             | Whether a round is odd or even. Validators with allowance 1 or 2 only participate in their matching parity.                                                                              |
| **Proxy**              | An intermediary contract between the pool and the elector. Each parity has its own proxy (so an all-round validator has two).                                                            |
| **Projected balance**  | The pool's initial balance before any stakes are sent, minus unprocessed pending deposits. Roughly what will be available to stake at the beginning of the round.                        |
| **Share max**          | A per-validator limit expressed as a fraction of the projected balance that the validator can stake in a single round. See [Step 3](#step-3-add-the-remaining-2-validators).             |
| **GRAM max**           | A per-validator limit expressed as a hard GRAM cap per round.                                                                                                                            |
| **Owner share**        | The fraction of round profit the pool owner receives (the rest goes to nominators). Expressed in share units (0..SHARE_BASE).                                                            |
| **SHARE_BASE**         | The maximum share value (16777216 = 2^24). Used internally for fixed-point share math. 100% = SHARE_BASE.                                                                                |
| **Refund bonus**       | A reward paid to validators for profitable rounds. See [Refund bonus calculation](#refund-bonus-calculation).                                                                            |
| **Stake / NewStake**   | The act of sending GRAM to the elector to participate in validation. Validators do this automatically each round.                                                                        |
| **RecoverStake**       | Retrieving staked GRAM back from the elector after a round ends. Normally automatic; can be triggered manually — see [Emergency recovery](#emergency-recovery-when-a-validator-is-down). |
| **UpdateVset**         | Advancing the pool's validator set to the current round. Normally automatic; can be triggered manually — see [Emergency recovery](#emergency-recovery-when-a-validator-is-down).         |
| **Pending deposit**    | GRAM a nominator has sent but that hasn't been credited to their balance yet (processed at the next round transition).                                                                   |
| **Pending withdrawal** | GRAM a nominator has requested to withdraw but that hasn't been paid out yet (processed at the next round transition).                                                                   |
| **Pool supply**        | The total GRAM tracked by the pool — sum of all nominator shares plus pending withdrawals.                                                                                               |
| **Invariants**         | Self-audit checks that compare cached aggregates against independently recomputed values. See [Troubleshooting](#invariant-check-failures).                                              |

## Quick start

Copy `.env.example` to `.env` and fill in Toncenter API keys for read access.

```bash
npm ci          # install deps
npm run dev     # start dev server (http://localhost:5173)
```

For production:

```bash
npm run build   # build to dist/
```

Then host dist static files on github pages or any other static hosting.

## Network selection

The connected wallet's chain auto-selects mainnet or testnet.

## Wallet

Click **Connect Wallet** (TonConnect) in the top-right. The connected wallet
becomes the pool owner for deployment and signs all transactions. Its address
is shown under the title, and the owner-status line appears once a valid pool
address is entered.

---

## Pool selector

Enter an existing pool address at the top to load its state across the
Operations, Round Info, and Pool Info tabs.

---

## Tabs

### Deploy & Init

Deploys and configures the pool in a single transaction. The connected
wallet becomes the pool owner. You set the pool ID, main validator address,
its [round allowance](#step-3-add-the-remaining-2-validators), an optional
per-validator limit, the [owner share](#key-concepts), the per-validator
staking range, the refund bonus, nominator settings, and the init value.
The computed pool address is shown live as you edit.

### Operations

Requires a valid pool address and a connected wallet. Organized into three
groups:

#### Pool

- **Add Funds** — Deposits GRAM into the pool's balance. Anyone can do this.
- **Owner Withdrawal** — Withdraws GRAM from the owner's accumulated share of
  rewards. Owner-only.

#### Validators

- **Add Validator** — Registers a new validator with the pool. You choose
  its round allowance and optionally apply an individual staking limit
  (GRAM max or share max) that overrides the pool's global limits.
- **Remove Validator** — Removes a validator from the pool so it no longer
  participates in future rounds. Owner-only.
- **Global Validator Limits** — Sets the pool-wide min/max GRAM per
  validator and the refund bonus. Must stay within the network's staking
  range. Owner-only.
- **Individual Validator Limit** — Overrides the global limits for a single
  validator. Can also be used to [soft-ban](#soft-ban-temporarily-disabling-a-validator)
  a validator by setting its share to 0%. Owner-only.
- **Recover Stake** — Emergency: triggers stake recovery from the elector
  on behalf of an offline validator. Anyone can send this. See
  [Emergency recovery](#emergency-recovery-when-a-validator-is-down).
- **Update Vset** — Emergency: advances the pool's validator set to the
  current round. Anyone can send this. See
  [Emergency recovery](#emergency-recovery-when-a-validator-is-down).

#### Nominators

- **Nominator Limits** — Sets the max nominator count and min stake.
  Owner-only.
- **Nominator Whitelist** — Restricts deposits to a specific list of
  addresses. An empty list opens the pool to everyone. Owner-only.
- **Evict Nominator** — Forces a nominator to exit the pool at the end of the
  round. Their whole share is queued as a pending withdrawal and paid out via
  the pending payout chain. Owner-only. See
  [Evicting a nominator](#evicting-a-nominator).

### Round Info

Shows the pool's staking economics round by round — totals across all
completed rounds, a per-round profit/loss bar chart, a per-round stats
table (expandable to show per-validator splits), and per-validator
aggregated stats with a profit-share donut chart.

### Pool Info

Shows the pool's current on-chain state — pool state, global validator
limits, nominator settings, [invariants](#invariant-check-failures),
per-validator info (role, usage, limits, projected stakeable), and a
nominator lookup by address.

---

## Step-by-step: Deploy and set up a pool with 3 validators and a whitelist

This guide walks through deploying a new pool, adding 3 validators (each
participating in all rounds), and whitelisting 3 nominators. The whitelist
step is **optional** — skip it if you want the pool open to everyone.

### Prerequisites

- A TON wallet with enough GRAM to cover deployment, proxy creation, and
  message fees (a few hundred GRAM is plenty on testnet).
- The dApp running (`npm run dev`) and open in your browser.
- Validator machines already running each with MyTonCtrl installed in `nominator-pool-v2` mode (See instructions below)

### MyTonCtrl setup

On each validator machine install MyTonCtrl in `nominator-pool-v2`
mode and set up the node as described in 1.1 - 3.5 of
[this article](https://docs.ton.org/nodes/cpp/run-validator).
You'll need validator wallet's address from each validator to configure the pool.
This is the address of the validator wallet that MyTonCtrl created on each validator machine and uses to interact with the pool.

Open the console and read the address off `status`:

```
MyTonCtrl> status
...
Local validator wallet address: Ef...
```

Or list it directly in the `validator_wallet_001` row:

```
MyTonCtrl> wl
Name                   Status  Balance  Ver  Wch  Address
validator_wallet_001   active  ...      v1   -1   Ef...
```

Collect one such address per machine. You need to top them up with a small GRAM amount to keep the pool working.
A reference value is 3 GRAM per round. See [Refund bonus calculation](#refund-bonus-calculation).
The pool automatically refunds `refundBonus` to the wallets, so it is enough to top them up once as long as rounds are profitable.
In unprofitable rounds, the validator doesn't get the bonus back, so its expenses are not compensated.

### Step 1: Connect your wallet

1. Click **Connect Wallet** in the top-right corner.
2. Choose your wallet app and approve the connection.
3. Your wallet address appears under the title. This wallet is the **pool
   owner** — it will sign all transactions and control the pool.

### Step 2: Deploy the pool

1. Click the **Deploy & Init** tab.
2. **Pool ID** — leave it as `0` (or pick any number; it only affects the
   contract address).
3. **Main validator address** — paste the address of your first validator.
   This validator is added automatically during initialization.
4. **Main validator limit** — set to **Share max** at `16.66`%. This is
   each validator's share of the pool balance per round — see Step 3 for the
   reasoning.
5. **Owner share** — set the percentage of rewards the pool owner receives.
   The default is `50.00`%. You can switch to raw share mode if needed. The
   info line below shows the resulting raw share value.
6. **Max nominators (0..512)** — set to `512` (or lower if you want a
   smaller pool).
7. **Max GRAM / validator** — set the maximum GRAM each validator can stake
   (e.g. `10000000` for 10 million GRAM).
8. **Min GRAM / validator** — set the minimum (e.g. `300000`).
9. **Refund bonus (GRAM)** — the profitability [reward](#refund-bonus-calculation) per round.
10. **Min stake (GRAM)** — the minimum GRAM a nominator must deposit
    (e.g. `1000`).
11. **Min withdrawable rewards (GRAM)** — the minimum reward amount that can
    be withdrawn (e.g. `1`).
12. **Init value (GRAM)** — the GRAM sent with the deploy transaction to cover
    proxy storage reserves (10 TON per proxy) and owner punishment reserves
    per validator slot. For deploying with 2 validator slots (the main
    validator's odd + even proxies): `250`.
13. Check the **Computed pool address** shown above the button — this is the
    address your pool will have. You can verify it before sending.
14. Click **Deploy & Initialize**.
15. Approve the transaction in your wallet.
16. Wait for the toast confirmation. The pool address is automatically filled
    into the pool selector at the top.

### Step 3: Add the remaining 2 validators

You now have 1 validator (the main one from Step 2). Add 2 more:

1. Click the **Operations** tab.
2. In the **Validators** section, click **Add Validator**.
3. **Validator address** — paste the second validator's address.
4. **Round allowance** — choose **All rounds** (allowance 3). This means the
   validator participates in both odd and even rounds via two proxies.
5. **Per-validator limit** — set to **Share max** at `16.66`%.
   - **Share max** is a fraction of the total pool balance that the validator
     can stake in a single round.

   **How share max works:**
   The share max is a **per-round** limit. Each all-round validator (allowance 3) has two proxies (odd + even), so it competes on both parities. With N
   all-round validators there are 2×N competing slots — divide `100%` evenly
   among them.
   - **3 validators** (this guide): 2×3 = 6 slots → `100% / 6 ≈ 16.66`% each.
   - **2 validators**: 2×2 = 4 slots → `100% / 4 = 25.00`% each.
   - **1 validator**: 2×1 = 2 slots → `100% / 2 = 50.00`% (the validator can
     use half the pool in each round — one proxy stakes in odd rounds, the
     other in even rounds, so they never overlap).

   If using **round allowance 1 (odd) or 2 (even)** instead, each validator
   has only one proxy and participates in a single parity. Since the pool
   balance must cover both parities across rounds, each validator should get
   `100% / (2 × N)` where N is the number of validators on the **same**
   parity. For example, one odd-only and one even-only validator (N=1 each)
   → `50.00`% each. Two odd-only and one even-only → odd ones get `33.33`%
   each, even one gets `50.00`%.

6. **Message value (GRAM)** — set to `250` (covers proxy storage reserves
   and owner punishment reserves for 2 validator slots).
7. Click **Add validator** and approve in your wallet.
8. Wait for the toast confirmation.
9. Repeat steps 3–7 for the third validator.

> **Note:** Round allowance options are: **1** = odd rounds only, **2** = even
> rounds only, **3** = all rounds (both parities, two proxies per validator).

### Step 4: Add owner funds to the pool (optional but recommended)

Before validators can stake, the pool needs a GRAM balance:

1. In the **Pool** section, click **Add Funds**.
2. **Amount (GRAM)** — enter how much GRAM to deposit (e.g. `1000000`).
3. Click **Add funds** and approve in your wallet.

> **How nominators stake:** Once the pool is funded, nominators deposit GRAM
> by sending a simple transfer with the comment `d` (the deposit message
> body) to the pool address. Any wallet app can do this — the dApp itself
> doesn't have a nominator deposit button. If a whitelist is active, only
> whitelisted addresses can deposit; others will be bounced. Nominators can
> withdraw by sending a transfer with the comment `w` (withdrawal) or `r`
> (withdraw rewards). Their deposits and rewards are tracked automatically
> by the pool contract.

### Step 5: Whitelist 3 nominators (optional)

> This step is **optional**. If you skip it, the pool is open to all
> nominators. Only do this if you want to restrict deposits to specific
> addresses.

1. In the **Nominators** section, click **Nominator Whitelist**.
2. In the input box, paste the first nominator's address (in `UQ…` format).
3. Click **Add**. The address appears in the list below.
4. Repeat for the second and third nominator addresses.
5. **Message value (GRAM)** — set to `1` (covers the transaction fee).
6. Click **Update whitelist** and approve in your wallet.
7. Wait for the toast confirmation. Only these 3 addresses can now deposit
   into the pool.

> To remove the whitelist later, clear all entries and click
> **Update whitelist** — an empty list opens the pool to everyone.

### Step 6: Verify your setup

1. Click the **Pool Info** tab.
2. Check **Pool state** — verify the owner address matches your wallet, the
   pool ID is correct, and the balance reflects your Add Funds deposit.
3. Scroll to **Validator info** — select each validator from the dropdown to
   confirm all 3 are present with the correct round parity and limits.
4. If you set up a whitelist, scroll to confirm the nominator settings show
   the correct min stake and max nominators.

### Step 7: Run in MyTonCtrl

On **every** validator machine, import the created pool using command

```
MyTonCtrl> import_pool <pool_name> <pool_addr>
```

and verify it with

```
MyTonCtrl> pools_list
```

- `<pool_name>` is any local label you like.
- `pools_list` should show the pool as `active` with version `npool_v2`.

The validators will start to send stake amounts as configured in the pool.

### You're done!

Your pool is deployed with 3 validators, funded, and (optionally) restricted
to 3 whitelisted nominators. From here, day-to-day operations are handled
automatically by the validators:

- **Staking and round transitions** — validators send `NewStake` and
  `UpdateVset` messages automatically each round. The pool rotates its
  validator set without manual intervention.
- **Stake recovery** — validators recover their own stakes after rounds
  complete. The `Recover Stake` and `Update Vset` buttons in the dApp are
  **emergency tools** for when a validator is unavailable (see the
  Emergency Recovery chapter below).
- **Monitor rounds** in the **Round Info** tab to track profit/loss per round
  and per validator.
- **Withdraw rewards** as the owner via **Owner Withdrawal**.
- **Adjust limits** globally or per-validator at any time.

---

## Refund bonus calculation

On a profitable round, the validator gets a bonus that is supposed to compensate
for its operational upkeep.
On an unprofitable round, the validator's upkeep is not compensated.

The profitability criterion is that profit should exceed `refundBonus - 1 GRAM`.

Validator expenses consist of the following components:

1. New Stake expenses: **1 GRAM**.
2. Recover Stake expenses: **1 GRAM**
3. External upkeep costs like wallet storage, signing gas, and forwarding fees

So **3 GRAM** is considered a reasonable default for a _masterchain_ validator.

In that case, 2 profitable rounds cover the losses of 1 unprofitable round.

## Emergency recovery: when a validator is down

Normally validators handle staking, round transitions, and stake recovery
automatically — the pool's `UpdateVset`, `NewStake`, and `RecoverStake`
messages are sent by the validator's own software each round. You should not
need to touch the **Update Vset** or **Recover Stake** actions during normal
operation.

However, if a validator's server goes down or its wallet becomes
inaccessible, the pool can get stuck: rounds may not transition, and stakes
may not be recovered. The dApp provides two emergency tools for this
scenario. **Neither requires the validator's wallet** — anyone can send them.

### Scenario: validator server is down, rounds not advancing

When a validator is offline, it stops sending `UpdateVset` messages. The
pool's validator set gets stuck on the previous round and cannot rotate.

1. Click the **Operations** tab.
2. In the **Validators** section, click **Update Vset**.
3. **Message value (GRAM)** — set to `1` (covers the transaction fee).
4. Click **Update vset** and approve in your wallet.
5. This advances the pool's validator set to the current round, unblocking
   round rotation. Repeat if the pool falls behind again (e.g. while the
   validator remains down).

### Scenario: stake not recovered after a round

When a validator is offline, it cannot recover its own stake from the
elector after a round ends. The stuck stake reduces the pool's available
balance. Anyone can trigger recovery on the validator's behalf:

1. Click the **Operations** tab.
2. In the **Validators** section, click **Recover Stake**.
3. **Validator address** — paste the address of the offline validator (or
   select it from the dropdown if it's in the pool's validator list).
4. **Recovery message value (GRAM, max 1)** — the value attached to the
   stake recovery message forwarded to the elector. This is **not** the
   amount of stake to recover — it's the forwarding value, capped at 1 GRAM.
   The default of `1` is correct in virtually all cases.
5. **Message value (GRAM)** — must cover the recovery message value plus
   gas fees. The default of `2` (covering a recovery value of `1` plus gas)
   is correct in virtually all cases; lowering it risks the contract bouncing
   the message.
6. Click **Recover stake** and approve in your wallet.
7. The recovered stake returns to the pool balance. Repeat for each round
   the validator missed.

### When to remove the validator

If the validator is permanently offline, remove it from the pool so it
stops being assigned to future rounds:

1. In the **Validators** section, click **Remove Validator**.
2. **Validator address** — paste or select the offline validator.
3. **Message value (GRAM)** — set to `1`.
4. Click **Remove validator** and approve in your wallet.
5. Add a replacement validator via **Add Validator** if needed.

### Soft ban: temporarily disabling a validator

Sometimes you want to stop a validator from staking without removing it from
the pool — for example, if it's misbehaving or under maintenance but expected
to return. Instead of removing it, set its individual share limit to zero:

1. In the **Validators** section, click **Individual Validator Limit**.
2. Select the validator from the dropdown.
3. Choose **Share max** as the limit type.
4. Set the percentage to `0.00`%.
5. **Message value (GRAM)** — set to `1`.
6. Click **Update limit** and approve in your wallet.

The validator remains in the pool but can no longer stake in any round. Its
existing stakes will still be recovered normally. To lift the soft ban,
repeat the steps with a non-zero share (e.g. `16.66`%).

> **Note:** You can also use a **GRAM max** of `0` for the same effect, but
> share-based is more intuitive since `0.00`% clearly means "nothing".

### Evicting a nominator

The owner can force a nominator out of the pool, for example, if you want to enforce the whitelist
on the already running pool and some nominators don't fit it, or simply perform faster pool migration.
Eviction queues the nominator's **entire** share as a
pending withdrawal, to be paid out through the pending payout chain at the next
clean round boundary (it does not pay out instantly).

1. In the **Nominators** section, click **Evict Nominator**.
2. **Nominator address** paste the address of the nominator to remove. If the
   address is a current pool nominator, the panel previews its `amount` and
   `reward` (and flags a pending deposit or an already-pending withdrawal).
3. **Message value (GRAM)** must cover the withdrawal gas. The default of
   `1` is well above the contract's `WITHDRAWAL_GAS` (0.2 TON) and is safe in
   all cases; the leftover value is refunded to the sender.
4. Click **Evict nominator** and approve in your wallet.

The operation is
owner-only and may itself rotate the round.

---

## Troubleshooting

### Transaction bounced or refund with error code

If a transaction fails, the dApp shows a detailed error toast explaining
what went wrong — read the error message there for the specific cause.
Failed transactions are either **bounced** (funds returned minus gas) or
**refunded with an error code** (the pool sends a `RefundMessage` back with
a decoded error code describing why it was rejected). Either way, the toast
tells you what happened and what to fix.

### Validator stuck

If a validator goes offline, it stops sending `UpdateVset` and
`RecoverStake` messages, so the pool's round index stops advancing and
stakes may not be recovered. See the **Emergency recovery** chapter above
for manual `Update Vset` and `Recover Stake` steps.

### Invariant check failures

To view the invariants, click the **Pool Info** tab and scroll to the
**Nominators & invariants** section. This is a built-in self-audit: the
pool stores cached aggregates (total supply, pending deposits, pending
withdrawals, nominator count) that are updated incrementally as operations
happen. The `get_pool_invariants` getter independently recomputes these
from the primary nominator map and compares them.

The four checks:

- **Supply match** — `sum(all nominator shares) + sum(all pending
withdrawals) == poolSupply`. This is the core accounting invariant. Note:
  pending withdrawal shares are deducted from `nominator.share` at request
  time but remain in `poolSupply` until the payout burns them, so the
  formula includes both.
- **Pending withdrawals match** — `sum(all nominator pending withdrawals)
== storage.pendingWithdrawals`.
- **Pending deposits match** — `sum(all nominator pending deposits) ==
storage.pendingDeposits`.
- **Nominator count match** — `count(nominators in the map) ==
nominators.nmCount`.

**All invariants match (✓):** The pool's accounting is consistent. This is
the normal state.

**Any invariant fails (✗):** A cached aggregate has drifted from the
recomputed value. This should never happen under normal operation. If you
see a mismatch:

- Click **Refresh** in the Pool Info tab — a transient indexer delay can
  cause a false mismatch.
- If it persists, it's a diagnostic signal worth reporting — the pool's
  internal accounting may be inconsistent.

The section also shows **nominatorsAmount** and **projectedBalance**
alongside the recomputed values. These are transparency data for off-chain
solvency monitoring, not pass/fail checks.

**Why `nominatorsAmount` is not checked:** `nominatorsAmount` is a primary
state variable with no per-nominator mirror to recompute from. It is moved
globally by profit/loss at `RecoverStakeOk` and has no independent
counterpart. Additionally, `tonAmount` (the sum of deposit-time baselines)
is subtracted from a nominator's record when their stake goes into full
pending withdrawal, so `tonAmount` can theoretically fall below `poolSupply`
— which is why neither aggregate has a non-tautological invariant and both
are exposed as transparency data rather than checked.

---

## Notifications

Transaction results (sent, confirmed, failed, bounced) appear as toasts at
the top of the screen. Errors stay until dismissed; informational messages
auto-dismiss after a few seconds.

## CI

`.github/workflows/dapp.yml` runs `npm ci`, `npm run fmt:check`,
`npm run typecheck`, `npm run build`, and `npm run test`.
