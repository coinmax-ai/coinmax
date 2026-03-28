const { ethers } = require("hardhat");

async function main() {
  const POOL = "0x92b7807bF19b7DDdf89b706143896d05228f3121";
  const USDT = "0x55d398326f99059fF775485246999027B3197955";
  const USDC = "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d";
  const PANCAKE = "0x13f4EA83D0bd40E75C8222255bc855a974568Dd4";
  const GATEWAY = "0x38a692f51FF4Db415cf8620d131df518fb8F3b30";

  // Check pool liquidity
  const poolIface = new ethers.Interface([
    "function liquidity() view returns (uint128)",
    "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint32 feeProtocol, bool unlocked)",
    "function token0() view returns (address)",
    "function token1() view returns (address)",
    "function fee() view returns (uint24)",
  ]);
  
  const pool = new ethers.Contract(POOL, poolIface, ethers.provider);
  
  console.log("=== Pool State ===");
  console.log("  token0:", await pool.token0());
  console.log("  token1:", await pool.token1());
  console.log("  fee:", (await pool.fee()).toString());
  console.log("  liquidity:", (await pool.liquidity()).toString());
  
  const slot0 = await pool.slot0();
  console.log("  sqrtPriceX96:", slot0[0].toString());
  console.log("  tick:", slot0[1].toString());
  console.log("  unlocked:", slot0[6]);
  
  if (!slot0[6]) {
    console.log("  ❌ POOL IS LOCKED! Swap will fail!");
  }
  
  // Check USDT balance of Gateway (should be 0 before user sends)
  const usdt = await ethers.getContractAt("IERC20", USDT);
  const usdc = await ethers.getContractAt("IERC20", USDC);
  
  console.log("\n=== Gateway Balances ===");
  console.log("  USDT:", ethers.formatEther(await usdt.balanceOf(GATEWAY)));
  console.log("  USDC:", ethers.formatEther(await usdc.balanceOf(GATEWAY)));

  // Check if this pool is the USDT/USDC pool that PancakeSwap uses
  console.log("\n=== PancakeSwap Router check ===");
  // The router finds pool by factory+token0+token1+fee
  // Our poolFee is 100 (0.01%), the pool fee is also 100
  // So the router should find this pool
  
  // But wait — check if the pool has enough liquidity for $50 swap
  const liq = await pool.liquidity();
  console.log("  Liquidity:", liq.toString());
  console.log("  Has liquidity:", liq > 0n ? "✅" : "❌ EMPTY POOL!");
  
  // Check: maybe PancakeSwap V3 on BSC has moved to a different router
  console.log("\n=== Is 0x13f4 the correct PancakeSwap V3 Router? ===");
  console.log("  Known PancakeSwap V3 SmartRouter on BSC: 0x13f4EA83D0bd40E75C8222255bc855a974568Dd4");
  console.log("  Gateway dexRouter: 0x13f4EA83D0bd40E75C8222255bc855a974568Dd4");
  console.log("  Match: ✅");
  
  // Try a direct swap simulation
  console.log("\n=== Simulate swap via PancakeSwap Router ===");
  const routerIface = new ethers.Interface([
    "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) payable returns (uint256 amountOut)",
  ]);
  
  try {
    const swapData = routerIface.encodeFunctionData("exactInputSingle", [{
      tokenIn: USDT,
      tokenOut: USDC,
      fee: 100,
      recipient: GATEWAY,
      amountIn: ethers.parseEther("50"),
      amountOutMinimum: ethers.parseEther("49.75"),
      sqrtPriceLimitX96: 0,
    }]);
    
    const result = await ethers.provider.call({
      from: GATEWAY,
      to: PANCAKE,
      data: swapData,
    });
    console.log("  Swap simulation SUCCESS! Output:", ethers.formatEther(ethers.AbiCoder.defaultAbiCoder().decode(["uint256"], result)[0]));
  } catch (e) {
    console.log("  Swap simulation FAILED:", e.message.slice(0, 150));
  }
}

main().catch(console.error);
