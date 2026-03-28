/**
 * Update MA Price Oracle
 *
 * Usage:
 *   DEPLOYER_PRIVATE_KEY=0x... npx hardhat run scripts/update-oracle-price.js --network arbitrum
 *
 * Uses emergencySetPrice() to bypass 10% per-update limit.
 * Only admin role can call this.
 */

const { ethers } = require("hardhat");

const ORACLE_ADDRESS = process.env.PRICE_ORACLE_ADDRESS || "0x3EC635802091b9F95b2891f3fd2504499f710145";

// Target price in 6 decimals (e.g. 530000 = $0.53)
const TARGET_PRICE = process.env.TARGET_PRICE || "530000";

const ORACLE_ABI = [
  "function price() view returns (uint256)",
  "function emergencySetPrice(uint256 _price)",
  "function updatePrice(uint256 _newPrice)",
  "function getPriceUnsafe() view returns (uint256)",
  "function lastUpdateTime() view returns (uint256)",
  "function maxChangeRate() view returns (uint256)",
];

async function main() {
  const [signer] = await ethers.getSigners();
  console.log("Signer:", signer.address);

  const oracle = new ethers.Contract(ORACLE_ADDRESS, ORACLE_ABI, signer);

  const currentPrice = await oracle.getPriceUnsafe();
  console.log("Current price:", currentPrice.toString(), `($${(Number(currentPrice) / 1e6).toFixed(4)})`);
  console.log("Target price:", TARGET_PRICE, `($${(Number(TARGET_PRICE) / 1e6).toFixed(4)})`);

  if (currentPrice.toString() === TARGET_PRICE) {
    console.log("Already at target price");
    return;
  }

  console.log("\nCalling emergencySetPrice...");
  const tx = await oracle.emergencySetPrice(TARGET_PRICE);
  console.log("Tx hash:", tx.hash);
  await tx.wait();

  const newPrice = await oracle.getPriceUnsafe();
  console.log("New price:", newPrice.toString(), `($${(Number(newPrice) / 1e6).toFixed(4)})`);
  console.log("Done!");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
