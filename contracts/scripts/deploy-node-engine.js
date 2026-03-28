const { ethers } = require("hardhat");

/**
 * Deploy CoinMaxNodeEngine — Node interest minting module
 *
 * Uses ERC1967Proxy pattern (same as Engine/Release deployments)
 * Deployer = admin, wires MINTER_ROLE on MAToken + VAULT_ROLE on Release
 *
 * Run: npx hardhat run scripts/deploy-node-engine.js --network bsc
 */

// Existing contract addresses (from redeploy-all / contracts.ts)
const MA = "0xdFaC84b2f9cfD02b3f44760E0Ff88b4EeC0e1593";
const RELEASE = "0x842b48a616fA107bcd18e3656edCe658D4279f92";
const ORACLE = "0xff5Ab71939Fa021A7BCa38Db8b3c1672D1B819dD";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("═══════════════════════════════════════════════════");
  console.log("  Deploy CoinMaxNodeEngine");
  console.log("═══════════════════════════════════════════════════");
  console.log("Deployer:", deployer.address);
  const startBal = ethers.formatEther(await ethers.provider.getBalance(deployer.address));
  console.log("Balance:", startBal, "BNB\n");

  const ERC1967 = await ethers.getContractFactory(
    "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol:ERC1967Proxy"
  );

  // ─── 1. Deploy NodeEngine implementation ──────────────────
  console.log("─── 1. Deploy NodeEngine implementation ───");
  const nodeEngineImpl = await (await ethers.getContractFactory("CoinMaxNodeEngine")).deploy();
  await nodeEngineImpl.waitForDeployment();
  const implAddr = await nodeEngineImpl.getAddress();
  console.log("  Implementation:", implAddr);

  // ─── 2. Deploy NodeEngine proxy ───────────────────────────
  console.log("\n─── 2. Deploy NodeEngine proxy ───");

  // initialize(maToken, releaseContract, priceOracle, admin, serverWallet)
  const iface = new ethers.Interface([
    "function initialize(address,address,address,address,address)"
  ]);
  const initData = iface.encodeFunctionData("initialize", [
    MA,                 // _maToken
    RELEASE,            // _releaseContract
    ORACLE,             // _priceOracle
    deployer.address,   // _admin (deployer = admin)
    deployer.address,   // _serverWallet (deployer can process for now)
  ]);

  const proxy = await ERC1967.deploy(implAddr, initData);
  await proxy.waitForDeployment();
  const nodeEngineAddr = await proxy.getAddress();
  console.log("  NodeEngine Proxy:", nodeEngineAddr);

  // ─── 3. Wire roles ────────────────────────────────────────
  console.log("\n─── 3. Wire roles ───");

  const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
  const VAULT_ROLE = ethers.keccak256(ethers.toUtf8Bytes("VAULT_ROLE"));

  // MAToken: grant MINTER_ROLE to NodeEngine (so it can mint MA)
  const ma = await ethers.getContractAt("MAToken", MA);
  let tx = await ma.grantRole(MINTER_ROLE, nodeEngineAddr);
  await tx.wait();
  console.log("  MA MINTER_ROLE → NodeEngine ✓");

  // Release: grant VAULT_ROLE to NodeEngine (so it can addAccumulated)
  const release = await ethers.getContractAt("CoinMaxRelease", RELEASE);
  tx = await release.grantRole(VAULT_ROLE, nodeEngineAddr);
  await tx.wait();
  console.log("  Release VAULT_ROLE → NodeEngine ✓");

  // ─── 4. Verify setup ─────────────────────────────────────
  console.log("\n─── 4. Verify ───");

  const hasMinter = await ma.hasRole(MINTER_ROLE, nodeEngineAddr);
  console.log("  MA.hasMinterRole(NodeEngine):", hasMinter);

  const hasVault = await release.hasRole(VAULT_ROLE, nodeEngineAddr);
  console.log("  Release.hasVaultRole(NodeEngine):", hasVault);

  // Check NodeEngine can read MA price from oracle
  const nodeEngine = await ethers.getContractAt("CoinMaxNodeEngine", nodeEngineAddr);
  try {
    const maPrice = await nodeEngine.getMAPrice();
    console.log("  NodeEngine.getMAPrice():", ethers.formatUnits(maPrice, 6), "USD");
  } catch (e) {
    console.log("  NodeEngine.getMAPrice(): fallback $0.10 (oracle may need FEEDER role)");
  }

  // ─── Done ─────────────────────────────────────────────────
  const finalBal = ethers.formatEther(await ethers.provider.getBalance(deployer.address));
  const gasUsed = (parseFloat(startBal) - parseFloat(finalBal)).toFixed(6);

  console.log("\n═══════════════════════════════════════════════════");
  console.log("  NODE ENGINE DEPLOYED SUCCESSFULLY");
  console.log("═══════════════════════════════════════════════════");
  console.log(`
  NodeEngine Impl:  ${implAddr}
  NodeEngine Proxy: ${nodeEngineAddr}

  Wired to:
    MAToken:  ${MA}     (MINTER_ROLE granted)
    Release:  ${RELEASE}  (VAULT_ROLE granted)
    Oracle:   ${ORACLE}

  Admin:    ${deployer.address}
  Gas used: ${gasUsed} BNB
  Balance:  ${finalBal} BNB

  ──────────────────────────────────────────────
  Next steps:
  1. Update .env: NODE_ENGINE_ADDRESS=${nodeEngineAddr}
  2. Update frontend contracts.ts: NODE_ENGINE_ADDRESS
  3. Deploy settle-node-interest edge function
  4. Set up daily cron for settle-node-interest
  `);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
