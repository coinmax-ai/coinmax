/**
 * Bridge Server Wallet USDT to ARB + Flush to 5 wallets
 *
 * Current situation: Server Wallet (0x85e4) holds 8600 USDT on BSC
 * This script: withdraw from 0x85e4 → deployer → bridge via 0x96dB → ARB flush
 *
 * Since 0x96dB (BatchBridgeV2 with correct PancakeSwap+Stargate) is owned by deployer,
 * we use it as the bridge vehicle.
 *
 * Run:
 *   npx hardhat run scripts/bridge-server-wallet.js --network bsc
 *   (wait 2-3 min)
 *   npx hardhat run scripts/bridge-server-wallet.js --network arbitrum
 */
const { ethers } = require("hardhat");

async function bsc() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("BNB:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)));

  const BB   = "0x96dBfe3aAa877A4f9fB41d592f1D990368a4B2C1";
  const USDT = "0x55d398326f99059fF775485246999027B3197955";
  const SW   = "0x85e44A8Be3B0b08e437B16759357300A4Cd1d95b";

  const usdt = await ethers.getContractAt("IERC20", USDT);
  const bb   = await ethers.getContractAt("CoinMaxBatchBridgeV2", BB);

  // Check balances
  const swBal = await usdt.balanceOf(SW);
  const depBal = await usdt.balanceOf(deployer.address);
  const bbBal = await usdt.balanceOf(BB);

  console.log("\n=== Current ===");
  console.log("Server Wallet USDT:", ethers.formatEther(swBal));
  console.log("Deployer USDT:", ethers.formatEther(depBal));
  console.log("BB(0x96dB) USDT:", ethers.formatEther(bbBal));

  // Total USDT available (deployer + BB)
  const totalInDeployer = depBal;
  const totalInBB = bbBal;
  const total = totalInDeployer + totalInBB;

  if (total < ethers.parseEther("50")) {
    // Need to get USDT from Server Wallet to BB
    console.log("\n⚠️  Server Wallet 的 USDT 需要手动转到 BatchBridge");
    console.log("   Server Wallet 不是 deployer 控制的 EOA");
    console.log("   请用 thirdweb Dashboard 或 edge function 转出");

    if (totalInDeployer > 0n) {
      // Move deployer USDT to BB first
      console.log("\nMoving deployer USDT →  BB...");
      await (await usdt.transfer(BB, totalInDeployer)).wait();
      console.log("✅ Sent", ethers.formatEther(totalInDeployer));
    }
  }

  // If deployer has USDT, send to BB
  const depBalNow = await usdt.balanceOf(deployer.address);
  if (depBalNow > 0n) {
    console.log("\nSending deployer USDT → BB...");
    await (await usdt.transfer(BB, depBalNow)).wait();
  }

  const bbBalNow = await usdt.balanceOf(BB);
  console.log("\nBB USDT:", ethers.formatEther(bbBalNow));

  if (bbBalNow < ethers.parseEther("50")) {
    console.log("❌ Not enough USDT in BB to bridge. Need Server Wallet to send USDT first.");
    return;
  }

  // Ensure BNB
  const bbBnb = await ethers.provider.getBalance(BB);
  if (bbBnb < ethers.parseEther("0.02")) {
    console.log("Sending BNB to BB...");
    await (await deployer.sendTransaction({ to: BB, value: ethers.parseEther("0.02") })).wait();
  }

  // Set interval=0 and bridge
  await (await bb.setBridgeInterval(0)).wait();

  console.log("\n🚀 swapAndBridge:", ethers.formatEther(bbBalNow), "USDT → ARB");
  const tx = await bb.swapAndBridge({ gasLimit: 1000000 });
  console.log("TX:", tx.hash);
  const receipt = await tx.wait();

  if (receipt.status === 1) {
    console.log("✅ BRIDGE SUCCESS!");
    for (const log of receipt.logs) {
      try {
        const parsed = bb.interface.parseLog(log);
        if (parsed?.name === "SwappedAndBridged") {
          console.log("  USDT in:", ethers.formatEther(parsed.args[0]));
          console.log("  USDC out:", ethers.formatEther(parsed.args[1]));
          console.log("  Fee:", ethers.formatEther(parsed.args[2]), "BNB");
        }
      } catch {}
    }
    console.log("\n⏳ Run with --network arbitrum in 2-3 min to flush");
  } else {
    console.log("❌ REVERTED");
  }

  await (await bb.setBridgeInterval(600)).wait();
}

async function arb() {
  const [deployer] = await ethers.getSigners();
  const FUND_ROUTER = "0x71237E535d5E00CDf18A609eA003525baEae3489";
  const ARB_USDC = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";

  const router = await ethers.getContractAt("CoinMaxFundRouter", FUND_ROUTER);
  const usdc = await ethers.getContractAt("IERC20", ARB_USDC);

  const bal = await usdc.balanceOf(FUND_ROUTER);
  console.log("FundRouter USDC:", ethers.formatUnits(bal, 6));

  if (bal == 0n) {
    console.log("⏳ No funds yet. Wait for Stargate.");
    return;
  }

  // Flush
  console.log("\n🚀 flushAll()...");
  const tx = await router.flushAll();
  console.log("TX:", tx.hash);
  await tx.wait();
  console.log("✅ FLUSHED!");

  const slotCount = await router.slotCount();
  for (let i = 0; i < Number(slotCount); i++) {
    const [wallet, share] = await router.getSlot(i);
    const b = await usdc.balanceOf(wallet);
    console.log(`  ${wallet} (${Number(share)/100}%) → $${ethers.formatUnits(b, 6)}`);
  }
}

async function main() {
  const chainId = (await ethers.provider.getNetwork()).chainId;
  if (chainId === 56n) await bsc();
  else if (chainId === 42161n) await arb();
  else console.log("Use --network bsc or --network arbitrum");
}

main().catch(console.error);
