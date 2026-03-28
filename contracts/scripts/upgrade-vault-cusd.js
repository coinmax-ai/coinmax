const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  const VAULT = "0xE0A80b82F42d009cdE772d5c34b1682C2D79e821";
  const CUSD = "0xC4F323c972d5d6Da87bDa6AE5eb1206C2BCe43cc";

  // 1. Deploy new impl
  console.log("1. Deploy new Vault impl...");
  const Impl = await ethers.getContractFactory("CoinMaxVault");
  const impl = await Impl.deploy();
  await impl.waitForDeployment();
  console.log("   Impl:", await impl.getAddress());

  // 2. Upgrade
  console.log("2. Upgrade...");
  const vault = await ethers.getContractAt("CoinMaxVault", VAULT);
  const tx1 = await vault.upgradeToAndCall(await impl.getAddress(), "0x");
  await tx1.wait();
  console.log("   ✅");

  // 3. Grant CUSD MINTER to Vault (so Vault can mint cUSD in depositFrom)
  console.log("3. Grant CUSD MINTER to Vault...");
  const cusd = await ethers.getContractAt("CUSD", CUSD);
  const MINTER = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
  
  const hasMinter = await cusd.hasRole(MINTER, VAULT);
  if (!hasMinter) {
    const tx2 = await cusd.grantRole(MINTER, VAULT);
    await tx2.wait();
    console.log("   Granted ✅");
  } else {
    console.log("   Already has MINTER ✅");
  }

  // 4. Verify
  console.log("4. Verify...");
  console.log("   CUSD MINTER → Vault:", await cusd.hasRole(MINTER, VAULT));
  console.log("   Vault.maToken:", await vault.maToken());
  console.log("   Vault.getCurrentMAPrice:", (await vault.getCurrentMAPrice()).toString());
  console.log("\n   Done! Vault can now mint cUSD on deposit ✅");
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
