const { ethers } = require("hardhat");

const SERVER_WALLET = "0x85e44A8Be3B0b08e437B16759357300A4Cd1d95b";

// All deployed addresses
const D = {
  ma:          "0xE3d19D3299B0C2D6c5FDB74dBb79b102449Edc36",
  cusd:        "0x90B99a1495E5DBf8bF44c3623657020BB1BDa3C6",
  oracle:      "0x3EC635802091b9F95b2891f3fd2504499f710145",
  splitter:    "0xcfF14557337368E4A9E09586B0833C5Bbf323845",
  release:     "0xC80724a4133c90824A64914323fE856019D52B67",
  vault:       "0xC3E05890dB946B311b00AB64cA255FdcC3643F0a",
  engine:      "0x696a19562B30aD4F0f85C93f2369F044757849aB",
  gateway:     "0x62ac5FabC1a3bFd26B423F42FFb0934D4D3721eb",
};

async function main() {
  const [deployer] = await ethers.getSigners();
  const startBal = ethers.formatEther(await ethers.provider.getBalance(deployer.address));
  console.log("Deployer:", deployer.address, "| Balance:", startBal, "BNB\n");
  let tx;

  const GATEWAY = ethers.keccak256(ethers.toUtf8Bytes("GATEWAY_ROLE"));
  const ENGINE  = ethers.keccak256(ethers.toUtf8Bytes("ENGINE_ROLE"));
  const VAULT_R = ethers.keccak256(ethers.toUtf8Bytes("VAULT_ROLE"));
  const PRICE   = ethers.keccak256(ethers.toUtf8Bytes("PRICE_ROLE"));
  const ADMIN   = ethers.ZeroHash;

  const vault   = await ethers.getContractAt("CoinMaxVault", D.vault);
  const release = await ethers.getContractAt("CoinMaxRelease", D.release);
  const engine  = await ethers.getContractAt("CoinMaxInterestEngine", D.engine);
  const gw      = await ethers.getContractAt("CoinMaxGateway", D.gateway);
  const oracle  = await ethers.getContractAt("MAPriceOracle", D.oracle);
  const splitter= await ethers.getContractAt("CoinMaxSplitter", D.splitter);

  // ─── 1. Deployer-owned contracts: set roles ───────────────
  console.log("─── 1. Set Roles (deployer-owned) ───\n");

  // Vault: GATEWAY, ENGINE, PRICE
  tx = await vault.grantRole(GATEWAY, D.gateway); await tx.wait();
  tx = await vault.grantRole(ENGINE, D.engine); await tx.wait();
  tx = await vault.grantRole(PRICE, SERVER_WALLET); await tx.wait();
  console.log("  Vault: GATEWAY + ENGINE + PRICE ✓");

  // Vault: set oracle
  tx = await vault.setPriceOracle(D.oracle); await tx.wait();
  console.log("  Vault → Oracle ✓");

  // Release: VAULT → Engine
  tx = await release.grantRole(VAULT_R, D.engine); await tx.wait();
  console.log("  Release: VAULT → Engine ✓");

  // Gateway: set cUSD + Vault
  tx = await gw.setCUsd(D.cusd); await tx.wait();
  tx = await gw.setVault(D.vault); await tx.wait();
  console.log("  Gateway → cUSD + Vault ✓");

  // ─── 2. Transfer Admin → Server Wallet ────────────────────
  console.log("\n─── 2. Admin → Server Wallet ───\n");

  for (const [name, c] of [["Vault", vault], ["Release", release], ["Engine", engine], ["Gateway", gw], ["Oracle", oracle]]) {
    tx = await c.grantRole(ADMIN, SERVER_WALLET); await tx.wait();
    tx = await c.renounceRole(ADMIN, deployer.address); await tx.wait();
    console.log(`  ${name} ✓`);
  }

  tx = await splitter.transferOwnership(SERVER_WALLET); await tx.wait();
  console.log("  Splitter ✓");

  // ─── Done ─────────────────────────────────────────────────
  const finalBal = ethers.formatEther(await ethers.provider.getBalance(deployer.address));

  console.log("\n═══════════════════════════════════════════════════");
  console.log("  ROLES CONFIGURED! Gas:", (parseFloat(startBal) - parseFloat(finalBal)).toFixed(6), "BNB");
  console.log("═══════════════════════════════════════════════════");
  console.log(`
  All admin → Server Wallet: ${SERVER_WALLET}

  ⚠️  REMAINING: Server Wallet must grant MINTER_ROLE on:
  1. MA Token (${D.ma}):
     → grantRole(MINTER_ROLE, ${D.vault})   // Vault mints MA
     → grantRole(MINTER_ROLE, ${D.engine})   // Engine mints interest
  2. CUSD (${D.cusd}):
     → grantRole(MINTER_ROLE, ${D.gateway})  // Gateway mints cUSD

  MINTER_ROLE = 0x9f2df0fed2c77648de5860a4cc508cd0818c85b8b8a1ab4ceeef8d981c8956a6

  Use thirdweb dashboard or Server Wallet API to call these.
  `);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
