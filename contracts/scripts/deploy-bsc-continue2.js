const { ethers } = require("hardhat");

const SERVER_WALLET = "0x85e44A8Be3B0b08e437B16759357300A4Cd1d95b";
const BSC_USDT = "0x55d398326f99059fF775485246999027B3197955";
const BSC_USDC = "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d";
const BSC_PANCAKE_ROUTER = "0x13f4EA83D0bd40E75C8222255bc855a974568Dd4";
const BSC_POOL_FEE = 100;

// Already deployed
const D = {
  ma:          "0xE3d19D3299B0C2D6c5FDB74dBb79b102449Edc36",
  cusd:        "0x90B99a1495E5DBf8bF44c3623657020BB1BDa3C6",
  oracle:      "0x3EC635802091b9F95b2891f3fd2504499f710145",
  splitter:    "0xcfF14557337368E4A9E09586B0833C5Bbf323845",
  release:     "0xC80724a4133c90824A64914323fE856019D52B67",
  vault:       "0xC3E05890dB946B311b00AB64cA255FdcC3643F0a",
  engine:      "0x696a19562B30aD4F0f85C93f2369F044757849aB",
  gatewayImpl: "0x1ddbc734D6396d035FC5d10fA13D5165EA32175a",
};

async function main() {
  const [deployer] = await ethers.getSigners();
  const startBal = ethers.formatEther(await ethers.provider.getBalance(deployer.address));
  console.log("Deployer:", deployer.address, "| Balance:", startBal, "BNB\n");
  let tx;

  // ─── 1. Deploy Gateway as Proxy ───────────────────────────
  console.log("─── 1. Gateway Proxy ───\n");

  const ERC1967Proxy = await ethers.getContractFactory(
    "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol:ERC1967Proxy"
  );
  const gwIface = new ethers.Interface([
    "function initialize(bool,address,address,address,uint24,address,address,address)"
  ]);
  const gwInit = gwIface.encodeFunctionData("initialize", [
    true, BSC_USDT, BSC_USDC, BSC_PANCAKE_ROUTER, BSC_POOL_FEE,
    D.splitter, deployer.address, SERVER_WALLET
  ]);
  const gwProxy = await ERC1967Proxy.deploy(D.gatewayImpl, gwInit);
  await gwProxy.waitForDeployment();
  D.gateway = await gwProxy.getAddress();
  console.log("  Gateway proxy:", D.gateway);

  // ─── 2. Wire Roles ────────────────────────────────────────
  console.log("\n─── 2. Roles ───\n");

  const MINTER  = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
  const GATEWAY = ethers.keccak256(ethers.toUtf8Bytes("GATEWAY_ROLE"));
  const ENGINE  = ethers.keccak256(ethers.toUtf8Bytes("ENGINE_ROLE"));
  const VAULT_R = ethers.keccak256(ethers.toUtf8Bytes("VAULT_ROLE"));
  const PRICE   = ethers.keccak256(ethers.toUtf8Bytes("PRICE_ROLE"));
  const ADMIN   = ethers.ZeroHash;

  const ma      = await ethers.getContractAt("MAToken", D.ma);
  const cusd    = await ethers.getContractAt("CUSD", D.cusd);
  const vault   = await ethers.getContractAt("CoinMaxVault", D.vault);
  const release = await ethers.getContractAt("CoinMaxRelease", D.release);
  const engine  = await ethers.getContractAt("CoinMaxInterestEngine", D.engine);
  const gw      = await ethers.getContractAt("CoinMaxGateway", D.gateway);

  // MA: MINTER → Vault + Engine
  tx = await ma.grantRole(MINTER, D.vault); await tx.wait();
  tx = await ma.grantRole(MINTER, D.engine); await tx.wait();
  console.log("  MA MINTER → Vault + Engine");

  // cUSD: MINTER → Gateway
  tx = await cusd.grantRole(MINTER, D.gateway); await tx.wait();
  console.log("  cUSD MINTER → Gateway");

  // Vault: GATEWAY, ENGINE, PRICE
  tx = await vault.grantRole(GATEWAY, D.gateway); await tx.wait();
  tx = await vault.grantRole(ENGINE, D.engine); await tx.wait();
  tx = await vault.grantRole(PRICE, SERVER_WALLET); await tx.wait();
  console.log("  Vault: GATEWAY + ENGINE + PRICE set");

  // Vault: set oracle
  tx = await vault.setPriceOracle(D.oracle); await tx.wait();
  console.log("  Vault → Oracle linked");

  // Release: VAULT → Engine
  tx = await release.grantRole(VAULT_R, D.engine); await tx.wait();
  console.log("  Release VAULT → Engine");

  // Gateway: set cUSD + Vault
  tx = await gw.setCUsd(D.cusd); await tx.wait();
  tx = await gw.setVault(D.vault); await tx.wait();
  console.log("  Gateway → cUSD + Vault");

  // ─── 3. Transfer Admin → Server Wallet ────────────────────
  console.log("\n─── 3. Admin → Server Wallet ───\n");

  for (const [name, contract] of [["Vault", vault], ["Release", release], ["Engine", engine], ["Gateway", gw]]) {
    tx = await contract.grantRole(ADMIN, SERVER_WALLET); await tx.wait();
    tx = await contract.renounceRole(ADMIN, deployer.address); await tx.wait();
    console.log(`  ${name} ✓`);
  }

  const oracle = await ethers.getContractAt("MAPriceOracle", D.oracle);
  tx = await oracle.grantRole(ADMIN, SERVER_WALLET); await tx.wait();
  tx = await oracle.renounceRole(ADMIN, deployer.address); await tx.wait();
  console.log("  Oracle ✓");

  const splitter = await ethers.getContractAt("CoinMaxSplitter", D.splitter);
  tx = await splitter.transferOwnership(SERVER_WALLET); await tx.wait();
  console.log("  Splitter ✓");

  // ─── Done ─────────────────────────────────────────────────
  const finalBal = ethers.formatEther(await ethers.provider.getBalance(deployer.address));

  console.log("\n═══════════════════════════════════════════════════");
  console.log("  DEPLOYMENT COMPLETE!");
  console.log("═══════════════════════════════════════════════════");
  console.log(`
  MAToken:         ${D.ma}
  CUSD:            ${D.cusd}
  Oracle:          ${D.oracle}
  Vault:           ${D.vault}
  Engine:          ${D.engine}
  Release:         ${D.release}
  Gateway:         ${D.gateway}
  Splitter:        ${D.splitter}

  Gas: ${(parseFloat(startBal) - parseFloat(finalBal)).toFixed(6)} BNB
  Remaining: ${finalBal} BNB
  Admin: ${SERVER_WALLET}
  `);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
