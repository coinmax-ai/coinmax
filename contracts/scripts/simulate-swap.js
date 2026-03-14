const { ethers } = require("hardhat");

/**
 * Simulate a swapAndPurchaseNode call to find the exact revert reason
 */

const SWAP_ROUTER = "0xF179A34CCE54F6337A337eaE2Bc4e3c5fBf51135";
const PANCAKE_ROUTER = "0x13f4EA83D0bd40E75C8222255bc855a974568Dd4";
const POOL = "0x92b7807bF19b7DDdf89b706143896d05228f3121";
const USDT = "0x55d398326f99059fF775485246999027B3197955";
const USDC = "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d";

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
];

const PANCAKE_ROUTER_ABI = [
  "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)",
];

const SWAP_ROUTER_ABI = [
  "function swapAndPurchaseNode(uint256 usdtAmount, string nodeType, uint256 minUsdcOut) external",
];

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Testing with:", deployer.address);

  const usdt = new ethers.Contract(USDT, ERC20_ABI, deployer);
  const balance = await usdt.balanceOf(deployer.address);
  console.log("USDT balance:", ethers.formatEther(balance));

  if (balance < ethers.parseEther("100")) {
    console.log("❌ Not enough USDT for test (need 100)");
    console.log("");
    console.log("Testing PancakeSwap V3 router directly with staticCall...");
  }

  // Test 1: Can we call PancakeSwap V3 Router directly?
  console.log("\n═══ Test 1: PancakeSwap V3 staticCall ═══");
  const pancakeRouter = new ethers.Contract(PANCAKE_ROUTER, PANCAKE_ROUTER_ABI, deployer);

  const testAmount = ethers.parseEther("100"); // 100 USDT
  const minOut = ethers.parseEther("99.9"); // 99.9% slippage

  try {
    const result = await pancakeRouter.exactInputSingle.staticCall({
      tokenIn: USDT,
      tokenOut: USDC,
      fee: 100,
      recipient: deployer.address,
      deadline: Math.floor(Date.now() / 1000) + 300,
      amountIn: testAmount,
      amountOutMinimum: minOut,
      sqrtPriceLimitX96: 0,
    }, { from: SWAP_ROUTER }); // simulate as if SwapRouter is calling
    console.log("✅ PancakeSwap would return:", ethers.formatEther(result), "USDC");
  } catch (err) {
    console.log("❌ PancakeSwap staticCall failed:", err.reason || err.message);

    // Try with lower minOut
    try {
      const result2 = await pancakeRouter.exactInputSingle.staticCall({
        tokenIn: USDT,
        tokenOut: USDC,
        fee: 100,
        recipient: deployer.address,
        deadline: Math.floor(Date.now() / 1000) + 300,
        amountIn: testAmount,
        amountOutMinimum: 0, // no min
        sqrtPriceLimitX96: 0,
      });
      console.log("  With minOut=0, would return:", ethers.formatEther(result2), "USDC");
    } catch (err2) {
      console.log("  Even with minOut=0 fails:", err2.reason || err2.message);
    }
  }

  // Test 2: Try different fee tiers
  console.log("\n═══ Test 2: Try different fee tiers ═══");
  for (const fee of [100, 500, 2500, 10000]) {
    try {
      const result = await pancakeRouter.exactInputSingle.staticCall({
        tokenIn: USDT,
        tokenOut: USDC,
        fee: fee,
        recipient: deployer.address,
        deadline: Math.floor(Date.now() / 1000) + 300,
        amountIn: testAmount,
        amountOutMinimum: 0,
        sqrtPriceLimitX96: 0,
      });
      console.log(`  Fee ${fee} (${fee/10000*100}%): ✅ would return ${ethers.formatEther(result)} USDC`);
    } catch (err) {
      console.log(`  Fee ${fee} (${fee/10000*100}%): ❌ ${err.reason || "reverted"}`);
    }
  }

  // Test 3: Check pool's fee from factory
  console.log("\n═══ Test 3: Check actual pool fee ═══");
  const FACTORY = "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865";
  const FACTORY_ABI = [
    "function getPool(address, address, uint24) view returns (address)",
  ];
  const factory = new ethers.Contract(FACTORY, FACTORY_ABI, deployer);

  for (const fee of [100, 500, 2500, 10000]) {
    const poolAddr = await factory.getPool(USDT, USDC, fee);
    const isTarget = poolAddr.toLowerCase() === POOL.toLowerCase();
    console.log(`  Fee ${fee}: pool=${poolAddr} ${isTarget ? "← THIS IS 0x92b7" : ""}`);
  }

  // Test 4: Simulate full SwapRouter call
  console.log("\n═══ Test 4: Simulate swapAndPurchaseNode ═══");
  if (balance >= testAmount) {
    const swapRouter = new ethers.Contract(SWAP_ROUTER, SWAP_ROUTER_ABI, deployer);

    // First approve
    console.log("  Approving USDT to SwapRouter...");
    try {
      await usdt.approve(SWAP_ROUTER, testAmount);
      console.log("  ✅ Approved");
    } catch (err) {
      console.log("  ❌ Approve failed:", err.message);
    }

    // Then simulate
    try {
      await swapRouter.swapAndPurchaseNode.staticCall(testAmount, "MINI", minOut);
      console.log("  ✅ swapAndPurchaseNode would succeed!");
    } catch (err) {
      console.log("  ❌ swapAndPurchaseNode failed:", err.reason || err.data || err.message);
    }
  } else {
    console.log("  Skipped (not enough USDT)");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
