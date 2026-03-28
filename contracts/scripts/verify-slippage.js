const { ethers } = require("hardhat");

async function main() {
  const iface = new ethers.Interface(["function maxSlippageBps() view returns (uint256)"]);
  
  for (const [name, addr] of [
    ["Old SwapRouter", "0x5650383D9f8d8f80fc972b8F49A3cc31d3A7F7E3"],
    ["New Gateway", "0x38a692f51FF4Db415cf8620d131df518fb8F3b30"],
  ]) {
    const data = iface.encodeFunctionData("maxSlippageBps");
    const result = await ethers.provider.call({ to: addr, data });
    const val = iface.decodeFunctionResult("maxSlippageBps", result)[0];
    console.log(`${name}: ${val} bps (${Number(val)/100}%)`);
  }
}

main().catch(console.error);
