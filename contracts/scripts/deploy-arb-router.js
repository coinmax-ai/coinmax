const { ethers } = require("hardhat");

/**
 * Deploy FundRouter on Arbitrum
 * Receives USDC from BSC BatchBridge via Stargate
 * Server Wallets distribute to 5 wallets
 */

const ARB_USDC = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831"; // native USDC on ARB (6 decimals)

// Server Wallets
const W_VAULT = "0xeBAB6D22278c9839A46B86775b3AC9469710F84b";
const W_TRADE = "0x0831e8875685C796D05F2302D3c5C2Dd77fAc3B6";

// 5 distribution wallets (same addresses, they'll receive on ARB)
const DIST_WALLETS = [
  "0xd12097C9A12617c49220c032C84aCc99B6fFf57b", // Trading 30%
  "0xDf90770C89732a7eba5B727fCd6a12f827102EE6", // Ops 8%
  "0x1C4D983620B3c8c2f7607c0943f2A5989e655599", // Marketing 12%
  "0x85c3d07Ee3be12d6502353b4cA52B30cD85Ac5ff", // Investor 20%
  "0x7DEa369864583E792D230D360C0a4C56c2103FE4", // Withdraw 30%
];
const DIST_SHARES = [3000, 800, 1200, 2000, 3000]; // = 10000

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH (ARB)\n");
  let tx;

  const ERC1967 = await ethers.getContractFactory("@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol:ERC1967Proxy");

  // ─── 1. Deploy FundRouter implementation ──────────────
  console.log("─── 1. FundRouter impl ───");
  const impl = await (await ethers.getContractFactory("CoinMaxFundRouter")).deploy();
  await impl.waitForDeployment();
  const implAddr = await impl.getAddress();
  console.log("  Impl:", implAddr);

  // ─── 2. Deploy proxy ──────────────────────────────────
  console.log("\n─── 2. FundRouter proxy ───");
  const iface = new ethers.Interface(["function initialize(address,address,address)"]);
  const initData = iface.encodeFunctionData("initialize", [ARB_USDC, deployer.address, deployer.address]);
  const proxy = await ERC1967.deploy(implAddr, initData);
  await proxy.waitForDeployment();
  const proxyAddr = await proxy.getAddress();
  console.log("  Proxy:", proxyAddr);

  // ─── 3. Configure distribution ────────────────────────
  console.log("\n─── 3. Configure 5 wallets ───");
  const router = await ethers.getContractAt("CoinMaxFundRouter", proxyAddr);
  tx = await router.configure(DIST_WALLETS, DIST_SHARES);
  await tx.wait();
  console.log("  Configured: 30/8/12/20/30 ✓");

  // ─── 4. Grant OPERATOR to trade wallet ────────────────
  // (Will be done via thirdweb later, or keep deployer for now)
  console.log("\n─── 4. Deployer keeps admin (will transfer to Server Wallet later) ───");

  const finalBal = ethers.formatEther(await ethers.provider.getBalance(deployer.address));
  console.log(`
═══════════════════════════════════════
  ARB FundRouter 部署完成
═══════════════════════════════════════
  Implementation: ${implAddr}
  Proxy:          ${proxyAddr}
  USDC:           ${ARB_USDC}
  
  分配: Trading 30% | Ops 8% | Marketing 12% | Investor 20% | Withdraw 30%
  
  可升级: ✅ UUPS Proxy
  Admin: deployer
  Balance: ${finalBal} ETH
  
  下一步: 更新 BSC BatchBridge.arbReceiver → ${proxyAddr}
  `);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
