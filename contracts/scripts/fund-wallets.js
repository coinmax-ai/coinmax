const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  const bal = await ethers.provider.getBalance(deployer.address);
  console.log("Deployer:", deployer.address, "Balance:", ethers.formatEther(bal), "BNB\n");

  const wallets = [
    { addr: "0xeBAB6D22278c9839A46B86775b3AC9469710F84b", label: "vault" },
    { addr: "0x0831e8875685C796D05F2302D3c5C2Dd77fAc3B6", label: "trade" },
    { addr: "0x927eDe64b4B8a7C08Cf4225924Fa9c6759943E0A", label: "VIP" },
    { addr: "0x60D416dA873508c23C1315a2b750a31201959d78", label: "CoinMax" },
  ];

  // Send 0.005 BNB each (total 0.02 BNB)
  const amount = ethers.parseEther("0.005");

  for (const w of wallets) {
    const tx = await deployer.sendTransaction({ to: w.addr, value: amount });
    await tx.wait();
    console.log(`  ${w.label}: sent 0.005 BNB ✓`);
  }

  const finalBal = await ethers.provider.getBalance(deployer.address);
  console.log("\nRemaining:", ethers.formatEther(finalBal), "BNB");
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
