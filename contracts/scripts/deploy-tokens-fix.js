const { ethers } = require("hardhat");

const VAULT   = "0xE0A80b82F42d009cdE772d5c34b1682C2D79e821";
const ENGINE  = "0x696a19562B30aD4F0f85C93f2369F044757849aB";
const GATEWAY = "0x62ac5FabC1a3bFd26B423F42FFb0934D4D3721eb";
const ORACLE  = "0x3EC635802091b9F95b2891f3fd2504499f710145";
const RELEASE = "0xC80724a4133c90824A64914323fE856019D52B67";
const FORWARDER = "0x6EF9AD688dFD9B545158b05FC51ab38B9D5a8556";

const W_VAULT   = "0xeBAB6D22278c9839A46B86775b3AC9469710F84b";
const W_TRADE   = "0x0831e8875685C796D05F2302D3c5C2Dd77fAc3B6";
const W_VIP     = "0x927eDe64b4B8a7C08Cf4225924Fa9c6759943E0A";
const W_COINMAX = "0x60D416dA873508c23C1315a2b750a31201959d78";
const W_RELAYER = "0xcb41F3C3eD6C255F57Cda1bA3fd42389B0f0F0aA";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "BNB\n");
  let tx;

  const MINTER  = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
  const ADMIN   = ethers.ZeroHash;
  const FEEDER  = ethers.keccak256(ethers.toUtf8Bytes("FEEDER_ROLE"));
  const SERVER  = ethers.keccak256(ethers.toUtf8Bytes("SERVER_ROLE"));
  const KEEPER  = ethers.keccak256(ethers.toUtf8Bytes("KEEPER_ROLE"));
  const VAULT_R = ethers.keccak256(ethers.toUtf8Bytes("VAULT_ROLE"));
  const ENGINE_R= ethers.keccak256(ethers.toUtf8Bytes("ENGINE_ROLE"));
  const GATEWAY_R=ethers.keccak256(ethers.toUtf8Bytes("GATEWAY_ROLE"));

  // ─── 1. Deploy MA + CUSD (admin = deployer) ────────────
  console.log("─── 1. Deploy tokens (admin = deployer) ───");
  const ma = await (await ethers.getContractFactory("MAToken")).deploy(deployer.address);
  await ma.waitForDeployment();
  const maAddr = await ma.getAddress();
  console.log("  MA:", maAddr);

  const cusd = await (await ethers.getContractFactory("CUSD")).deploy(deployer.address);
  await cusd.waitForDeployment();
  const cusdAddr = await cusd.getAddress();
  console.log("  CUSD:", cusdAddr);

  // ─── 2. Grant MINTER on MA → Vault + Engine ────────────
  console.log("\n─── 2. MA MINTER roles ───");
  tx = await ma.grantRole(MINTER, VAULT); await tx.wait();
  console.log("  MA MINTER → Vault ✓");
  tx = await ma.grantRole(MINTER, ENGINE); await tx.wait();
  console.log("  MA MINTER → Engine ✓");

  // ─── 3. Grant MINTER on CUSD → Gateway ─────────────────
  console.log("\n─── 3. CUSD MINTER roles ───");
  tx = await cusd.grantRole(MINTER, GATEWAY); await tx.wait();
  console.log("  CUSD MINTER → Gateway ✓");

  // ─── 4. Update Vault: setMAToken ────────────────────────
  console.log("\n─── 4. Update Vault ───");
  const vault = await ethers.getContractAt("CoinMaxVault", VAULT);
  tx = await vault.setMAToken(maAddr); await tx.wait();
  console.log("  Vault.setMAToken ✓");

  // Set forwarder on Vault
  try {
    tx = await vault.setTrustedForwarder(FORWARDER); await tx.wait();
    console.log("  Vault.setForwarder ✓");
  } catch { console.log("  Vault.setForwarder skipped"); }

  // ─── 5. Update Engine/Release/Gateway/Oracle via relayer ──
  // Relayer (0xcb41) has admin on these. But we can't use it from hardhat.
  // Instead: deployer has admin on Vault. For Engine/Release/Gateway/Oracle,
  // check if deployer has admin:
  console.log("\n─── 5. Update Engine/Gateway (if deployer has access) ───");

  // Engine: relayer has admin. Deployer does not. Skip.
  // Gateway: relayer has admin. Deployer does not. Skip.
  // These need to be updated via the relayer wallet directly.
  console.log("  Engine/Gateway/Release/Oracle updates need relayer.");
  console.log("  Relayer has admin but thirdweb API signing fails.");
  console.log("  SOLUTION: Transfer BNB to relayer, then call directly.");

  // ─── 6. Transfer token admin to CoinMax wallet ─────────
  // Keep deployer as admin for now until everything verified
  console.log("\n─── 6. Grant token admin to Server Wallets ───");
  tx = await ma.grantRole(ADMIN, W_COINMAX); await tx.wait();
  console.log("  MA ADMIN → CoinMax wallet ✓");
  tx = await cusd.grantRole(ADMIN, W_COINMAX); await tx.wait();
  console.log("  CUSD ADMIN → CoinMax wallet ✓");

  // Don't renounce deployer yet — keep as backup
  console.log("  Deployer keeps admin as backup");

  // ─── Done ──────────────────────────────────────────────
  const finalBal = ethers.formatEther(await ethers.provider.getBalance(deployer.address));
  console.log(`\n═══════════════════════════════════════`);
  console.log(`  MAToken:  ${maAddr}`);
  console.log(`  CUSD:     ${cusdAddr}`);
  console.log(`  Gas used: ${(0.06187 - parseFloat(finalBal)).toFixed(6)} BNB`);
  console.log(`  Balance:  ${finalBal} BNB`);
  console.log(`═══════════════════════════════════════`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
