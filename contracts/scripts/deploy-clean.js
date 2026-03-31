const { ethers } = require("hardhat");
const USDT = "0x55d398326f99059fF775485246999027B3197955";
const USDC = "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d";
const SERVER = "0x85e44A8Be3B0b08e437B16759357300A4Cd1d95b";

async function main() {
  const [d] = await ethers.getSigners();
  console.log("Deployer:", d.address, "BNB:", ethers.formatEther(await ethers.provider.getBalance(d.address)));

  // 1. Tokens (admin = deployer)
  const ma = await (await (await ethers.getContractFactory("MAToken")).deploy(d.address)).waitForDeployment();
  const MA = await ma.getAddress(); console.log("MA:", MA);
  const cusd = await (await (await ethers.getContractFactory("CUSD")).deploy(d.address)).waitForDeployment();
  const CUSD = await cusd.getAddress(); console.log("cUSD:", CUSD);

  // 2. Oracle proxy
  const oi = await (await (await ethers.getContractFactory("MAPriceOracle")).deploy({ gasLimit: 5000000 })).waitForDeployment();
  const op = await (await (await ethers.getContractFactory("ERC1967Proxy")).deploy(
    await oi.getAddress(),
    new ethers.Interface(["function initialize(uint256,address,address)"]).encodeFunctionData("initialize", [1000000, d.address, d.address]),
    { gasLimit: 5000000 }
  )).waitForDeployment();
  const ORACLE = await op.getAddress(); console.log("Oracle:", ORACLE);

  // 3. Vault proxy
  const vi = await (await (await ethers.getContractFactory("CoinMaxVault")).deploy({ gasLimit: 5000000 })).waitForDeployment();
  const vp = await (await (await ethers.getContractFactory("ERC1967Proxy")).deploy(
    await vi.getAddress(),
    new ethers.Interface(["function initialize(address,address,address,address,address,uint256)"]).encodeFunctionData("initialize", [CUSD, MA, d.address, d.address, d.address, 1000000]),
    { gasLimit: 5000000 }
  )).waitForDeployment();
  const VAULT = await vp.getAddress(); console.log("Vault:", VAULT);

  // 4. Release proxy
  const ri = await (await (await ethers.getContractFactory("CoinMaxRelease")).deploy({ gasLimit: 5000000 })).waitForDeployment();
  const rp = await (await (await ethers.getContractFactory("ERC1967Proxy")).deploy(
    await ri.getAddress(),
    new ethers.Interface(["function initialize(address,address,address,address)"]).encodeFunctionData("initialize", [MA, d.address, d.address, SERVER]),
    { gasLimit: 5000000 }
  )).waitForDeployment();
  const RELEASE = await rp.getAddress(); console.log("Release:", RELEASE);

  // 5. FlashSwap proxy
  const fi = await (await (await ethers.getContractFactory("CoinMaxFlashSwap")).deploy({ gasLimit: 5000000 })).waitForDeployment();
  const fp = await (await (await ethers.getContractFactory("ERC1967Proxy")).deploy(
    await fi.getAddress(),
    new ethers.Interface(["function initialize(address,address,address,address,address)"]).encodeFunctionData("initialize", [MA, USDT, USDC, ORACLE, d.address]),
    { gasLimit: 5000000 }
  )).waitForDeployment();
  const FLASH = await fp.getAddress(); console.log("FlashSwap:", FLASH);

  // 6. BatchBridge
  const bb = await (await (await ethers.getContractFactory("CoinMaxBatchBridgeV2")).deploy(USDT)).waitForDeployment();
  const BB = await bb.getAddress(); console.log("BatchBridge:", BB);

  // 7. Vault config
  const vault = await ethers.getContractAt("CoinMaxVault", VAULT);
  for (const [days, rate] of [[5,50],[45,70],[90,90],[180,120]]) {
    await (await vault.addPlan(days * 86400, rate)).wait();
  }
  console.log("Plans: 4 ✅");
  await (await vault.setFundDistributor(BB)).wait();
  console.log("fundDistributor ✅");

  // 8. Roles
  const MINTER = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
  const ENGINE = ethers.keccak256(ethers.toUtf8Bytes("ENGINE_ROLE"));
  const ADMIN = "0x0000000000000000000000000000000000000000000000000000000000000000";

  await (await ma.grantRole(MINTER, VAULT)).wait();
  await (await cusd.grantRole(MINTER, VAULT)).wait();
  await (await ma.grantRole(MINTER, SERVER)).wait();
  await (await ma.grantRole(MINTER, d.address)).wait();
  const rel = await ethers.getContractAt("CoinMaxRelease", RELEASE);
  await (await rel.grantRole(ADMIN, SERVER)).wait();
  await (await vault.grantRole(ENGINE, SERVER)).wait();
  console.log("All roles ✅");

  console.log("\n╔══════════════════════════════════════════╗");
  console.log("║       CLEAN DEPLOYMENT COMPLETE          ║");
  console.log("╚══════════════════════════════════════════╝");
  console.log("MA Token:     ", MA);
  console.log("cUSD:         ", CUSD);
  console.log("Oracle:       ", ORACLE);
  console.log("Vault:        ", VAULT);
  console.log("Release:      ", RELEASE);
  console.log("FlashSwap:    ", FLASH);
  console.log("BatchBridge:  ", BB);
  console.log("Deployer:     ", d.address, "(owner of ALL)");
  console.log("Server:       ", SERVER, "(MINTER+ENGINE only)");
  console.log("BNB left:     ", ethers.formatEther(await ethers.provider.getBalance(d.address)));
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
