const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const CUSD = await ethers.getContractFactory("CUSD");
  const cusd = await CUSD.deploy(deployer.address);
  await cusd.waitForDeployment();

  const addr = await cusd.getAddress();
  console.log("\n═══════════════════════════");
  console.log("  cUSD deployed:", addr);
  console.log("═══════════════════════════");
  console.log("\nAdmin + Minter:", deployer.address);
  console.log("Total Supply:   0");
  console.log("Decimals:       18");
  console.log("\n后续: grantRole(MINTER_ROLE, LiquidityManager地址)");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
