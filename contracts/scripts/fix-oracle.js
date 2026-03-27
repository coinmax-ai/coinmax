/**
 * Fix Oracle:
 *   1. Grant FEEDER_ROLE to relayer (for updatePrice, NOT admin)
 *   2. Set maxChangeRate to 5000 (50%) so updatePrice can follow K-line
 *   3. emergencySetPrice to current K-line value (one-time catch-up)
 *
 * Usage:
 *   npx hardhat run scripts/fix-oracle.js --network bsc
 */

const { ethers } = require("hardhat");

const ORACLE_ADDRESS = "0x3EC635802091b9F95b2891f3fd2504499f710145";
const RELAYER_WALLET = "0xcb41F3C3eD6C255F57Cda1bA3fd42389B0f0F0aA";

const ABI = [
  "function FEEDER_ROLE() view returns (bytes32)",
  "function DEFAULT_ADMIN_ROLE() view returns (bytes32)",
  "function hasRole(bytes32 role, address account) view returns (bool)",
  "function grantRole(bytes32 role, address account)",
  "function emergencySetPrice(uint256 _price)",
  "function setMaxChangeRate(uint256 _bps)",
  "function maxChangeRate() view returns (uint256)",
  "function getPriceUnsafe() view returns (uint256)",
];

// K-line price curve (same as chart + price-feed)
function ss(x) { x = Math.max(0, Math.min(1, x)); return x*x*x*(x*(x*6-15)+10); }
function rng(s) { let h=Math.abs(s|0)*2654435761; h=((h>>>16)^h)*0x45d9f3b; h=((h>>>16)^h)*0x45d9f3b; return((h>>>16)^h&0xFFFF)/0xFFFF; }
function klinePrice(hours) {
  const h = Math.floor(hours);
  const mom = [{b:.6,v:.015},{b:.8,v:.02},{b:1,v:.025},{b:.3,v:.02},{b:.9,v:.025},{b:1.2,v:.03},{b:.7,v:.02}];
  const hp = [.3,.2,.1,0,-.1,-.2,.4,.6,.8,.7,.5,.3,.5,.7,.9,1,.8,.6,.4,.2,0,-.1,.1,.2];
  if (h <= 168) {
    const d = mom[Math.min(Math.floor(h/24),6)];
    const t = .30 + .60*ss(h/168);
    return Math.max(.28, t*(1 + (rng(h*7+1)-.5)*2*d.v + hp[h%24]*.005*d.b + (rng(h*31+3)<.15?-d.v*1.5:0) + (rng(h*47+5)<.12?d.v*2:0)));
  }
  if (h <= 168+720) return Math.max(.85, (.90+.10*ss((h-168)/720))*(1+(rng(h*19+7)-.5)*.016));
  return Math.pow(1.05,(h-888)/720)*(1+(rng(h*23+11)-.5)*.02);
}

async function main() {
  const [signer] = await ethers.getSigners();
  console.log("Signer:", signer.address);

  const oracle = new ethers.Contract(ORACLE_ADDRESS, ABI, signer);

  const currentPrice = await oracle.getPriceUnsafe();
  console.log("On-chain:", `$${(Number(currentPrice) / 1e6).toFixed(4)}`);

  const hours = (Date.now() - new Date("2026-03-24T00:00:00Z").getTime()) / 3.6e6;
  const target = klinePrice(hours);
  const targetRaw = Math.round(target * 1e6);
  console.log("K-line target:", `$${target.toFixed(4)} (${targetRaw})`);

  // 1. Grant FEEDER_ROLE to relayer
  const feederRole = await oracle.FEEDER_ROLE();
  if (!(await oracle.hasRole(feederRole, RELAYER_WALLET))) {
    console.log("\nGranting FEEDER_ROLE to relayer...");
    const tx = await oracle.grantRole(feederRole, RELAYER_WALLET);
    await tx.wait();
    console.log("  Done!", tx.hash);
  } else {
    console.log("Relayer already has FEEDER_ROLE ✓");
  }

  // 2. Increase maxChangeRate to 50% so updatePrice can follow K-line swings
  const currentRate = await oracle.maxChangeRate();
  console.log("Current maxChangeRate:", currentRate.toString(), "bps");
  if (Number(currentRate) < 5000) {
    console.log("Setting maxChangeRate to 5000 (50%)...");
    const tx = await oracle.setMaxChangeRate(5000);
    await tx.wait();
    console.log("  Done!", tx.hash);
  }

  // 3. emergencySetPrice to catch up with K-line
  console.log(`\nSetting price to $${target.toFixed(4)}...`);
  const tx = await oracle.emergencySetPrice(targetRaw);
  await tx.wait();
  console.log("  Done!", tx.hash);

  const newPrice = await oracle.getPriceUnsafe();
  console.log("\nNew on-chain:", `$${(Number(newPrice) / 1e6).toFixed(4)}`);
  console.log("✓ Oracle synced! Relayer can now use updatePrice() to keep it in sync.");
}

main().catch((e) => { console.error(e); process.exit(1); });
