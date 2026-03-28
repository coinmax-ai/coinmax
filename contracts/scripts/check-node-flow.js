const { ethers } = require("hardhat");

async function main() {
  // Old SwapRouter (used by nodes)
  const SWAP_ROUTER = "0x5650383D9f8d8f80fc972b8F49A3cc31d3A7F7E3";
  const NODES_V2 = "0x17DDad4C9c2fD61859D37dD40300c419cBdd4cE2";

  // Read SwapRouter config
  const iface = new ethers.Interface([
    "function nodesV2() view returns (address)",
    "function vaultV2() view returns (address)",
    "function usdt() view returns (address)",
    "function usdc() view returns (address)",
    "function paused() view returns (bool)",
    "function owner() view returns (address)",
  ]);

  const provider = ethers.provider;
  const read = async (to, sig) => {
    const data = iface.encodeFunctionData(sig);
    const result = await provider.call({ to, data });
    return iface.decodeFunctionResult(sig, result)[0];
  };

  console.log("=== Old SwapRouter (0x5650) ===");
  try {
    console.log("  nodesV2:", await read(SWAP_ROUTER, "nodesV2"));
    console.log("  vaultV2:", await read(SWAP_ROUTER, "vaultV2"));
    console.log("  usdt:", await read(SWAP_ROUTER, "usdt"));
    console.log("  usdc:", await read(SWAP_ROUTER, "usdc"));
    console.log("  paused:", await read(SWAP_ROUTER, "paused"));
    console.log("  owner:", await read(SWAP_ROUTER, "owner"));
  } catch (e) {
    console.log("  Error:", e.message.slice(0, 100));
  }

  // Check NodesV2 
  console.log("\n=== NodesV2 (0x17DD) ===");
  const nodes = await ethers.getContractAt("CoinMaxNodesV2", NODES_V2);
  console.log("  swapRouter:", await nodes.swapRouter());
  console.log("  fundDistributor:", await nodes.fundDistributor());
  console.log("  usdc:", await nodes.usdc());
  console.log("  paused:", await nodes.paused());
  
  // The flow: SwapRouter.swapAndPurchaseNode → PancakeSwap swap → NodesV2.purchaseNodeFrom
  // NodesV2 checks msg.sender == swapRouter
  // So NodesV2.swapRouter must be 0x5650 (the old SwapRouter)
  const expectedRouter = "0x5650383D9f8d8f80fc972b8F49A3cc31d3A7F7E3";
  const actualRouter = await nodes.swapRouter();
  console.log("\n  NodesV2.swapRouter matches 0x5650:", actualRouter.toLowerCase() === expectedRouter.toLowerCase() ? "✅" : "❌");
  
  // Check: does SwapRouter point to correct NodesV2?
  const srNodes = await read(SWAP_ROUTER, "nodesV2");
  console.log("  SwapRouter.nodesV2 matches 0x17DD:", srNodes.toLowerCase() === NODES_V2.toLowerCase() ? "✅" : "❌");
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
