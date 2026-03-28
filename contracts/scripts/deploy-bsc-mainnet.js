const { ethers } = require("hardhat");

/**
 * CoinMax V3 — Full BSC Mainnet Deployment
 *
 * Deploys all contracts, configures Factory proxies, sets up roles.
 * Admin/owner = Server Wallet (thirdweb Engine)
 * Deployer just pays gas.
 */

const SERVER_WALLET = "0x85e44A8Be3B0b08e437B16759357300A4Cd1d95b";

// BSC Mainnet
const BSC_USDT = "0x55d398326f99059fF775485246999027B3197955";
const BSC_USDC = "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d";
const BSC_PANCAKE_ROUTER = "0x13f4EA83D0bd40E75C8222255bc855a974568Dd4";
const BSC_POOL_FEE = 100; // 0.01% stable pair
const MA_PRICE = 100000; // $0.10 in 6 decimals
const CHAIN_ID = 56;

// Splitter treasury wallets
const SPLITTER_WALLETS = [
  "0xd12097C9A12617c49220c032C84aCc99B6fFf57b", // Trading 30%
  "0xDf90770C89732a7eba5B727fCd6a12f827102EE6", // Ops 8%
  "0x1C4D983620B3c8c2f7607c0943f2A5989e655599", // Marketing 12%
  "0x85c3d07Ee3be12d6502353b4cA52B30cD85Ac5ff", // Investor 20%
  "0x7DEa369864583E792D230D360C0a4C56c2103FE4", // Withdraw 30%
];
const SPLITTER_SHARES = [3000, 800, 1200, 2000, 3000]; // = 10000

async function main() {
  const [deployer] = await ethers.getSigners();
  const balance = ethers.formatEther(await ethers.provider.getBalance(deployer.address));

  console.log("═══════════════════════════════════════════════════");
  console.log("  CoinMax V3 — BSC Mainnet Deployment");
  console.log("═══════════════════════════════════════════════════");
  console.log("  Deployer:      ", deployer.address);
  console.log("  Balance:       ", balance, "BNB");
  console.log("  Server Wallet: ", SERVER_WALLET);
  console.log("═══════════════════════════════════════════════════\n");

  const deployed = {};

  // ═══════════════════════════════════════════════════════════════
  //  STEP 1: Deploy MAToken + CUSD
  // ═══════════════════════════════════════════════════════════════
  console.log("─── Step 1: Tokens ───\n");

  const MAToken = await ethers.getContractFactory("MAToken");
  const ma = await MAToken.deploy(SERVER_WALLET);
  await ma.waitForDeployment();
  deployed.maToken = await ma.getAddress();
  console.log("  MAToken:  ", deployed.maToken);

  const CUSD = await ethers.getContractFactory("CUSD");
  const cusd = await CUSD.deploy(SERVER_WALLET);
  await cusd.waitForDeployment();
  deployed.cusd = await cusd.getAddress();
  console.log("  CUSD:     ", deployed.cusd);

  // ═══════════════════════════════════════════════════════════════
  //  STEP 2: Deploy Implementation Contracts
  // ═══════════════════════════════════════════════════════════════
  console.log("\n─── Step 2: Implementations ───\n");

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

  // ═══════════════════════════════════════════════════════════════
  //  STEP 3: Deploy Factory
  // ═══════════════════════════════════════════════════════════════
  console.log("\n─── Step 3: Factory ───\n");

  const Factory = await ethers.getContractFactory("CoinMaxFactory");
  const factory = await Factory.deploy(SERVER_WALLET);
  await factory.waitForDeployment();
  deployed.factory = await factory.getAddress();
  console.log("  Factory:  ", deployed.factory);

  // Set implementations
  let tx = await factory.setImplementations(
    deployed.vaultImpl,
    deployed.engineImpl,
    deployed.releaseImpl,
    deployed.gatewayImpl
  );
  await tx.wait();
  console.log("  Implementations registered.");

  // ═══════════════════════════════════════════════════════════════
  //  STEP 4: Deploy Proxies via Factory
  // ═══════════════════════════════════════════════════════════════
  console.log("\n─── Step 4: Deploy Proxies ───\n");

  tx = await factory.deployVaultChain(
    deployed.cusd,
    deployed.maToken,
    SERVER_WALLET,
    MA_PRICE
  );
  await tx.wait();

  deployed.vaultProxy = await factory.vaultProxy();
  deployed.engineProxy = await factory.engineProxy();
  deployed.releaseProxy = await factory.releaseProxy();

  console.log("  Vault proxy:   ", deployed.vaultProxy);
  console.log("  Engine proxy:  ", deployed.engineProxy);
  console.log("  Release proxy: ", deployed.releaseProxy);

  // ═══════════════════════════════════════════════════════════════
  //  STEP 5: Deploy Gateway Clone
  // ═══════════════════════════════════════════════════════════════
  console.log("\n─── Step 5: Gateway Clone ───\n");

  // Use Splitter as treasury (USDC goes there first, then distributed)
  // We'll deploy Splitter first, then use it as treasury
  const Splitter = await ethers.getContractFactory("CoinMaxSplitter");
  const splitter = await Splitter.deploy(BSC_USDC);
  await splitter.waitForDeployment();
  deployed.splitter = await splitter.getAddress();
  console.log("  Splitter: ", deployed.splitter);

  // Configure Splitter wallets
  tx = await splitter.configure(SPLITTER_WALLETS, SPLITTER_SHARES);
  await tx.wait();
  console.log("  Splitter configured (5 wallets).");

  // Deploy Gateway clone via Factory
  tx = await factory.deployGatewayClone(
    CHAIN_ID,
    true, // isVaultChain (BSC is our main chain)
    BSC_USDT,
    BSC_USDC,
    BSC_PANCAKE_ROUTER,
    BSC_POOL_FEE,
    deployed.splitter, // treasury = Splitter
    SERVER_WALLET
  );
  await tx.wait();
  deployed.gateway = await factory.gatewayClones(CHAIN_ID);
  console.log("  Gateway:  ", deployed.gateway);

  // ═══════════════════════════════════════════════════════════════
  //  STEP 6: Post-Deploy Config (Roles + Wiring)
  // ═══════════════════════════════════════════════════════════════
  console.log("\n─── Step 6: Configure Roles ───\n");

  const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));

  // 6a. Grant MINTER_ROLE on cUSD to Gateway
  const cusdContract = await ethers.getContractAt("CUSD", deployed.cusd);
  tx = await cusdContract.grantRole(MINTER_ROLE, deployed.gateway);
  await tx.wait();
  console.log("  cUSD MINTER_ROLE -> Gateway");

  // 6b. Grant MINTER_ROLE on MA to Vault + Engine
  const maContract = await ethers.getContractAt("MAToken", deployed.maToken);
  tx = await maContract.grantRole(MINTER_ROLE, deployed.vaultProxy);
  await tx.wait();
  console.log("  MA MINTER_ROLE -> Vault");

  tx = await maContract.grantRole(MINTER_ROLE, deployed.engineProxy);
  await tx.wait();
  console.log("  MA MINTER_ROLE -> Engine");

  // 6c. Set cUSD + Vault on Gateway
  const gatewayContract = await ethers.getContractAt("CoinMaxGateway", deployed.gateway);
  tx = await gatewayContract.setCUsd(deployed.cusd);
  await tx.wait();
  console.log("  Gateway.cUsd set");

  tx = await gatewayContract.setVault(deployed.vaultProxy);
  await tx.wait();
  console.log("  Gateway.vault set");

  // 6d. Transfer Splitter ownership to Server Wallet
  tx = await splitter.transferOwnership(SERVER_WALLET);
  await tx.wait();
  console.log("  Splitter ownership -> Server Wallet");

  // 6e. Transfer Factory ownership to Server Wallet
  tx = await factory.transferOwnership(SERVER_WALLET);
  await tx.wait();
  console.log("  Factory ownership -> Server Wallet");

  // ═══════════════════════════════════════════════════════════════
  //  DONE
  // ═══════════════════════════════════════════════════════════════
  const finalBalance = ethers.formatEther(await ethers.provider.getBalance(deployer.address));
  const gasUsed = (parseFloat(balance) - parseFloat(finalBalance)).toFixed(6);

  console.log("\n═══════════════════════════════════════════════════");
  console.log("  DEPLOYMENT COMPLETE!");
  console.log("═══════════════════════════════════════════════════");
  console.log(`
  Tokens:
    MAToken:           ${deployed.maToken}
    CUSD:              ${deployed.cusd}

  Proxies (upgradeable):
    Vault:             ${deployed.vaultProxy}
    InterestEngine:    ${deployed.engineProxy}
    Release:           ${deployed.releaseProxy}

  Clones:
    Gateway:           ${deployed.gateway}

  Infrastructure:
    Factory:           ${deployed.factory}
    Splitter:          ${deployed.splitter}

  Implementations:
    Vault impl:        ${deployed.vaultImpl}
    Engine impl:       ${deployed.engineImpl}
    Release impl:      ${deployed.releaseImpl}
    Gateway impl:      ${deployed.gatewayImpl}

  Config:
    Server Wallet:     ${SERVER_WALLET}
    MA Price:          $0.10 (${MA_PRICE})
    Chain:             BSC (${CHAIN_ID})

  Gas used:            ${gasUsed} BNB
  Remaining:           ${finalBalance} BNB
  `);

  console.log("  Splitter Distribution:");
  console.log("    Trading  (30%): ", SPLITTER_WALLETS[0]);
  console.log("    Ops       (8%): ", SPLITTER_WALLETS[1]);
  console.log("    Marketing(12%): ", SPLITTER_WALLETS[2]);
  console.log("    Investor (20%): ", SPLITTER_WALLETS[3]);
  console.log("    Withdraw (30%): ", SPLITTER_WALLETS[4]);
  console.log("\n  All admin roles assigned to Server Wallet.");
  console.log("  Deployer wallet can be discarded.\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n  DEPLOYMENT FAILED:", error.message);
    process.exit(1);
  });
