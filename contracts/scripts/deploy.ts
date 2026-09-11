import { createPublicClient, createWalletClient, http, getContract } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";

const BOT_CHAIN = {
  id: 968,
  name: "BOT Chain Testnet",
  nativeCurrency: { name: "BOT", symbol: "BOT", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.bohr.life"] }
  },
  blockExplorers: {
    default: { name: "BOT Explorer", url: "https://scan.bohr.life" }
  }
} as const;

const RPC_URL = "https://rpc.bohr.life";
const KEY = (process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`) || "";
const account = privateKeyToAccount(KEY);

const wallet = createWalletClient({
  account,
  chain: BOT_CHAIN,
  transport: http(RPC_URL)
});

const publicClient = createPublicClient({
  chain: BOT_CHAIN,
  transport: http(RPC_URL)
});

const ARTIFACT_PATH = resolve(__dirname, "../artifacts/contracts/BlackBullGame.sol/BlackBullGame.json");
const artifact = JSON.parse(readFileSync(ARTIFACT_PATH, "utf8"));

const TUSDT_ADDRESS = (process.env.TUSDT_ADDRESS as `0x${string}`) || "0x75edC9335175Fc0552D51D48439F229c10420fe3";

async function deploy() {
  console.log(`Deploying BlackBullGame from ${account.address}...`);
  console.log(`tUSDT: ${TUSDT_ADDRESS}`);

  const hash = await wallet.deployContract({
    abi: artifact.abi,
    bytecode: artifact.bytecode as `0x${string}`,
    args: [TUSDT_ADDRESS],
  });

  console.log(`Deploy tx: https://scan.bohr.life/tx/${hash}`);

  // Poll for receipt (2s intervals, 60s max)
  let receipt = null;
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 2000));
    receipt = await publicClient.getTransactionReceipt({ hash });
    if (receipt && receipt.contractAddress) break;
    if (receipt?.status === "reverted") {
      console.error("Deploy transaction reverted.");
      process.exit(1);
    }
  }

  if (!receipt || !receipt.contractAddress) {
    console.error("Deploy failed or timed out. Tx hash:", hash);
    process.exit(1);
  }

  console.log(`BlackBullGame deployed to: ${receipt.contractAddress}`);
  console.log(`Explorer: https://scan.bohr.life/address/${receipt.contractAddress}`);

  // Smoke test: read getPlayer for deployer (should be zeroed out)
  const contract = getContract({
    address: receipt.contractAddress as `0x${string}`,
    abi: artifact.abi,
    client: publicClient
  });

  const player = await contract.read.getPlayer([account.address]);
  console.log(`Smoke test (deployer's initial state):`, player);
  console.log("[expected] zeroed stats until first submitScore");

  // Write contract address back to web3.js frontend (repo root, two levels up from contracts/scripts)
  const web3Path = resolve(__dirname, "../../web3.js");
  if (existsSync(web3Path)) {
    let web3 = readFileSync(web3Path, "utf8");
    web3 = web3.replace(
      /const CONTRACT_ADDRESS = "0x[0-9a-fA-F]+";/,
      `const CONTRACT_ADDRESS = "${receipt.contractAddress}";`
    );
    writeFileSync(web3Path, web3);
    console.log("Updated web3.js with contract address.");
  }

  // Also persist deployed address for reference
  const dataDir = resolve(__dirname, "../../data");
  if (!existsSync(dataDir)) {
    require("fs").mkdirSync(dataDir, { recursive: true });
  }
  const dataPath = resolve(dataDir, "deployed-address.json");
  writeFileSync(dataPath, JSON.stringify({ address: receipt.contractAddress, txHash: hash }, null, 2));
  console.log(`Saved address to data/deployed-address.json`);
}

deploy().catch((err) => {
  console.error(err);
  process.exit(1);
});