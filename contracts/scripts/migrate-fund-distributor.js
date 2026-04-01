/**
 * Migrate fundDistributor: 0x5802 → 0x1Baa (BatchBridgeV2)
 *
 * 1. Withdraw 3000 USDT from old fundDistributor (0x5802) → BatchBridgeV2 (0x1Baa)
 * 2. Update Vault.fundDistributor → 0x1Baa
 * 3. Verify everything
 *
 * Run: npx hardhat run scripts/migrate-fund-distributor.js --network bsc
 */
const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const OLD_FD = "0x5802b562105a7974c7deb6ad82fad2a9ca377d79";
  const NEW_FD = "0x1Baa40837a253DA171a458A979f87b9A29CE0Efa"; // BatchBridgeV2
  const VAULT = "0xE0A80b82F42d009cdE772d5c34b1682C2D79e821";
  const USDT = "0x55d398326f99059fF775485246999027B3197955";

  const usdt = await ethers.getContractAt("IERC20", USDT);
  const oldFd = await ethers.getContractAt("CoinMaxBatchBridgeV2", OLD_FD);
  const vault = await ethers.getContractAt("CoinMaxVault", VAULT);

  // Current state
  const oldBal = await usdt.balanceOf(OLD_FD);
  const newBal = await usdt.balanceOf(NEW_FD);
  const currentFd = await vault.fundDistributor();
  console.log("\n=== Before ===");
  console.log("Old FD (0x5802) USDT:", ethers.formatEther(oldBal));
  console.log("New FD (0x1Baa) USDT:", ethers.formatEther(newBal));
  console.log("Vault fundDistributor:", currentFd);

  // Step 1: Move USDT from old → new
  if (oldBal > 0n) {
    console.log("\n[1] Withdrawing USDT from old FD to BatchBridgeV2...");
    const tx1 = await oldFd.withdrawAll(NEW_FD);
    await tx1.wait();
    console.log("✅ TX:", tx1.hash);
  } else {
    console.log("\n[1] Old FD already empty, skip");
  }

  // Step 2: Update Vault fundDistributor
  if (currentFd.toLowerCase() !== NEW_FD.toLowerCase()) {
    console.log("\n[2] Setting Vault fundDistributor → BatchBridgeV2...");
    const tx2 = await vault.setFundDistributor(NEW_FD);
    await tx2.wait();
    console.log("✅ TX:", tx2.hash);
  } else {
    console.log("\n[2] Already pointing to BatchBridgeV2, skip");
  }

  // Verify
  console.log("\n=== After ===");
  console.log("Old FD (0x5802) USDT:", ethers.formatEther(await usdt.balanceOf(OLD_FD)));
  console.log("New FD (0x1Baa) USDT:", ethers.formatEther(await usdt.balanceOf(NEW_FD)));
  console.log("Vault fundDistributor:", await vault.fundDistributor());
  console.log("Deployer BNB:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)));

  // Check BatchBridgeV2 BNB (needed for Stargate fees)
  const bridgeBnb = await ethers.provider.getBalance(NEW_FD);
  console.log("BatchBridgeV2 BNB:", ethers.formatEther(bridgeBnb));
  if (bridgeBnb < ethers.parseEther("0.01")) {
    console.log("⚠️  BatchBridgeV2 BNB too low for Stargate fees, sending 0.02 BNB...");
    const tx3 = await deployer.sendTransaction({ to: NEW_FD, value: ethers.parseEther("0.02") });
    await tx3.wait();
    console.log("✅ Sent 0.02 BNB, now:", ethers.formatEther(await ethers.provider.getBalance(NEW_FD)));
  }

  console.log("\n✅ Migration complete. batch-bridge edge function will now auto-bridge from 0x1Baa.");
}

main().catch(console.error);
