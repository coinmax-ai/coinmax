const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  const bb = await ethers.getContractAt("CoinMaxBatchBridge", "0x670dbfAA27C9a32023484B4BF7688171E70962f6");
  
  // Set ARB FundRouter as receiver
  const tx = await bb.setArbReceiver("0x71237E535d5E00CDf18A609eA003525baEae3489");
  await tx.wait();
  console.log("BatchBridge.arbReceiver → ARB FundRouter ✓");
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
