const { ethers } = require("hardhat");

async function main() {
  const SWAP_ROUTER = "0x5650383D9f8d8f80fc972b8F49A3cc31d3A7F7E3";
  
  const iface = new ethers.Interface([
    "function maxSlippageBps() view returns (uint256)",
    "function setMaxSlippageBps(uint256 _bps)",
  ]);
  
  const [deployer] = await ethers.getSigners();
  
  // Read current
  const readData = iface.encodeFunctionData("maxSlippageBps");
  const result = await ethers.provider.call({ to: SWAP_ROUTER, data: readData });
  const current = iface.decodeFunctionResult("maxSlippageBps", result)[0];
  console.log("Before:", current.toString(), "bps");
  
  // Set to 50 (0.5%)
  const setData = iface.encodeFunctionData("setMaxSlippageBps", [50]);
  const tx = await deployer.sendTransaction({ to: SWAP_ROUTER, data: setData });
  await tx.wait();
  
  // Verify
  const result2 = await ethers.provider.call({ to: SWAP_ROUTER, data: readData });
  const after = iface.decodeFunctionResult("maxSlippageBps", result2)[0];
  console.log("After:", after.toString(), "bps ✅");
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
