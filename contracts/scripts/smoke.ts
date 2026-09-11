import { createPublicClient, createWalletClient, http, getContract } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { readFileSync } from "fs";
import { resolve } from "path";

const BOT_CHAIN = {
  id: 968,
  name: "BOT Chain Testnet",
  nativeCurrency: { name: "BOT", symbol: "BOT", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.bohr.life"] } },
  blockExplorers: { default: { name: "BOT Explorer", url: "https://scan.bohr.life" } }
} as const;

const RPC_URL = "https://rpc.bohr.life";
const KEY = (process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`) || "";
const account = privateKeyToAccount(KEY);

// Throwaway EOA for the player-flow test so smoke is re-runnable
// (deployer lands in the 5-min rate limit after one run).
const TEST_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const testAccount = privateKeyToAccount(TEST_KEY);

const TUSDT = "0x75edC9335175Fc0552D51D48439F229c10420fe3";

const deployed = JSON.parse(
  readFileSync(resolve(__dirname, "../../data/deployed-address.json"), "utf8")
);
const ADDRESS = deployed.address as `0x${string}`;

const artifact = JSON.parse(
  readFileSync(resolve(__dirname, "../artifacts/contracts/BlackBullGame.sol/BlackBullGame.json"), "utf8")
);

const wallet = createWalletClient({ account, chain: BOT_CHAIN, transport: http(RPC_URL) });
const publicClient = createPublicClient({ chain: BOT_CHAIN, transport: http(RPC_URL) });

const ERC20_ABI = [
  { name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { name: "approve", type: "function", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }] }
];

async function main() {
  console.log(`Contract: ${ADDRESS}`);
  console.log(`Signer:   ${account.address} (treasury/deployer)`);
  console.log(`Player:   ${testAccount.address} (throwaway EOA)`);

  // 0. Top up the throwaway EOA with tBOT for gas
  const testBal = await publicClient.getBalance({ address: testAccount.address });
  if (testBal < 1_000_000_000_000_000_000n) {
    const gasHash = await wallet.sendTransaction({
      to: testAccount.address,
      value: 1_000_000_000_000_000_000n, // 1 tBOT
      account
    });
    await publicClient.waitForTransactionReceipt({ hash: gasHash });
    console.log(`Gas top-up tx: https://scan.bohr.life/tx/${gasHash}`);
  }

  const playerWallet = createWalletClient({ account: testAccount, chain: BOT_CHAIN, transport: http(RPC_URL) });

  // 1. Fund the treasury with 50 tUSDT from deployer
  const fundAmount = 50_000_000n; // 50 tUSDT (6 decimals)
  const approveHash = await wallet.writeContract({
    address: TUSDT,
    abi: ERC20_ABI,
    functionName: "approve",
    args: [ADDRESS, fundAmount],
    account
  });
  await publicClient.waitForTransactionReceipt({ hash: approveHash });
  console.log(`Approve tx: https://scan.bohr.life/tx/${approveHash}`);

  const fundHash = await wallet.writeContract({
    address: ADDRESS,
    abi: artifact.abi,
    functionName: "fund",
    args: [fundAmount],
    account
  });
  await publicClient.waitForTransactionReceipt({ hash: fundHash });
  console.log(`Fund tx: https://scan.bohr.life/tx/${fundHash}`);
  const treasury = await publicClient.readContract({
    address: ADDRESS, abi: artifact.abi, functionName: "treasuryBalance"
  });
  console.log(`Treasury funded: ${Number(treasury) / 1e6} tUSDT`);

  // 2. Player's own tUSDT balance before
  const before = await publicClient.readContract({
    address: TUSDT, abi: ERC20_ABI, functionName: "balanceOf", args: [testAccount.address]
  });

  // 3. Submit a score that earns a payout
  const testScore = 12_345n;
  const testLevel = 3n;
  const hash = await playerWallet.writeContract({
    address: ADDRESS,
    abi: artifact.abi,
    functionName: "submitScore",
    args: [testScore, testLevel],
    account: testAccount
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`submitScore tx: https://scan.bohr.life/tx/${hash}`);

  const after = await publicClient.readContract({
    address: TUSDT, abi: ERC20_ABI, functionName: "balanceOf", args: [testAccount.address]
  });
  const payoutDelta = after - before;
  const expectedPayout = (testScore * BigInt(1e6)) / 1000n;
  const expectedCapped = expectedPayout > 10_000_000n ? 10_000_000n : expectedPayout;
  console.log(`Payout received: +${Number(payoutDelta) / 1e6} tUSDT (expected ${Number(expectedCapped) / 1e6})`);

  const p = await publicClient.readContract({
    address: ADDRESS,
    abi: artifact.abi,
    functionName: "getPlayer",
    args: [testAccount.address]
  });
  console.log("Player state:", p);

  const ok =
    receipt.status === "success" &&
    p.totalScore === testScore &&
    p.gamesPlayed === 1n &&
    p.totalPayout === expectedCapped;

  // 4. Verify the level cap rejection works on-chain
  let capRejected = false;
  try {
    await playerWallet.writeContract({
      address: ADDRESS,
      abi: artifact.abi,
      functionName: "submitScore",
      args: [999_999n, 5n],
      account: testAccount
    });
  } catch {
    capRejected = true;
  }

  if (!capRejected) {
    console.error("SMOKE TEST FAILED: score over cap was NOT rejected.");
    process.exit(1);
  }

  if (!ok) {
    console.error("SMOKE TEST FAILED: on-chain state did not match submission.");
    process.exit(1);
  }
  console.log("SMOKE TEST PASSED: payout, state recording, and level-cap rejection all verified on-chain.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});