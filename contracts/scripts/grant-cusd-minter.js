const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  const CUSD = "0xC4F323c972d5d6Da87bDa6AE5eb1206C2BCe43cc";
  const VAULT = "0xE0A80b82F42d009cdE772d5c34b1682C2D79e821";
  
  const cusd = await ethers.getContractAt("CUSD", CUSD);
  const MINTER = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
  const ADMIN = ethers.ZeroHash;
  
  // Check deployer has admin
  console.log("Deployer ADMIN on CUSD:", await cusd.hasRole(ADMIN, deployer.address));
  console.log("Before — Vault MINTER:", await cusd.hasRole(MINTER, VAULT));
  
  // Grant
  const tx = await cusd.grantRole(MINTER, VAULT, { gasLimit: 100000 });
  const receipt = await tx.wait();
  console.log("Grant tx:", receipt.hash, "status:", receipt.status);
  
  // Verify
  console.log("After — Vault MINTER:", await cusd.hasRole(MINTER, VAULT));
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
