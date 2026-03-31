const { ethers } = require("hardhat");
async function main() {
  const vault = await ethers.getContractAt("CoinMaxVault", "0x2E07f56219FB9f39DcAce289288DE07F2bA96B93");
  // nodeReceiver = Server Wallet A (0xeBAB) — flush-node-pool does 3-hop relay from here
  await (await vault.setNodeReceiver("0xeBAB6D22278c9839A46B86775b3AC9469710F84b")).wait();
  console.log("nodeReceiver:", await vault.nodeReceiver());
}
main().catch(console.error);
