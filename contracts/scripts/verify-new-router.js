const { ethers } = require("hardhat");

const NEW_SWAP_ROUTER = "0x5650383D9f8d8f80fc972b8F49A3cc31d3A7F7E3";

const ROUTER_ABI = [
  "function pancakeRouter() view returns (address)",
  "function pancakePool() view returns (address)",
  "function nodesV2() view returns (address)",
  "function poolFee() view returns (uint24)",
  "function maxSlippageBps() view returns (uint256)",
  "function paused() view returns (bool)",
  "function getSpotPrice() view returns (uint256)",
  "function isPriceSafe() view returns (bool safe, uint256 spotPrice, uint256 twapPrice)",
];

async function main() {
  const [deployer] = await ethers.getSigners();
  const router = new ethers.Contract(NEW_SWAP_ROUTER, ROUTER_ABI, deployer);

  console.log("═══ New SwapRouter Verification ═══");
  console.log("  Address:", NEW_SWAP_ROUTER);
  console.log("  PancakeRouter:", await router.pancakeRouter());
  console.log("  PancakePool:", await router.pancakePool());
  console.log("  NodesV2:", await router.nodesV2());
  console.log("  PoolFee:", (await router.poolFee()).toString());
  console.log("  MaxSlippageBps:", (await router.maxSlippageBps()).toString());
  console.log("  Paused:", await router.paused());

  const spotPrice = await router.getSpotPrice();
  console.log("  SpotPrice:", ethers.formatEther(spotPrice));

  const [safe, sp, tp] = await router.isPriceSafe();
  console.log("  isPriceSafe:", safe);
  console.log("  ✅ New SwapRouter ready!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => { console.error(error); process.exit(1); });
