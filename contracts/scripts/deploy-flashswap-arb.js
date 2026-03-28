const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Chain: ARB, Deployer:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");

  // ARB addresses (MA and Oracle not on ARB yet, use placeholders)
  // FlashSwap on ARB will use ARB USDT/USDC
  const ARB_USDT = "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9"; // ARB USDT (6 dec)
  const ARB_USDC = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831"; // ARB USDC (6 dec)

  // Deploy impl
  console.log("\n1. Deploy FlashSwap impl (ARB)...");
  const Impl = await ethers.getContractFactory("CoinMaxFlashSwap");
  const impl = await Impl.deploy();
  await impl.waitForDeployment();
  console.log("   Impl:", await impl.getAddress());

  // Deploy proxy (use deployer as oracle placeholder — update later)
  console.log("2. Deploy proxy...");
  const ERC1967 = await ethers.getContractFactory("@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol:ERC1967Proxy");
  const iface = new ethers.Interface(["function initialize(address,address,address,address,address)"]);
  const initData = iface.encodeFunctionData("initialize", [
    deployer.address, // MA token placeholder (deploy on ARB later)
    ARB_USDT,
    ARB_USDC,
    deployer.address, // Oracle placeholder
    deployer.address,
  ]);
  const proxy = await ERC1967.deploy(await impl.getAddress(), initData);
  await proxy.waitForDeployment();
  console.log("   FlashSwap (ARB):", await proxy.getAddress());
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
