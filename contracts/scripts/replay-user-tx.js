const { ethers } = require("hardhat");

async function main() {
  const USER = "0x3070063A913AF0b676BAcdeea2F73DA415614f4f";
  const GATEWAY = "0x38a692f51FF4Db415cf8620d131df518fb8F3b30";
  const USDT = "0x55d398326f99059fF775485246999027B3197955";
  const PANCAKE = "0x13f4EA83D0bd40E75C8222255bc855a974568Dd4";

  // Check allowance from Gateway to PancakeSwap
  const usdt = await ethers.getContractAt("IERC20", USDT);
  const allowGwToRouter = await usdt.allowance(GATEWAY, PANCAKE);
  console.log("Gateway → PancakeRouter allowance:", ethers.formatEther(allowGwToRouter), "USDT");
  
  if (allowGwToRouter === 0n) {
    console.log("❌ Gateway has ZERO allowance to PancakeSwap Router!");
    console.log("   forceApprove in _swapToUsdc should fix this at runtime");
    console.log("   But maybe forceApprove is failing silently?");
  }
  
  // Check: is BSC USDT compatible with forceApprove?
  // BSC USDT = 0x55d3... is a standard BEP20 with approve returning bool
  // forceApprove does: if allowance != 0, approve(0) first, then approve(amount)
  // This should work fine
  
  // The REAL issue might be:
  // PancakeSwap V3 SmartRouter 0x13f4 uses a DIFFERENT method signature
  // Our IDEXRouter has: exactInputSingle(ExactInputSingleParams)
  // PancakeSwap V3 SmartRouter has: exactInputSingle(IV3SwapRouter.ExactInputSingleParams)
  // The struct fields might differ!
  
  console.log("\n=== Check PancakeSwap Router struct compatibility ===");
  console.log("Our struct: tokenIn, tokenOut, fee, recipient, amountIn, amountOutMinimum, sqrtPriceLimitX96");
  console.log("PancakeSwap V3 SmartRouter struct (BSC) has NO deadline field");
  console.log("Uniswap V3 struct has deadline — if we accidentally send deadline, it fails!");
  
  // The Gateway ABI says:
  // struct ExactInputSingleParams {
  //   address tokenIn; address tokenOut; uint24 fee; address recipient;
  //   uint256 amountIn; uint256 amountOutMinimum; uint160 sqrtPriceLimitX96;
  // }
  // PancakeSwap V3 SmartRouter on BSC uses the SAME struct (no deadline)
  // So this should be fine...
  
  // Let me check: is the PancakeSwap Router a proxy that might have been upgraded?
  console.log("\n=== Check PancakeSwap Router code size ===");
  const code = await ethers.provider.getCode(PANCAKE);
  console.log("  Code size:", code.length / 2, "bytes");
  console.log("  Is contract:", code.length > 2 ? "✅" : "❌");
  
  // The old SwapRouter 0x5650 works for node purchases
  // Let me check what's different between 0x5650 and Gateway 0x38a6
  const OLD_SR = "0x5650383D9f8d8f80fc972b8F49A3cc31d3A7F7E3";
  console.log("\n=== Compare old SwapRouter vs new Gateway ===");
  console.log("Old SwapRouter allowance to PancakeRouter:", ethers.formatEther(await usdt.allowance(OLD_SR, PANCAKE)));
}

main().catch(console.error);
