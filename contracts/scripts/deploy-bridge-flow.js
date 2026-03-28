const { ethers } = require("hardhat");

/**
 * Deploy BatchBridge (BSC) + Update Gateway treasury
 * Then deploy FundRouter (ARB) in separate script
 */

// BSC Stargate V2 USDC Pool (acts as router for OFT sends)
const STARGATE_USDC_BSC = "0xBdEAe1cA48894A1759A8374D63925f21f2Ee2639";
const ARB_EID = 30110; // LayerZero Arbitrum endpoint ID
const BSC_USDC = "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d";

// Will set ARB receiver after deploying FundRouter on ARB
const PLACEHOLDER_RECEIVER = "0x1B6B492d8fbB8ded7dC6E1D48564695cE5BCB9b1"; // deployer as temp

const GATEWAY = "0xaC126bd86728D81dA05Df67f1E262085d072C36D";
const VAULT = "0xE0A80b82F42d009cdE772d5c34b1682C2D79e821";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "BNB\n");
  let tx;

  // ─── 1. Deploy BatchBridge ────────────────────────────
  console.log("─── 1. Deploy BatchBridge ───");
  const BB = await (await ethers.getContractFactory("CoinMaxBatchBridge")).deploy(
    BSC_USDC,
    STARGATE_USDC_BSC,
    PLACEHOLDER_RECEIVER, // update after ARB deploy
    ARB_EID
  );
  await BB.waitForDeployment();
  const bbAddr = await BB.getAddress();
  console.log("  BatchBridge:", bbAddr);

  // ─── 2. Update Gateway treasury → BatchBridge ─────────
  console.log("\n─── 2. Update Gateway ───");
  const gateway = await ethers.getContractAt("CoinMaxGateway", GATEWAY);
  tx = await gateway.setTreasury(bbAddr);
  await tx.wait();
  console.log("  Gateway.treasury → BatchBridge ✓");

  // ─── 3. Update Vault fundDistributor → BatchBridge ────
  console.log("\n─── 3. Update Vault ───");
  const vault = await ethers.getContractAt("CoinMaxVault", VAULT);
  tx = await vault.setFundDistributor(bbAddr);
  await tx.wait();
  console.log("  Vault.fundDistributor → BatchBridge ✓");

  // ─── Done ─────────────────────────────────────────────
  const finalBal = ethers.formatEther(await ethers.provider.getBalance(deployer.address));
  console.log(`
═══════════════════════════════════════
  BSC 部署完成
═══════════════════════════════════════
  BatchBridge: ${bbAddr}
  Gateway.treasury → BatchBridge ✓
  Vault.fundDistributor → BatchBridge ✓
  
  Balance: ${finalBal} BNB
  
  链路: 用户 USDT → Gateway → USDC → BatchBridge (累积)
        每4h → Stargate → ARB FundRouter → 5钱包
  
  下一步: 部署 ARB FundRouter, 然后更新 BatchBridge.arbReceiver
  `);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
