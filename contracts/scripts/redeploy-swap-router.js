const { ethers } = require("hardhat");

/**
 * Redeploy CoinMaxSwapRouter with corrected PancakeSwap V3 interface
 * (removed `deadline` from ExactInputSingleParams to match PancakeSwap SmartRouter)
 */

const PANCAKE_ROUTER = "0x13f4EA83D0bd40E75C8222255bc855a974568Dd4"; // PancakeSwap V3 SmartRouter
const PANCAKE_POOL   = "0x92b7807bF19b7DDdf89b706143896d05228f3121"; // USDT/USDC pool (fee=100)
const USDT           = "0x55d398326f99059fF775485246999027B3197955";
const USDC           = "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d";
const POOL_FEE       = 100; // 0.01%
const NODES_V2       = "0x17DDad4C9c2fD61859D37dD40300c419cBdd4cE2";
const VAULT_V2       = "0x1B6B492d8fbB8ded7dC6E1D48564695cE5BCB9b1"; // placeholder (not deployed yet)

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("BNB balance:", ethers.formatEther(balance));

  console.log("\nDeploying CoinMaxSwapRouter (fixed interface)...");
  const SwapRouter = await ethers.getContractFactory("CoinMaxSwapRouter");
  const router = await SwapRouter.deploy(
    PANCAKE_ROUTER,
    PANCAKE_POOL,
    USDT,
    USDC,
    POOL_FEE,
    NODES_V2,
    VAULT_V2,
    { gasLimit: 5000000 }
  );
  await router.waitForDeployment();
  const routerAddr = await router.getAddress();
  console.log("✅ SwapRouter deployed:", routerAddr);

  // Update NodesV2 to point to new SwapRouter
  console.log("\nUpdating NodesV2.swapRouter...");
  const NODES_ABI = [
    "function setSwapRouter(address) external",
    "function swapRouter() view returns (address)",
  ];
  const nodesV2 = new ethers.Contract(NODES_V2, NODES_ABI, deployer);
  const tx = await nodesV2.setSwapRouter(routerAddr);
  await tx.wait();
  const newRouter = await nodesV2.swapRouter();
  console.log("✅ NodesV2.swapRouter updated:", newRouter);

  console.log("\n═══════════════════════════════════════");
  console.log("  Deployment Complete");
  console.log("═══════════════════════════════════════");
  console.log("  New SwapRouter:", routerAddr);
  console.log("  NodesV2:       ", NODES_V2);
  console.log("");
  console.log("  Update frontend VITE_SWAP_ROUTER_ADDRESS=", routerAddr);
  console.log("═══════════════════════════════════════");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
