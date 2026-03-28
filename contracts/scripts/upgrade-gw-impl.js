const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  // Deploy new impl
  const Impl = await ethers.getContractFactory("CoinMaxGateway");
  const impl = await Impl.deploy();
  await impl.waitForDeployment();
  const implAddr = await impl.getAddress();
  console.log("New impl:", implAddr);

  // Redeploy proxy (since UUPS upgrade doesn't work on this Gateway)
  const CUSD = "0xC4F323c972d5d6Da87bDa6AE5eb1206C2BCe43cc";
  const VAULT = "0xE0A80b82F42d009cdE772d5c34b1682C2D79e821";
  const BATCH_BRIDGE = "0x670dbfAA27C9a32023484B4BF7688171E70962f6";

  const ERC1967 = await ethers.getContractFactory("@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol:ERC1967Proxy");
  const iface = new ethers.Interface(["function initialize(bool,address,address,address,uint24,address,address,address)"]);
  const initData = iface.encodeFunctionData("initialize", [
    true, "0x55d398326f99059fF775485246999027B3197955", "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
    "0x13f4EA83D0bd40E75C8222255bc855a974568Dd4", 100, BATCH_BRIDGE, deployer.address, deployer.address
  ]);
  const proxy = await ERC1967.deploy(implAddr, initData);
  await proxy.waitForDeployment();
  const gwAddr = await proxy.getAddress();
  console.log("New Gateway proxy:", gwAddr);

  // Wire
  const gw = await ethers.getContractAt("CoinMaxGateway", gwAddr);
  let tx;
  tx = await gw.setCUsd(CUSD); await tx.wait();
  tx = await gw.setVault(VAULT); await tx.wait();
  tx = await gw.setMaxSlippageBps(50); await tx.wait();
  console.log("Config set ✓");

  // Grant roles
  const vault = await ethers.getContractAt("CoinMaxVault", VAULT);
  const GW_ROLE = ethers.keccak256(ethers.toUtf8Bytes("GATEWAY_ROLE"));
  tx = await vault.grantRole(GW_ROLE, gwAddr); await tx.wait();
  console.log("Vault GATEWAY_ROLE ✓");

  const cusd = await ethers.getContractAt("CUSD", CUSD);
  const MINTER = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
  tx = await cusd.grantRole(MINTER, gwAddr); await tx.wait();
  console.log("CUSD MINTER ✓");

  console.log("\n  UPDATE contracts.ts GATEWAY_ADDRESS to:", gwAddr);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
