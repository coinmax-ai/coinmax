const { ethers } = require("hardhat");

/**
 * Check which PancakeSwap router interface works
 *
 * PancakeSwap SmartRouter (0x13f4...) uses a DIFFERENT struct than Uniswap V3:
 * - NO `deadline` field in ExactInputSingleParams
 * - Deadline is enforced via multicall wrapper instead
 */

const PANCAKE_SMART_ROUTER = "0x13f4EA83D0bd40E75C8222255bc855a974568Dd4";
const USDT = "0x55d398326f99059fF775485246999027B3197955";
const USDC = "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d";

async function main() {
  const [deployer] = await ethers.getSigners();

  // Check the 4-byte selector of exactInputSingle on the SmartRouter
  // PancakeSwap V3 SmartRouter uses struct WITHOUT deadline:
  //   (address,address,uint24,address,uint256,uint256,uint160)
  // Uniswap V3 uses struct WITH deadline:
  //   (address,address,uint24,address,uint256,uint256,uint256,uint160)

  // PancakeSwap V3 selector (no deadline)
  const pcsSelector = ethers.id("exactInputSingle((address,address,uint24,address,uint256,uint256,uint160))").slice(0, 10);
  console.log("PancakeSwap V3 selector (no deadline):", pcsSelector);

  // Uniswap V3 selector (with deadline)
  const uniSelector = ethers.id("exactInputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160))").slice(0, 10);
  console.log("Uniswap V3 selector (with deadline):  ", uniSelector);

  // Check which one the router responds to
  const provider = deployer.provider;

  // Try PancakeSwap-style call (no deadline)
  console.log("\nTesting PancakeSwap-style (no deadline)...");
  const pcsIface = new ethers.Interface([
    "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256)",
  ]);
  const pcsData = pcsIface.encodeFunctionData("exactInputSingle", [{
    tokenIn: USDT,
    tokenOut: USDC,
    fee: 100,
    recipient: deployer.address,
    amountIn: ethers.parseEther("100"),
    amountOutMinimum: 0,
    sqrtPriceLimitX96: 0,
  }]);

  try {
    const result = await provider.call({
      to: PANCAKE_SMART_ROUTER,
      data: pcsData,
      from: deployer.address,
    });
    console.log("✅ PancakeSwap-style works! Result:", result);
  } catch (err) {
    console.log("❌ PancakeSwap-style failed:", err.reason || err.message?.slice(0, 100));
  }

  // Try Uniswap-style call (with deadline) - this is what our contract uses
  console.log("\nTesting Uniswap-style (with deadline)...");
  const uniIface = new ethers.Interface([
    "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256)",
  ]);
  const uniData = uniIface.encodeFunctionData("exactInputSingle", [{
    tokenIn: USDT,
    tokenOut: USDC,
    fee: 100,
    recipient: deployer.address,
    deadline: Math.floor(Date.now() / 1000) + 300,
    amountIn: ethers.parseEther("100"),
    amountOutMinimum: 0,
    sqrtPriceLimitX96: 0,
  }]);

  try {
    const result = await provider.call({
      to: PANCAKE_SMART_ROUTER,
      data: uniData,
      from: deployer.address,
    });
    console.log("✅ Uniswap-style works! Result:", result);
  } catch (err) {
    console.log("❌ Uniswap-style failed:", err.reason || err.message?.slice(0, 100));
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
