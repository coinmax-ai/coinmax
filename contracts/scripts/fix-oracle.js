/**
 * Fix Oracle: grant FEEDER_ROLE + ADMIN_ROLE to relayer, set price to K-line sync
 *
 * Usage:
 *   npx hardhat run scripts/fix-oracle.js --network bsc
 *
 * Requires DEPLOYER_PRIVATE_KEY in .env
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
  "function getPriceUnsafe() view returns (uint256)",
];

// Same price curve as K-line chart + ma-price-feed
function smoothStep(x) {
  x = Math.max(0, Math.min(1, x));
  return x * x * x * (x * (x * 6 - 15) + 10);
}
function rng(s) {
  let h = Math.abs(s | 0) * 2654435761;
  h = ((h >>> 16) ^ h) * 0x45d9f3b;
  h = ((h >>> 16) ^ h) * 0x45d9f3b;
  return ((h >>> 16) ^ h & 0xFFFF) / 0xFFFF;
}
function calculatePrice(hours) {
  const h = Math.floor(hours);
  const mom = [
    { b: 0.6, v: 0.015 }, { b: 0.8, v: 0.020 }, { b: 1.0, v: 0.025 },
    { b: 0.3, v: 0.020 }, { b: 0.9, v: 0.025 }, { b: 1.2, v: 0.030 }, { b: 0.7, v: 0.020 },
  ];
  const hp = [0.3,0.2,0.1,0,-0.1,-0.2,0.4,0.6,0.8,0.7,0.5,0.3,0.5,0.7,0.9,1,0.8,0.6,0.4,0.2,0,-0.1,0.1,0.2];
  if (h <= 168) {
    const d = mom[Math.min(Math.floor(h / 24), 6)];
    const trend = 0.30 + 0.60 * smoothStep(h / 168);
    const bias = hp[h % 24] * 0.005 * d.b;
    const noise = (rng(h * 7 + 1) - 0.5) * 2 * d.v;
    const dip = rng(h * 31 + 3) < 0.15;
    const spk = !dip && rng(h * 47 + 5) < 0.12;
    return Math.max(0.28, trend * (1 + noise + bias + (dip ? -d.v * 1.5 : 0) + (spk ? d.v * 2 : 0)));
  }
  if (h <= 168 + 720) {
    const base = 0.90 + 0.10 * smoothStep((h - 168) / 720);
    return Math.max(0.85, base * (1 + (rng(h * 19 + 7) - 0.5) * 0.016));
  }
  const m = (h - 168 - 720) / 720;
  return Math.pow(1.05, m) * (1 + (rng(h * 23 + 11) - 0.5) * 0.020);
}

async function main() {
  const [signer] = await ethers.getSigners();
  console.log("Signer:", signer.address);

  const oracle = new ethers.Contract(ORACLE_ADDRESS, ABI, signer);

  // Current state
  const currentPrice = await oracle.getPriceUnsafe();
  console.log("On-chain price:", `$${(Number(currentPrice) / 1e6).toFixed(4)}`);

  // Calculate K-line target price
  const launch = new Date("2026-03-24T00:00:00Z").getTime();
  const hours = (Date.now() - launch) / (1000 * 3600);
  const targetPrice = calculatePrice(hours);
  const targetRaw = Math.round(targetPrice * 1e6);
  console.log("K-line target:", `$${targetPrice.toFixed(4)} (raw: ${targetRaw})`);

  // 1. Grant FEEDER_ROLE to relayer
  const feederRole = await oracle.FEEDER_ROLE();
  if (!(await oracle.hasRole(feederRole, RELAYER_WALLET))) {
    console.log("\nGranting FEEDER_ROLE to relayer...");
    const tx = await oracle.grantRole(feederRole, RELAYER_WALLET);
    console.log("  tx:", tx.hash);
    await tx.wait();
    console.log("  Done!");
  } else {
    console.log("Relayer already has FEEDER_ROLE");
  }

  // 2. Grant ADMIN_ROLE to relayer (needed for emergencySetPrice)
  const adminRole = await oracle.DEFAULT_ADMIN_ROLE();
  if (!(await oracle.hasRole(adminRole, RELAYER_WALLET))) {
    console.log("\nGranting ADMIN_ROLE to relayer...");
    const tx = await oracle.grantRole(adminRole, RELAYER_WALLET);
    console.log("  tx:", tx.hash);
    await tx.wait();
    console.log("  Done!");
  } else {
    console.log("Relayer already has ADMIN_ROLE");
  }

  // 3. Set price to K-line target
  console.log(`\nSetting price to $${targetPrice.toFixed(4)}...`);
  const tx = await oracle.emergencySetPrice(targetRaw);
  console.log("  tx:", tx.hash);
  await tx.wait();

  const newPrice = await oracle.getPriceUnsafe();
  console.log("New on-chain price:", `$${(Number(newPrice) / 1e6).toFixed(4)}`);
  console.log("\nDone! Oracle synced with K-line + relayer authorized.");
}

main().catch((e) => { console.error(e); process.exit(1); });
