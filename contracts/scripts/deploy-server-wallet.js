/**
 * CoinMax V3 — Deploy via thirdweb Server Wallet
 *
 * Uses thirdweb Server Wallet API to deploy all contracts on BSC.
 * No private key needed. No gas fee from your pocket.
 *
 * Usage:
 *   node scripts/deploy-server-wallet.js
 *
 * Required env vars:
 *   THIRDWEB_SECRET_KEY   — thirdweb project secret key
 *   SERVER_WALLET_ADDRESS — your server wallet address
 */

const THIRDWEB_SECRET_KEY = process.env.THIRDWEB_SECRET_KEY
  || process.env.VITE_THIRDWEB_SECRET_KEY;
const SERVER_WALLET = process.env.SERVER_WALLET_ADDRESS
  || "0x85e44A8Be3B0b08e437B16759357300A4Cd1d95b";

const CHAIN_ID = 56; // BSC Mainnet
const API_BASE = "https://api.thirdweb.com";

// Treasury wallets (Splitter config)
const TREASURY_WALLETS = {
  trading:   "0xd12097C9A12617c49220c032C84aCc99B6fFf57b", // 30%
  ops:       "0xDf90770C89732a7eba5B727fCd6a12f827102EE6", // 8%
  marketing: "0x1C4D983620B3c8c2f7607c0943f2A5989e655599", // 12%
  investor:  "0x85c3d07Ee3be12d6502353b4cA52B30cD85Ac5ff", // 20%
  withdraw:  "0x7DEa369864583E792D230D360C0a4C56c2103FE4", // 30%
};

// BSC DEX config
const BSC_USDT = "0x55d398326f99059fF775485246999027B3197955";
const BSC_USDC = "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d";
const BSC_PANCAKE_ROUTER = "0x13f4EA83D0bd40E75C8222255bc855a974568Dd4";
const BSC_POOL_FEE = 100; // 0.01% stable pair

const MA_PRICE = 100000; // $0.10 in 6 decimals

// ─── Helpers ─────────────────────────────────────────────────

async function thirdwebAPI(endpoint, body) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-secret-key": THIRDWEB_SECRET_KEY,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    console.error("API Error:", JSON.stringify(data, null, 2));
    throw new Error(`API ${res.status}: ${data.error?.message || res.statusText}`);
  }
  return data;
}

async function writeContract(contractAddress, method, params) {
  console.log(`  → ${method.split("(")[0].replace("function ", "")}()`);
  const result = await thirdwebAPI("/v1/contracts/write", {
    chainId: CHAIN_ID,
    from: SERVER_WALLET,
    calls: [{
      contractAddress,
      method,
      params,
    }],
  });
  // Wait a bit for tx to confirm
  await sleep(5000);
  return result;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Load compiled artifacts ─────────────────────────────────

const fs = require("fs");
const path = require("path");

function loadArtifact(name) {
  const artifactPath = path.join(
    __dirname, "..", "artifacts", "src", `${name}.sol`, `${name}.json`
  );
  if (!fs.existsSync(artifactPath)) {
    throw new Error(`Artifact not found: ${artifactPath}\nRun 'npx hardhat compile' first.`);
  }
  return JSON.parse(fs.readFileSync(artifactPath, "utf8"));
}

async function deployContract(name, constructorArgs = []) {
  console.log(`\nDeploying ${name}...`);
  const artifact = loadArtifact(name);

  // Encode constructor args into bytecode
  const { ethers } = require("ethers");
  const iface = new ethers.Interface(artifact.abi);
  const deployData = constructorArgs.length > 0
    ? artifact.bytecode + iface.encodeDeploy(constructorArgs).slice(2)
    : artifact.bytecode;

  const result = await thirdwebAPI("/v1/transactions", {
    chainId: CHAIN_ID,
    from: SERVER_WALLET,
    transactions: [{
      data: deployData,
      to: null, // contract creation
      value: "0",
    }],
  });

  console.log(`  Tx queued:`, result.result?.transactionId || "pending");
  console.log(`  Waiting for confirmation...`);

  // Poll for transaction receipt
  await sleep(15000); // Wait for BSC block time

  // Note: In production, poll the transaction status API
  // For now we'll need to check the tx status manually
  return result;
}

// ─── Main Deployment ─────────────────────────────────────────

async function main() {
  console.log("═══════════════════════════════════════════════════");
  console.log("  CoinMax V3 — Server Wallet Deployment");
  console.log("  Chain: BSC Mainnet (56)");
  console.log("  Server Wallet:", SERVER_WALLET);
  console.log("═══════════════════════════════════════════════════\n");

  if (!THIRDWEB_SECRET_KEY) {
    throw new Error("Set THIRDWEB_SECRET_KEY in .env");
  }

  // ─── Step 1: Deploy tokens ────────────────────────────────

  console.log("─── Step 1: Deploy Tokens ───");
  await deployContract("MAToken", [SERVER_WALLET]);
  await deployContract("CUSD", [SERVER_WALLET]);

  console.log("\n⚠️  Check thirdweb dashboard for deployed addresses.");
  console.log("  Then set them below and run Step 2.\n");

  // After getting addresses from dashboard, uncomment and run Step 2:
  // await deployStep2(MA_ADDRESS, CUSD_ADDRESS);
}

async function deployStep2(maTokenAddr, cusdAddr) {
  console.log("─── Step 2: Deploy Implementations ───");
  await deployContract("CoinMaxVault");
  await deployContract("CoinMaxInterestEngine");
  await deployContract("CoinMaxRelease");
  await deployContract("CoinMaxGateway");

  console.log("\n⚠️  Get implementation addresses, then run Step 3.\n");
  // await deployStep3(maTokenAddr, cusdAddr, vaultImpl, engineImpl, releaseImpl, gatewayImpl);
}

async function deployStep3(maTokenAddr, cusdAddr, vaultImpl, engineImpl, releaseImpl, gatewayImpl) {
  console.log("─── Step 3: Deploy Factory ───");
  await deployContract("CoinMaxFactory", [SERVER_WALLET]);

  console.log("\n⚠️  Get Factory address, then run Step 4.\n");
  // await deployStep4(factoryAddr, maTokenAddr, cusdAddr, vaultImpl, engineImpl, releaseImpl, gatewayImpl);
}

async function deployStep4(factoryAddr, maTokenAddr, cusdAddr, vaultImpl, engineImpl, releaseImpl, gatewayImpl) {
  console.log("─── Step 4: Configure Factory + Deploy Proxies ───");

  // 4a. Set implementations on Factory
  await writeContract(factoryAddr,
    "function setImplementations(address _vault, address _engine, address _release, address _gateway)",
    [vaultImpl, engineImpl, releaseImpl, gatewayImpl]
  );

  // 4b. Deploy vault chain (creates proxies)
  await writeContract(factoryAddr,
    "function deployVaultChain(address cUsd, address maToken, address admin, uint256 maPrice)",
    [cusdAddr, maTokenAddr, SERVER_WALLET, MA_PRICE]
  );

  console.log("\n  Proxies deployed via Factory!");
  console.log("  Check Factory.vaultProxy(), engineProxy(), releaseProxy() for addresses.\n");

  // 4c. Deploy Gateway clone
  const BSC_TREASURY = TREASURY_WALLETS.trading; // Use trading wallet as default treasury
  await writeContract(factoryAddr,
    "function deployGatewayClone(uint32 chainId, bool isVaultChain, address usdt_, address usdc_, address dexRouter_, uint24 poolFee_, address treasury_, address admin_)",
    [CHAIN_ID, true, BSC_USDT, BSC_USDC, BSC_PANCAKE_ROUTER, BSC_POOL_FEE, BSC_TREASURY, SERVER_WALLET]
  );

  console.log("  Gateway clone deployed!\n");
}

async function deployStep5(cusdAddr, gatewayAddr, vaultProxy, engineProxy, maTokenAddr) {
  console.log("─── Step 5: Post-Deploy Config ───");

  // Grant MINTER_ROLE on cUSD to Gateway
  const MINTER_ROLE = "0x9f2df0fed2c77648de5860a4cc508cd0818c85b8b8a1ab4ceeef8d981c8956a6";
  await writeContract(cusdAddr,
    "function grantRole(bytes32 role, address account)",
    [MINTER_ROLE, gatewayAddr]
  );
  console.log("  cUSD MINTER_ROLE → Gateway");

  // Grant MINTER_ROLE on MA to Vault + Engine
  await writeContract(maTokenAddr,
    "function grantRole(bytes32 role, address account)",
    [MINTER_ROLE, vaultProxy]
  );
  console.log("  MA MINTER_ROLE → Vault");

  await writeContract(maTokenAddr,
    "function grantRole(bytes32 role, address account)",
    [MINTER_ROLE, engineProxy]
  );
  console.log("  MA MINTER_ROLE → Engine");

  // Set cUSD + Vault on Gateway
  await writeContract(gatewayAddr,
    "function setCUsd(address _cUsd)",
    [cusdAddr]
  );
  await writeContract(gatewayAddr,
    "function setVault(address _vault)",
    [vaultProxy]
  );
  console.log("  Gateway configured with cUSD + Vault");

  console.log("\n═══════════════════════════════════════════════════");
  console.log("  ✅ Deployment Complete!");
  console.log("═══════════════════════════════════════════════════");
}

// Deploy Splitter separately
async function deploySplitter(usdcAddr) {
  console.log("─── Deploy Splitter ───");
  await deployContract("CoinMaxSplitter", [usdcAddr]);
  console.log("  After deploy, call configure() with:");
  console.log("  wallets:", Object.values(TREASURY_WALLETS));
  console.log("  shares: [3000, 800, 1200, 2000, 3000]");
}

main().catch(console.error);
