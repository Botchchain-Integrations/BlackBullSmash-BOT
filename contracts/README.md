# Black Bull Smash - on-chain scores (BOT Chain testnet)

Points-only on-chain score recording for Black Bull Smash, deployed to BOT
Chain testnet (chain 968).

## Contract

`contracts/BlackBullGame.sol`

- `submitScore(uint256 score, uint256 level)` - records a run for `msg.sender`.
  Updates `totalScore`, `highScore` (never regresses), `maxLevel` (never
  regresses), `gamesPlayed`, `lastPlayedAt`. Emits `ScoreSubmitted`.
- `getPlayer(address) view` - returns the full `Player` struct.
- No token, no value transfer, no external calls. Reentrancy-safe by
  construction.

## Deployment

```sh
npm install
cp .env.example .env       # fill DEPLOYER_PRIVATE_KEY (never commit .env)
npx hardhat compile
npx hardhat run scripts/deploy.ts --network botTestnet
```

`scripts/deploy.ts` deploys, prints the explorer links, runs a read-back smoke
test, rewrites `CONTRACT_ADDRESS` in the repo-root `web3.js`, and writes
`data/deployed-address.json`.

## Verify

```sh
npx hardhat test
npx hardhat run scripts/smoke.ts --network botTestnet   # real on-chain submit + read-back
```

## Current deployment

| Field  | Value |
| ------ | ----- |
| Address | `0xc58c540fdfb24ddf06a8860766a3cd41a8cb765a` |
| Deploy tx | `0xd7d3dc7c260e287d2614fceed28bdc9cbe4958e438ec8bea66ea3c701ba1fa18` |
| Explorer | https://scan.bohr.life/address/0xc58c540fdfb24ddf06a8860766a3cd41a8cb765a |
| Chain | 968 (BOT Chain testnet), RPC https://rpc.bohr.life |

## Security notes

- Submissions are paid for by the player (their own wallet gas) and keyed to
  `msg.sender`, so scores cannot be spoofed for a different address. A player
  can still inflate their own totals by replaying `submitScore`, so treat
  leaderboard/aggregate numbers as game stats, not as verified anti-cheat
  results.
- The game frontend only submits on game over, never on level complete. A user
  who closes the tab mid-run simply does not record that run; nothing stale is
  written.