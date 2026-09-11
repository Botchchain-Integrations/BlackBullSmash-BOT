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

const deployed = JSON.parse(
  readFileSync(resolve(__dirname, "../../data/deployed-address.json"), "utf8")
);
const ADDRESS = deployed.address as `0x${string}`;

const artifact = JSON.parse(
  readFileSync(resolve(__dirname, "../artifacts/contracts/BlackBullGame.sol/BlackBullGame.json"), "utf8")
);

const wallet = createWalletClient({ account, chain: BOT_CHAIN, transport: http(RPC_URL) });
const publicClient = createPublicClient({ chain: BOT_CHAIN, transport: http(RPC_URL) });

async function main() {
  console.log(`Contract: ${ADDRESS}`);
  console.log(`Signer:   ${account.address}`);

  const before = await publicClient.readContract({
    address: ADDRESS,
    abi: artifact.abi,
    functionName: "getPlayer",
    args: [account.address]
  });
  console.log("Before:", before);

  const testScore = 12345n;
  const testLevel = 2n;

  const hash = await wallet.writeContract({
    address: ADDRESS,
    abi: artifact.abi,
    functionName: "submitScore",
    args: [testScore, testLevel],
    account
  });
  console.log(`submitScore tx: https://scan.bohr.life/tx/${hash}`);

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`Status: ${receipt.status}, block ${receipt.blockNumber}`);

  const after = await publicClient.readContract({
    address: ADDRESS,
    abi: artifact.abi,
    functionName: "getPlayer",
    args: [account.address]
  });
  console.log("After:", after);

  const ok =
    after.totalScore === testScore &&
    after.highScore === testScore &&
    after.maxLevel === testLevel &&
    after.gamesPlayed === 1n;

  if (!ok) {
    console.error("SMOKE TEST FAILED: on-chain state did not match submission.");
    process.exit(1);
  }
  console.log("SMOKE TEST PASSED: score, level, gamesPlayed and highScore recorded correctly on-chain.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
