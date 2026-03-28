const { ethers } = require("hardhat");

/**
 * Full redeploy: Engine + Release + Gateway + Oracle proxies
 * Admin = deployer (we have the key, no thirdweb dependency)
 * After deploy: deployer manages everything via Hardhat/Edge Functions
 */

const MA = "0xdFaC84b2f9cfD02b3f44760E0Ff88b4EeC0e1593";
const CUSD = "0xC4F323c972d5d6Da87bDa6AE5eb1206C2BCe43cc";
const VAULT = "0xE0A80b82F42d009cdE772d5c34b1682C2D79e821";
const FORWARDER = "0x6EF9AD688dFD9B545158b05FC51ab38B9D5a8556";
const SPLITTER = "0xcfF14557337368E4A9E09586B0833C5Bbf323845";

const BSC_USDT = "0x55d398326f99059fF775485246999027B3197955";
const BSC_USDC = "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d";
const BSC_PANCAKE = "0x13f4EA83D0bd40E75C8222255bc855a974568Dd4";
const MA_PRICE = 600000; // $0.60 current price

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "BNB\n");
  let tx;

  const ERC1967 = await ethers.getContractFactory("@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol:ERC1967Proxy");

  // ─── 1. Release proxy ─────────────────────────────────────
  console.log("─── 1. Release ───");
  const releaseImpl = await (await ethers.getContractFactory("CoinMaxRelease")).deploy();
  await releaseImpl.waitForDeployment();

  const rIface = new ethers.Interface(["function initialize(address,address,address,address)"]);
  const rInit = rIface.encodeFunctionData("initialize", [MA, deployer.address, ethers.ZeroAddress, deployer.address]);
  const releaseProxy = await ERC1967.deploy(await releaseImpl.getAddress(), rInit);
  await releaseProxy.waitForDeployment();
  const releaseAddr = await releaseProxy.getAddress();
  console.log("  Release:", releaseAddr);

  // ─── 2. Engine proxy ──────────────────────────────────────
  console.log("\n─── 2. Engine ───");
  const engineImpl = await (await ethers.getContractFactory("CoinMaxInterestEngine")).deploy();
  await engineImpl.waitForDeployment();

  const eIface = new ethers.Interface(["function initialize(address,address,address,address,address)"]);
  const eInit = eIface.encodeFunctionData("initialize", [VAULT, MA, releaseAddr, deployer.address, deployer.address]);
  const engineProxy = await ERC1967.deploy(await engineImpl.getAddress(), eInit);
  await engineProxy.waitForDeployment();
  const engineAddr = await engineProxy.getAddress();
  console.log("  Engine:", engineAddr);

  // ─── 3. Gateway proxy ─────────────────────────────────────
  console.log("\n─── 3. Gateway ───");
  const gatewayImpl = await (await ethers.getContractFactory("CoinMaxGateway")).deploy();
  await gatewayImpl.waitForDeployment();

  const gIface = new ethers.Interface(["function initialize(bool,address,address,address,uint24,address,address,address)"]);
  const gInit = gIface.encodeFunctionData("initialize", [true, BSC_USDT, BSC_USDC, BSC_PANCAKE, 100, SPLITTER, deployer.address, deployer.address]);
  const gatewayProxy = await ERC1967.deploy(await gatewayImpl.getAddress(), gInit);
  await gatewayProxy.waitForDeployment();
  const gatewayAddr = await gatewayProxy.getAddress();
  console.log("  Gateway:", gatewayAddr);

  // ─── 4. Oracle proxy ──────────────────────────────────────
  console.log("\n─── 4. Oracle ───");
  const oracleImpl = await (await ethers.getContractFactory("MAPriceOracle")).deploy();
  await oracleImpl.waitForDeployment();

  const oIface = new ethers.Interface(["function initialize(uint256,address,address)"]);
  const oInit = oIface.encodeFunctionData("initialize", [MA_PRICE, deployer.address, deployer.address]);
  const oracleProxy = await ERC1967.deploy(await oracleImpl.getAddress(), oInit);
  await oracleProxy.waitForDeployment();
  const oracleAddr = await oracleProxy.getAddress();
  console.log("  Oracle:", oracleAddr);

  // ─── 5. Wire roles ────────────────────────────────────────
  console.log("\n─── 5. Wire roles ───");

  const MINTER = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
  const GATEWAY_R = ethers.keccak256(ethers.toUtf8Bytes("GATEWAY_ROLE"));
  const ENGINE_R = ethers.keccak256(ethers.toUtf8Bytes("ENGINE_ROLE"));
  const VAULT_R = ethers.keccak256(ethers.toUtf8Bytes("VAULT_ROLE"));
  const PRICE_R = ethers.keccak256(ethers.toUtf8Bytes("PRICE_ROLE"));

  // Vault: update references
  const vault = await ethers.getContractAt("CoinMaxVault", VAULT);
  tx = await vault.grantRole(GATEWAY_R, gatewayAddr); await tx.wait();
  console.log("  Vault GATEWAY → new Gateway ✓");
  tx = await vault.grantRole(ENGINE_R, engineAddr); await tx.wait();
  console.log("  Vault ENGINE → new Engine ✓");
  tx = await vault.grantRole(PRICE_R, deployer.address); await tx.wait();
  console.log("  Vault PRICE → deployer ✓");

  // Vault: set oracle
  tx = await vault.setPriceOracle(oracleAddr); await tx.wait();
  console.log("  Vault.oracle → new Oracle ✓");

  // Release: VAULT_ROLE → Engine
  const release = await ethers.getContractAt("CoinMaxRelease", releaseAddr);
  tx = await release.grantRole(VAULT_R, engineAddr); await tx.wait();
  console.log("  Release VAULT → new Engine ✓");

  // Gateway: setCUsd + setVault
  const gateway = await ethers.getContractAt("CoinMaxGateway", gatewayAddr);
  tx = await gateway.setCUsd(CUSD); await tx.wait();
  console.log("  Gateway.cUsd ✓");
  tx = await gateway.setVault(VAULT); await tx.wait();
  console.log("  Gateway.vault ✓");

  // MA Token: MINTER → new Engine (deployer has admin on MA)
  const ma = await ethers.getContractAt("MAToken", MA);
  tx = await ma.grantRole(MINTER, engineAddr); await tx.wait();
  console.log("  MA MINTER → new Engine ✓");

  // CUSD: MINTER → new Gateway (deployer has admin on CUSD)
  const cusd = await ethers.getContractAt("CUSD", CUSD);
  tx = await cusd.grantRole(MINTER, gatewayAddr); await tx.wait();
  console.log("  CUSD MINTER → new Gateway ✓");

  // ─── Done ─────────────────────────────────────────────────
  const finalBal = ethers.formatEther(await ethers.provider.getBalance(deployer.address));

  console.log("\n═══════════════════════════════════════════════════");
  console.log("  ALL CONTRACTS DEPLOYED + WIRED");
  console.log("═══════════════════════════════════════════════════");
  console.log(`
  MAToken:   ${MA}
  CUSD:      ${CUSD}
  Vault:     ${VAULT}
  Engine:    ${engineAddr}
  Release:   ${releaseAddr}
  Gateway:   ${gatewayAddr}
  Oracle:    ${oracleAddr}
  Splitter:  ${SPLITTER}
  Forwarder: ${FORWARDER}

  Admin: deployer ${deployer.address}
  Balance: ${finalBal} BNB
  
  NO thirdweb dependency for contract management!
  `);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
