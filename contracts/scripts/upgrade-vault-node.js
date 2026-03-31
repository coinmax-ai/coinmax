const { ethers } = require("hardhat");
async function main() {
  const VAULT = "0x2E07f56219FB9f39DcAce289288DE07F2bA96B93";
  const NODE_WALLET = "0xeb8AbD9b47F9Ca0d20e22636B2004B75E84BdcD9";

  // Deploy new impl
  const Impl = await ethers.getContractFactory("CoinMaxVault");
  const impl = await Impl.deploy({ gasLimit: 5000000 });
  await impl.waitForDeployment();
  console.log("New impl:", await impl.getAddress());

  // Upgrade
  const vault = await ethers.getContractAt("CoinMaxVault", VAULT);
  await (await vault.upgradeToAndCall(await impl.getAddress(), "0x")).wait();
  console.log("Upgraded ✅");

  // Set nodeReceiver = node wallet (direct, no relay)
  await (await vault.setNodeReceiver(NODE_WALLET)).wait();
  console.log("nodeReceiver:", await vault.nodeReceiver());
  console.log("= Node wallet 0xeb8A → 节点购买资金直接到账 ✅");
}
main().catch(console.error);
