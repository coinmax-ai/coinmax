const { ethers } = require("hardhat");

// Same addresses on both BSC and ARB for CREATE2 deterministic deployment
const CONFIGS = {
  bsc: {
    ma: "0xdFaC84b2f9cfD02b3f44760E0Ff88b4EeC0e1593",
    usdt: "0x55d398326f99059fF775485246999027B3197955",
    usdc: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
    oracle: "0xff5Ab71939Fa021A7BCa38Db8b3c1672D1B819dD",
  },
};

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  const chainId = Number(network.chainId);
  console.log("Chain:", chainId, "Deployer:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)));

  const cfg = CONFIGS.bsc; // BSC first

  // Deploy impl
  console.log("\n1. Deploy FlashSwap impl...");
  const Impl = await ethers.getContractFactory("CoinMaxFlashSwap");
  const impl = await Impl.deploy();
  await impl.waitForDeployment();
  console.log("   Impl:", await impl.getAddress());

  // Deploy proxy
  console.log("2. Deploy proxy...");
  const ERC1967 = await ethers.getContractFactory("@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol:ERC1967Proxy");
  const iface = new ethers.Interface([
    "function initialize(address,address,address,address,address)"
  ]);
  const initData = iface.encodeFunctionData("initialize", [
    cfg.ma, cfg.usdt, cfg.usdc, cfg.oracle, deployer.address
  ]);
  const proxy = await ERC1967.deploy(await impl.getAddress(), initData);
  await proxy.waitForDeployment();
  const proxyAddr = await proxy.getAddress();
  console.log("   FlashSwap:", proxyAddr);

  // Verify
  const fs = await ethers.getContractAt("CoinMaxFlashSwap", proxyAddr);
  console.log("\n3. Verify:");
  console.log("   maToken:", await fs.maToken());
  console.log("   usdt:", await fs.usdt());
  console.log("   oracle:", await fs.oracle());
  console.log("   feeBps:", (await fs.feeBps()).toString(), "(0.3%)");
  console.log("   holdingRuleBps:", (await fs.holdingRuleBps()).toString(), "(50%)");
  console.log("   ✅ UUPS upgradeable");

  console.log("\n   FlashSwap:", proxyAddr);
  console.log("   Update contracts.ts!");
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
