const { ethers } = require("hardhat");

const MA = "0xdFaC84b2f9cfD02b3f44760E0Ff88b4EeC0e1593";
const CUSD = "0xC4F323c972d5d6Da87bDa6AE5eb1206C2BCe43cc";
const VAULT = "0xE0A80b82F42d009cdE772d5c34b1682C2D79e821";
const ENGINE = "0x0990013669d28eC6401f46a78b612cdaBE88b789";
const RELEASE = "0x842b48a616fA107bcd18e3656edCe658D4279f92";
const GATEWAY = "0xaC126bd86728D81dA05Df67f1E262085d072C36D";
const ORACLE = "0xff5Ab71939Fa021A7BCa38Db8b3c1672D1B819dD";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address, "\n");

  const MINTER = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
  const GATEWAY_ROLE = ethers.keccak256(ethers.toUtf8Bytes("GATEWAY_ROLE"));
  const ENGINE_ROLE = ethers.keccak256(ethers.toUtf8Bytes("ENGINE_ROLE"));
  const VAULT_ROLE = ethers.keccak256(ethers.toUtf8Bytes("VAULT_ROLE"));
  const FEEDER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("FEEDER_ROLE"));
  const PRICE_ROLE = ethers.keccak256(ethers.toUtf8Bytes("PRICE_ROLE"));
  const SERVER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("SERVER_ROLE"));
  const KEEPER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("KEEPER_ROLE"));

  const vault = await ethers.getContractAt("CoinMaxVault", VAULT);
  const release = await ethers.getContractAt("CoinMaxRelease", RELEASE);
  const engine = await ethers.getContractAt("CoinMaxInterestEngine", ENGINE);
  const oracle = await ethers.getContractAt("MAPriceOracle", ORACLE);
  const ma = await ethers.getContractAt("MAToken", MA);
  const cusd = await ethers.getContractAt("CUSD", CUSD);

  const fixes = [];

  // Check & fix each role
  async function check(contract, contractName, role, roleName, account, accountName) {
    const has = await contract.hasRole(role, account);
    const status = has ? "✅" : "❌ FIXING";
    console.log(`  ${contractName} ${roleName} → ${accountName}: ${status}`);
    if (!has) fixes.push({ contract, contractName, role, roleName, account, accountName });
  }

  console.log("─── 检查所有角色 ───\n");

  // MA Token
  await check(ma, "MA", MINTER, "MINTER", VAULT, "Vault");
  await check(ma, "MA", MINTER, "MINTER", ENGINE, "Engine");

  // CUSD
  await check(cusd, "CUSD", MINTER, "MINTER", GATEWAY, "Gateway");

  // Vault
  await check(vault, "Vault", GATEWAY_ROLE, "GATEWAY", GATEWAY, "Gateway");
  await check(vault, "Vault", ENGINE_ROLE, "ENGINE", ENGINE, "Engine");
  await check(vault, "Vault", PRICE_ROLE, "PRICE", deployer.address, "Deployer");

  // Release
  await check(release, "Release", VAULT_ROLE, "VAULT", ENGINE, "Engine");

  // Engine
  await check(engine, "Engine", SERVER_ROLE, "SERVER", deployer.address, "Deployer");
  await check(engine, "Engine", KEEPER_ROLE, "KEEPER", deployer.address, "Deployer");

  // Oracle
  await check(oracle, "Oracle", FEEDER_ROLE, "FEEDER", deployer.address, "Deployer");

  // Fix broken ones
  if (fixes.length > 0) {
    console.log(`\n─── 修复 ${fixes.length} 个断裂 ───\n`);
    for (const f of fixes) {
      try {
        const tx = await f.contract.grantRole(f.role, f.account);
        await tx.wait();
        console.log(`  ✅ ${f.contractName} ${f.roleName} → ${f.accountName}`);
      } catch (e) {
        console.log(`  ❌ ${f.contractName} ${f.roleName} → ${f.accountName}: ${e.message.slice(0, 60)}`);
      }
    }
  } else {
    console.log("\n  全部正常，无需修复！");
  }

  // Verify Engine → Release link
  console.log("\n─── 额外检查 ───");
  console.log("  Engine.vault:", await engine.vault());
  console.log("  Engine.maToken:", await engine.maToken());
  console.log("  Engine.releaseContract:", await engine.releaseContract());
  console.log("  Vault.maToken:", await vault.maToken());
  console.log("  Vault.priceOracle:", await vault.priceOracle());
  console.log("  Oracle.price:", (await oracle.price()).toString(), `($${Number(await oracle.price()) / 1e6})`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
