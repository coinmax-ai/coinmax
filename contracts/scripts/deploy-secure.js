const { ethers } = require("hardhat");

/**
 * CoinMax Secure Redeployment
 *
 * 1. Deploy new MAToken + CUSD (admin = CoinMax wallet)
 * 2. Deploy MinimalForwarder (EIP-2771)
 * 3. Deploy TimelockController (24h delay)
 * 4. Update existing Vault/Engine/Release/Gateway/Oracle with:
 *    - New MA/CUSD addresses
 *    - Correct Server Wallet roles
 *    - Trusted Forwarder
 * 5. Grant MINTER roles on new tokens
 * 6. Deployer renounces all roles at the end
 */

// ═══════════════════════════════════════════════════════════════
//  WALLET ADDRESSES
// ═══════════════════════════════════════════════════════════════

const W = {
  vault:   "0xeBAB6D22278c9839A46B86775b3AC9469710F84b", // Vault/Engine/Release/Gateway admin
  trade:   "0x0831e8875685C796D05F2302D3c5C2Dd77fAc3B6", // SERVER_ROLE on Engine, Splitter owner
  vip:     "0x927eDe64b4B8a7C08Cf4225924Fa9c6759943E0A", // Oracle FEEDER, VIP ops
  coinmax: "0x60D416dA873508c23C1315a2b750a31201959d78", // MA + CUSD token admin
  relayer: "0xcb41F3C3eD6C255F57Cda1bA3fd42389B0f0F0aA", // Gas payer (no contract roles)
};

// Existing contracts (keep, just update roles)
const EXISTING = {
  vault:    "0xE0A80b82F42d009cdE772d5c34b1682C2D79e821",
  engine:   "0x696a19562B30aD4F0f85C93f2369F044757849aB",
  release:  "0xC80724a4133c90824A64914323fE856019D52B67",
  gateway:  "0x62ac5FabC1a3bFd26B423F42FFb0934D4D3721eb",
  oracle:   "0x3EC635802091b9F95b2891f3fd2504499f710145",
  splitter: "0xcfF14557337368E4A9E09586B0833C5Bbf323845",
};

// Role hashes
const ROLES = {
  ADMIN:    ethers.ZeroHash,
  MINTER:   ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE")),
  GATEWAY:  ethers.keccak256(ethers.toUtf8Bytes("GATEWAY_ROLE")),
  ENGINE:   ethers.keccak256(ethers.toUtf8Bytes("ENGINE_ROLE")),
  VAULT_R:  ethers.keccak256(ethers.toUtf8Bytes("VAULT_ROLE")),
  PRICE:    ethers.keccak256(ethers.toUtf8Bytes("PRICE_ROLE")),
  FEEDER:   ethers.keccak256(ethers.toUtf8Bytes("FEEDER_ROLE")),
  SERVER:   ethers.keccak256(ethers.toUtf8Bytes("SERVER_ROLE")),
  KEEPER:   ethers.keccak256(ethers.toUtf8Bytes("KEEPER_ROLE")),
};

async function main() {
  const [deployer] = await ethers.getSigners();
  const startBal = ethers.formatEther(await ethers.provider.getBalance(deployer.address));
  console.log("═══════════════════════════════════════════════════");
  console.log("  CoinMax Secure Redeployment");
  console.log("═══════════════════════════════════════════════════");
  console.log("  Deployer:", deployer.address);
  console.log("  Balance: ", startBal, "BNB\n");

  let tx;
  const deployed = {};

  // Already deployed in previous run:
  deployed.ma = "0x747365a9c0303e05F2837ce251084F453D91c282";
  deployed.cusd = "0x030E198beA1a5C140D713EF9c7589fD3DD099079";
  deployed.forwarder = "0x6EF9AD688dFD9B545158b05FC51ab38B9D5a8556";
  console.log("─── 1-3. Already deployed ───");
  console.log("  MAToken:", deployed.ma);
  console.log("  CUSD:", deployed.cusd);
  console.log("  Forwarder:", deployed.forwarder);

  // ─── 4. Deploy TimelockController ─────────────────────────
  console.log("\n─── 4. TimelockController (24h delay) ───");
  const minDelay = 24 * 3600; // 24 hours
  const proposers = [W.vault]; // only vault wallet can propose
  const executors = [W.vault, W.trade]; // vault + trade can execute
  const adminAddr = deployer.address; // deployer is temp admin, will renounce

  const TL = await (await ethers.getContractFactory("CoinMaxTimelock"))
    .deploy(minDelay, proposers, executors, adminAddr);
  await TL.waitForDeployment();
  deployed.timelock = await TL.getAddress();
  console.log("  Timelock:", deployed.timelock);

  // ─── 5. Update existing Vault ─────────────────────────────
  console.log("\n─── 5. Update Vault ───");
  const vault = await ethers.getContractAt("CoinMaxVault", EXISTING.vault);

  // Set new MA Token
  tx = await vault.setMAToken(deployed.ma); await tx.wait();
  console.log("  setMAToken ✓");

  // Set forwarder
  try {
    tx = await vault.setTrustedForwarder(deployed.forwarder); await tx.wait();
    console.log("  setTrustedForwarder ✓");
  } catch (e) { console.log("  setTrustedForwarder skipped (function may not exist yet)"); }

  // Grant roles to correct wallets
  tx = await vault.grantRole(ROLES.ADMIN, W.vault); await tx.wait();
  console.log("  ADMIN → vault wallet ✓");
  tx = await vault.grantRole(ROLES.ADMIN, deployed.timelock); await tx.wait();
  console.log("  ADMIN → timelock ✓");
  tx = await vault.grantRole(ROLES.PRICE, W.vip); await tx.wait();
  console.log("  PRICE → VIP wallet ✓");

  // ─── 6. Update Engine (relayer has admin) ─────────────────
  // Note: relayer 0xcb41 has admin but we're deployer here.
  // If deployer doesn't have admin, we'll need thirdweb API later.
  console.log("\n─── 6. Grant roles on Engine/Release/Gateway/Oracle ───");
  console.log("  (These need relayer/thirdweb API - will do via API after deploy)");

  // ─── 7. Grant MINTER on new tokens ────────────────────────
  // MA Token admin = CoinMax wallet, not deployer.
  // We'll use thirdweb API from CoinMax wallet to grant MINTER.
  console.log("\n─── 7. MINTER roles (needs CoinMax wallet via thirdweb API) ───");
  console.log("  MA MINTER → Vault:", EXISTING.vault);
  console.log("  MA MINTER → Engine:", EXISTING.engine);
  console.log("  CUSD MINTER → Gateway:", EXISTING.gateway);

  // ─── 8. Deployer renounces Vault admin (keep until verified) ──
  console.log("\n─── 8. Deployer keeps Vault admin until API roles verified ───");
  console.log("  (Run renounce script after verifying all roles via thirdweb API)");

  // ─── Summary ──────────────────────────────────────────────
  const finalBal = ethers.formatEther(await ethers.provider.getBalance(deployer.address));
  const gasUsed = (parseFloat(startBal) - parseFloat(finalBal)).toFixed(6);

  console.log("\n═══════════════════════════════════════════════════");
  console.log("  DEPLOYMENT COMPLETE");
  console.log("═══════════════════════════════════════════════════");
  console.log(`
  NEW:
    MAToken:     ${deployed.ma}
    CUSD:        ${deployed.cusd}
    Forwarder:   ${deployed.forwarder}
    Timelock:    ${deployed.timelock}

  EXISTING (updated):
    Vault:       ${EXISTING.vault} → new MA + vault wallet admin
    Engine:      ${EXISTING.engine}
    Release:     ${EXISTING.release}
    Gateway:     ${EXISTING.gateway}
    Oracle:      ${EXISTING.oracle}
    Splitter:    ${EXISTING.splitter}

  WALLETS:
    vault:       ${W.vault}
    trade:       ${W.trade}
    VIP:         ${W.vip}
    CoinMax:     ${W.coinmax}
    relayer:     ${W.relayer}

  Gas: ${gasUsed} BNB | Remaining: ${finalBal} BNB

  NEXT STEPS (via thirdweb API):
  1. CoinMax wallet: grant MINTER on MA → Vault + Engine
  2. CoinMax wallet: grant MINTER on CUSD → Gateway
  3. Relayer (has admin): grant roles on Engine/Release/Gateway/Oracle → correct wallets
  4. Relayer: set trustedForwarder on Engine/Release/Gateway/Oracle
  5. Verify all roles, then deployer renounces Vault admin
  `);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
