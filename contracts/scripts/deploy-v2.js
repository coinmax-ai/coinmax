const { ethers } = require("hardhat");

/**
 * Deploy CoinMax V2 Contracts
 *
 * Architecture:
 *   1. cUSDT — thirdweb Token (deploy via thirdweb dashboard first)
 *   2. LiquidityManager — mints cUSDT + adds to PancakeSwap V3 pool
 *   3. SwapRouter — user USDT → V3 pool swap → cUSDT → NodesV2/VaultV2
 *   4. NodesV2 — node subscriptions (cUSDT)
 *   5. VaultV2 — vault deposits (cUSDT → MA → stake)
 *
 * Pre-requisites:
 *   - Deploy cUSDT token via thirdweb dashboard
 *   - Create USDT/cUSDT pool on PancakeSwap V3
 *   - Set environment variables
 *
 * Deployment order:
 *   1. NodesV2 + VaultV2
 *   2. SwapRouter (needs NodesV2 + VaultV2)
 *   3. LiquidityManager
 *   4. Link SwapRouter to NodesV2/VaultV2
 *   5. Grant minter role to LiquidityManager on cUSDT (thirdweb dashboard)
 */

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "BNB\n");

  // ─── Configuration ──────────────────────────────────────────────────

  // BSC Mainnet
  const USDT = "0x55d398326f99059fF775485246999027B3197955";
  const PANCAKE_V3_ROUTER = "0x13f4EA83D0bd40E75C8222255bc855a974568Dd4";
  const PANCAKE_V3_POSITION_MANAGER = "0x46A15B0b27311cedF172AB29E4f4766fbE7F4364";

  // Your deployed contracts (set in .env)
  const CUSDT = process.env.CUSDT_ADDRESS;                    // thirdweb cUSDT token
  const CUSDT_USDT_POOL = process.env.CUSDT_USDT_POOL;       // PancakeSwap V3 USDT/cUSDT pool
  const POOL_FEE = Number(process.env.POOL_FEE || "100");     // 0.01% for stable pair
  const MA_TOKEN = process.env.MA_TOKEN_ADDRESS;
  const RELEASE_CONTRACT = process.env.RELEASE_CONTRACT_ADDRESS;
  const FUND_DISTRIBUTOR = process.env.FUND_MANAGER_ADDRESS;
  const MA_PRICE = Number(process.env.MA_PRICE || "100000");   // $0.10 in 6 decimals

  // ─── Validation ─────────────────────────────────────────────────────
  const required = { CUSDT, CUSDT_USDT_POOL, MA_TOKEN, RELEASE_CONTRACT, FUND_DISTRIBUTOR };
  for (const [key, val] of Object.entries(required)) {
    if (!val) throw new Error(`Set ${key} in environment`);
  }

  console.log("─── Deploying V2 Contracts ───\n");

  // ─── 1. Deploy NodesV2 ─────────────────────────────────────────────
  const NodesV2 = await ethers.getContractFactory("CoinMaxNodesV2");
  const nodesV2 = await NodesV2.deploy(CUSDT, FUND_DISTRIBUTOR, deployer.address);
  await nodesV2.waitForDeployment();
  const nodesV2Addr = await nodesV2.getAddress();
  console.log("CoinMaxNodesV2:         ", nodesV2Addr);

  // ─── 2. Deploy VaultV2 ─────────────────────────────────────────────
  const VaultV2 = await ethers.getContractFactory("CoinMaxVaultV2");
  const vaultV2 = await VaultV2.deploy(CUSDT, MA_TOKEN, RELEASE_CONTRACT, FUND_DISTRIBUTOR, deployer.address, MA_PRICE);
  await vaultV2.waitForDeployment();
  const vaultV2Addr = await vaultV2.getAddress();
  console.log("CoinMaxVaultV2:         ", vaultV2Addr);

  // ─── 3. Deploy SwapRouter ──────────────────────────────────────────
  const SwapRouter = await ethers.getContractFactory("CoinMaxSwapRouter");
  const swapRouter = await SwapRouter.deploy(
    PANCAKE_V3_ROUTER,
    CUSDT_USDT_POOL,
    USDT,
    CUSDT,
    POOL_FEE,
    nodesV2Addr,
    vaultV2Addr
  );
  await swapRouter.waitForDeployment();
  const swapRouterAddr = await swapRouter.getAddress();
  console.log("CoinMaxSwapRouter:      ", swapRouterAddr);

  // ─── 4. Deploy LiquidityManager ────────────────────────────────────
  const LiqManager = await ethers.getContractFactory("CoinMaxLiquidityManager");
  const liqManager = await LiqManager.deploy(
    PANCAKE_V3_POSITION_MANAGER,
    CUSDT_USDT_POOL,
    USDT,
    CUSDT,
    POOL_FEE
  );
  await liqManager.waitForDeployment();
  const liqManagerAddr = await liqManager.getAddress();
  console.log("CoinMaxLiquidityManager:", liqManagerAddr);

  // ─── 5. Link SwapRouter ────────────────────────────────────────────
  console.log("\n─── Linking contracts ───\n");

  let tx;
  tx = await nodesV2.setSwapRouter(swapRouterAddr);
  await tx.wait();
  console.log("NodesV2.swapRouter →", swapRouterAddr);

  tx = await vaultV2.setSwapRouter(swapRouterAddr);
  await tx.wait();
  console.log("VaultV2.swapRouter →", swapRouterAddr);

  // ─── Summary ────────────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════════════");
  console.log("  V2 Deployment Complete");
  console.log("═══════════════════════════════════════════════════");
  console.log("  CoinMaxSwapRouter:       ", swapRouterAddr);
  console.log("  CoinMaxNodesV2:          ", nodesV2Addr);
  console.log("  CoinMaxVaultV2:          ", vaultV2Addr);
  console.log("  CoinMaxLiquidityManager: ", liqManagerAddr);
  console.log("═══════════════════════════════════════════════════");
  console.log("\n  Pool:  ", CUSDT_USDT_POOL);
  console.log("  cUSDT: ", CUSDT);
  console.log("  Fee:    0.01%\n");
  console.log("  ⚠️  Post-deploy checklist:");
  console.log("  ┌─────────────────────────────────────────────────┐");
  console.log("  │ 1. thirdweb: Grant MINTER_ROLE on cUSDT to:    │");
  console.log("  │    → LiquidityManager:", liqManagerAddr.slice(0, 20) + "...│");
  console.log("  │ 2. thirdweb: Grant MINTER_ROLE on MA to:       │");
  console.log("  │    → VaultV2:", vaultV2Addr.slice(0, 20) + "...          │");
  console.log("  │ 3. ReleaseContract: setVaultContract → VaultV2 │");
  console.log("  │ 4. FundManager: add cUSDT to allowedTokens     │");
  console.log("  │ 5. LiquidityManager: depositUsdt + addLiquidity │");
  console.log("  │ 6. Update frontend .env                        │");
  console.log("  └─────────────────────────────────────────────────┘");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
