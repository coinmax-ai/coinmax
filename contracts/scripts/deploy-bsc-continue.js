const { ethers } = require("hardhat");

const SERVER_WALLET = "0x85e44A8Be3B0b08e437B16759357300A4Cd1d95b";
const BSC_USDT = "0x55d398326f99059fF775485246999027B3197955";
const BSC_USDC = "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d";
const BSC_PANCAKE_ROUTER = "0x13f4EA83D0bd40E75C8222255bc855a974568Dd4";
const BSC_POOL_FEE = 100;
const MA_PRICE = 100000;
const CHAIN_ID = 56;

const SPLITTER_WALLETS = [
  "0xd12097C9A12617c49220c032C84aCc99B6fFf57b",
  "0xDf90770C89732a7eba5B727fCd6a12f827102EE6",
  "0x1C4D983620B3c8c2f7607c0943f2A5989e655599",
  "0x85c3d07Ee3be12d6502353b4cA52B30cD85Ac5ff",
  "0x7DEa369864583E792D230D360C0a4C56c2103FE4",
];
const SPLITTER_SHARES = [3000, 800, 1200, 2000, 3000];

// Already deployed in Step 1
const DEPLOYED_MA = "0xE3d19D3299B0C2D6c5FDB74dBb79b102449Edc36";
const DEPLOYED_CUSD = "0x90B99a1495E5DBf8bF44c3623657020BB1BDa3C6";

async function main() {
  const [deployer] = await ethers.getSigners();
  const startBalance = ethers.formatEther(await ethers.provider.getBalance(deployer.address));
  console.log("Deployer:", deployer.address, "| Balance:", startBalance, "BNB\n");

  const deployed = { maToken: DEPLOYED_MA, cusd: DEPLOYED_CUSD };

  // ─── Step 2: Implementations ──────────────────────────────
  console.log("─── Step 2: Implementations ───\n");

  const VaultImpl = await ethers.getContractFactory("CoinMaxVault");
  const vaultImpl = await VaultImpl.deploy();
  await vaultImpl.waitForDeployment();
  deployed.vaultImpl = await vaultImpl.getAddress();
  console.log("  Vault impl:   ", deployed.vaultImpl);

  const EngineImpl = await ethers.getContractFactory("CoinMaxInterestEngine");
  const engineImpl = await EngineImpl.deploy();
  await engineImpl.waitForDeployment();
  deployed.engineImpl = await engineImpl.getAddress();
  console.log("  Engine impl:  ", deployed.engineImpl);

  const ReleaseImpl = await ethers.getContractFactory("CoinMaxRelease");
  const releaseImpl = await ReleaseImpl.deploy();
  await releaseImpl.waitForDeployment();
  deployed.releaseImpl = await releaseImpl.getAddress();
  console.log("  Release impl: ", deployed.releaseImpl);

  const GatewayImpl = await ethers.getContractFactory("CoinMaxGateway");
  const gatewayImpl = await GatewayImpl.deploy();
  await gatewayImpl.waitForDeployment();
  deployed.gatewayImpl = await gatewayImpl.getAddress();
  console.log("  Gateway impl: ", deployed.gatewayImpl);

  // ─── Step 3: Factory ──────────────────────────────────────
  console.log("\n─── Step 3: Factory ───\n");

  const Factory = await ethers.getContractFactory("CoinMaxFactory");
  const factory = await Factory.deploy(SERVER_WALLET);
  await factory.waitForDeployment();
  deployed.factory = await factory.getAddress();
  console.log("  Factory:  ", deployed.factory);

  let tx = await factory.setImplementations(
    deployed.vaultImpl, deployed.engineImpl, deployed.releaseImpl, deployed.gatewayImpl
  );
  await tx.wait();
  console.log("  Implementations registered.");

  // ─── Step 4: Proxies via Factory ──────────────────────────
  console.log("\n─── Step 4: Deploy Proxies ───\n");

  tx = await factory.deployVaultChain(deployed.cusd, deployed.maToken, SERVER_WALLET, MA_PRICE);
  await tx.wait();

  deployed.vaultProxy = await factory.vaultProxy();
  deployed.engineProxy = await factory.engineProxy();
  deployed.releaseProxy = await factory.releaseProxy();
  console.log("  Vault proxy:   ", deployed.vaultProxy);
  console.log("  Engine proxy:  ", deployed.engineProxy);
  console.log("  Release proxy: ", deployed.releaseProxy);

  // ─── Step 5: Splitter + Gateway ───────────────────────────
  console.log("\n─── Step 5: Splitter + Gateway ───\n");

  const Splitter = await ethers.getContractFactory("CoinMaxSplitter");
  const splitter = await Splitter.deploy(BSC_USDC);
  await splitter.waitForDeployment();
  deployed.splitter = await splitter.getAddress();
  console.log("  Splitter: ", deployed.splitter);

  tx = await splitter.configure(SPLITTER_WALLETS, SPLITTER_SHARES);
  await tx.wait();
  console.log("  Splitter configured.");

  tx = await factory.deployGatewayClone(
    CHAIN_ID, true, BSC_USDT, BSC_USDC, BSC_PANCAKE_ROUTER, BSC_POOL_FEE,
    deployed.splitter, SERVER_WALLET
  );
  await tx.wait();
  deployed.gateway = await factory.gatewayClones(CHAIN_ID);
  console.log("  Gateway:  ", deployed.gateway);

  // ─── Step 6: Roles + Wiring ───────────────────────────────
  console.log("\n─── Step 6: Configure Roles ───\n");

  const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
  const cusd = await ethers.getContractAt("CUSD", deployed.cusd);
  const ma = await ethers.getContractAt("MAToken", deployed.maToken);
  const gateway = await ethers.getContractAt("CoinMaxGateway", deployed.gateway);

  tx = await cusd.grantRole(MINTER_ROLE, deployed.gateway);
  await tx.wait();
  console.log("  cUSD MINTER -> Gateway");

  tx = await ma.grantRole(MINTER_ROLE, deployed.vaultProxy);
  await tx.wait();
  console.log("  MA MINTER -> Vault");

  tx = await ma.grantRole(MINTER_ROLE, deployed.engineProxy);
  await tx.wait();
  console.log("  MA MINTER -> Engine");

  tx = await gateway.setCUsd(deployed.cusd);
  await tx.wait();
  console.log("  Gateway.cUsd set");

  tx = await gateway.setVault(deployed.vaultProxy);
  await tx.wait();
  console.log("  Gateway.vault set");

  // Transfer ownerships to Server Wallet
  tx = await splitter.transferOwnership(SERVER_WALLET);
  await tx.wait();
  console.log("  Splitter -> Server Wallet");

  tx = await factory.transferOwnership(SERVER_WALLET);
  await tx.wait();
  console.log("  Factory -> Server Wallet");

  // ─── Done ─────────────────────────────────────────────────
  const finalBalance = ethers.formatEther(await ethers.provider.getBalance(deployer.address));

  console.log("\n═══════════════════════════════════════════════════");
  console.log("  DEPLOYMENT COMPLETE!");
  console.log("═══════════════════════════════════════════════════");
  console.log(`
  MAToken:         ${deployed.maToken}
  CUSD:            ${deployed.cusd}
  Vault proxy:     ${deployed.vaultProxy}
  Engine proxy:    ${deployed.engineProxy}
  Release proxy:   ${deployed.releaseProxy}
  Gateway:         ${deployed.gateway}
  Factory:         ${deployed.factory}
  Splitter:        ${deployed.splitter}

  Implementations:
    Vault:         ${deployed.vaultImpl}
    Engine:        ${deployed.engineImpl}
    Release:       ${deployed.releaseImpl}
    Gateway:       ${deployed.gatewayImpl}

  Gas used: ${(parseFloat(startBalance) - parseFloat(finalBalance)).toFixed(6)} BNB
  Remaining: ${finalBalance} BNB

  All admin roles -> Server Wallet: ${SERVER_WALLET}
  `);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
