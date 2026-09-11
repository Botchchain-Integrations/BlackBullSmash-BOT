import { createPublicClient, createWalletClient, custom, http, defineChain } from "https://esm.sh/viem@2.51.0";

const BOT_CHAIN = defineChain({
  id: 968,
  name: "BOT Chain Testnet",
  nativeCurrency: { name: "BOT", symbol: "BOT", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.bohr.life"] }
  },
  blockExplorers: {
    default: { name: "BOT Explorer", url: "https://scan.bohr.life" }
  }
});

const RPC_URL = "https://rpc.bohr.life";
const EXPLORER_URL = "https://scan.bohr.life";

// Replaced by contracts/scripts/deploy.ts after deployment.
const CONTRACT_ADDRESS = "0xd012b13bfa1bd505a3a066b16bd7162ed392c420";
const TO_BE_DEPLOYED = CONTRACT_ADDRESS === "0x0000000000000000000000000000000000000000";

const GAME_ABI = [
  {
    inputs: [{ internalType: "address", name: "player", type: "address" }],
    name: "getPlayer",
    outputs: [
      { internalType: "uint256", name: "totalScore", type: "uint256" },
      { internalType: "uint256", name: "highScore", type: "uint256" },
      { internalType: "uint256", name: "maxLevel", type: "uint256" },
      { internalType: "uint256", name: "gamesPlayed", type: "uint256" },
      { internalType: "uint256", name: "lastPlayedAt", type: "uint256" },
      { internalType: "uint256", name: "totalPayout", type: "uint256" }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      { internalType: "uint256", name: "score", type: "uint256" },
      { internalType: "uint256", name: "level", type: "uint256" }
    ],
    name: "submitScore",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [],
    name: "treasuryBalance",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ internalType: "uint256", name: "amount", type: "uint256" }],
    name: "fund",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [{ internalType: "uint256", name: "level", type: "uint256" }],
    name: "levelCaps",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  }
];

const publicClient = createPublicClient({
  chain: BOT_CHAIN,
  transport: http(RPC_URL)
});

let connectedAccount = null;
let walletClient = null;

function shortAddr(addr) {
  return addr.slice(0, 6) + "..." + addr.slice(-4);
}

function createPanel() {
  if (document.getElementById("web3-panel")) return document.getElementById("web3-panel");
  const panel = document.createElement("div");
  panel.id = "web3-panel";
  panel.className = "web3-panel";
  panel.innerHTML = `
    <button id="web3-connect-btn" class="neon-btn web3-connect">CONNECT BOT WALLET</button>
    <div id="web3-status" class="web3-status hidden"></div>
  `;
  document.getElementById("start-screen").appendChild(panel);

  document.getElementById("web3-connect-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    if (connectedAccount) {
      renderConnected();
    } else {
      connectWallet().catch((err) => showError(err.message || String(err)));
    }
  });
  return panel;
}

function createSubmitStatus() {
  if (document.getElementById("submit-status")) return;
  const status = document.createElement("div");
  status.id = "submit-status";
  status.className = "submit-status hidden";
  document.getElementById("game-over-screen").insertBefore(
    status,
    document.getElementById("game-over-screen").querySelector(".game-over-btns")
  );
  return status;
}

function showError(msg) {
  const el = document.getElementById("web3-status");
  if (el) {
    el.textContent = "⚠ " + msg;
    el.classList.remove("hidden");
  }
}

function showStatus(msg, isGood) {
  const el = document.getElementById("web3-status");
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle("hidden", !msg);
  el.style.color = isGood ? "#00ff88" : "#ff3366";
}

function setSubmitStatus(msg, link) {
  const el = document.getElementById("submit-status");
  if (!el) return;
  el.innerHTML = "";
  const text = document.createElement("span");
  text.textContent = msg;
  el.appendChild(text);
  if (link) {
    const a = document.createElement("a");
    a.href = link;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = "View on BOT Explorer";
    a.className = "tx-link";
    el.appendChild(a);
  }
  el.classList.remove("hidden");
}

async function ensureChain() {
  if (!window.ethereum) throw new Error("No injected wallet found. Install MetaMask or a BOT-compatible wallet.");
  if (!walletClient) {
    walletClient = createWalletClient({
      chain: BOT_CHAIN,
      transport: custom(window.ethereum)
    });
  }
  try {
    await walletClient.switchChain({ id: 968 });
  } catch (e) {
    await walletClient.addChain({
      chain: BOT_CHAIN
    });
    await walletClient.switchChain({ id: 968 });
  }
}

async function connectWallet() {
  if (!window.ethereum) {
    showError("No injected wallet found. Install a BOT-compatible wallet and reload.");
    throw new Error("no wallet");
  }
  createSubmitStatus();
  walletClient = createWalletClient({
    chain: BOT_CHAIN,
    transport: custom(window.ethereum)
  });

  const [account] = await walletClient.requestAddresses();
  if (!account) throw new Error("No account authorized.");

  try {
    await ensureChain();
  } catch (e) {
    showError("Could not switch to BOT Chain (968). Please switch in your wallet.");
  }

  connectedAccount = account;
  renderConnected();
  return account;
}

async function fetchPlayer() {
  if (TO_BE_DEPLOYED || !connectedAccount) return null;
  try {
    return await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi: GAME_ABI,
      functionName: "getPlayer",
      args: [connectedAccount]
    });
  } catch (e) {
    return null;
  }
}

async function renderConnected() {
  const btn = document.getElementById("web3-connect-btn");
  if (!btn) return;
  btn.textContent = shortAddr(connectedAccount);
  btn.classList.add("connected");

  if (TO_BE_DEPLOYED) {
    showStatus("BOT wallet connected. Game contract is not deployed yet.", false);
    return;
  }

  const p = await fetchPlayer();
  if (p) {
    const payout = (Number(p[5]) / 1e6).toFixed(2);
    const onChain = `ON-CHAIN | HIGH ${p[1].toString().padStart(1)} | LEVELS ${p[2].toString()} | GAMES ${p[3].toString()} | ${payout} tUSDT EARNED`;
    showStatus(`${shortAddr(connectedAccount)} on chain 968. ${onChain}`, true);
  } else {
    showStatus("Connected. Scores will be recorded on-chain when the game ends.", true);
  }
}

async function submitScore(score, level) {
  if (TO_BE_DEPLOYED) return { skipped: true };
  if (!connectedAccount || !window.ethereum) {
    setSubmitStatus("Connect wallet to record score on-chain.");
    return { skipped: true };
  }
  try {
    await ensureChain();
    setSubmitStatus("Submitting score to BOT Chain...");
    const hash = await walletClient.writeContract({
      address: CONTRACT_ADDRESS,
      abi: GAME_ABI,
      functionName: "submitScore",
      args: [BigInt(Math.round(score)), BigInt(level)],
      account: connectedAccount
    });
    setSubmitStatus("Score submitted on-chain. Verifying...");
    await publicClient.waitForTransactionReceipt({ hash });
    const payout = Math.min(score / 1000, 10); // 1 tUSDT per 1000 score, capped at 10
    setSubmitStatus(`Score ${score.toLocaleString()} recorded. +${payout} tUSDT earned.`, `${EXPLORER_URL}/tx/${hash}`);
    renderConnected();
    return { hash, ok: true };
  } catch (e) {
    const msg = e?.shortMessage || e?.message || String(e);
    if (msg && msg.includes("user rejected")) {
      setSubmitStatus("Submission cancelled.");
    } else if (msg) {
      setSubmitStatus("Submit failed: " + msg.slice(0, 120));
    }
    return { skipped: true, error: msg };
  }
}

window.BlackBullWeb3 = {
  CONTRACT_ADDRESS,
  connectWallet,
  submitScore,
  getPlayer: (addr) =>
    publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi: GAME_ABI,
      functionName: "getPlayer",
      args: [addr]
    }),
  isConnected: () => !!connectedAccount,
  address: () => connectedAccount
};

document.addEventListener("DOMContentLoaded", () => {
  createPanel();
  createSubmitStatus();
});