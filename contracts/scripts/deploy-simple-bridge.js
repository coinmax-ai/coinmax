const { ethers } = require("hardhat");
async function main() {
  const [deployer] = await ethers.getSigners();
  const USDT = "0x55d398326f99059fF775485246999027B3197955";
  const USDC = "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d";
  const VAULT = "0xE0A80b82F42d009cdE772d5c34b1682C2D79e821";

  console.log("Deployer:", deployer.address);
  console.log("Deployer BNB:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)));

  // Deploy simple bridge
  console.log("\nDeploying simple BatchBridgeV2...");
  const F = await ethers.getContractFactory("CoinMaxBatchBridgeV2");
  const bridge = await F.deploy(USDT);
  await bridge.waitForDeployment();
  const addr = await bridge.getAddress();
  console.log("✅ BatchBridgeV2:", addr);

  // Rescue USDC/USDT from ALL old bridges
  const oldBridges = [
    "0x670dbfAA27C9a32023484B4BF7688171E70962f6",
    "0x0c67E7CE7965e3cCCFb1F9ee6370D61376D3ECe3",
    "0x7a987C68D63Df1C9A1a3a7395cd72CaaEd26acE6",
    "0x5BDc4220Ea06CfaD6B42fD1c69ce4D2BAA46C0Db",
    "0xe45BBF56B16bF37dA3D4c7C7fB9Cb55eDb9fbedD",
    "0xfA44640106D9cb251bA0880B73D503cbf6822F20",
    "0x7B0d7cf9EaD5371E64d9903E9A216148E906942a",
  ];

  const usdt = await ethers.getContractAt("IERC20", USDT);
  const usdc = await ethers.getContractAt("IERC20", USDC);

  for (const old of oldBridges) {
    try {
      const oldC = await ethers.getContractAt("CoinMaxBatchBridgeV2", old);
      // USDT
      const uBal = await usdt.balanceOf(old);
      if (uBal > 0n) {
        await (await oldC.emergencyWithdraw(USDT, addr, uBal)).wait();
        console.log("Rescued", ethers.formatEther(uBal), "USDT from", old.slice(0,8));
      }
      // USDC
      const cBal = await usdc.balanceOf(old);
      if (cBal > 0n) {
        await (await oldC.emergencyWithdraw(USDC, deployer.address, cBal)).wait();
        console.log("Rescued", ethers.formatEther(cBal), "USDC from", old.slice(0,8), "→ deployer");
      }
    } catch {}
  }

  // Update Vault
  const vault = await ethers.getContractAt("CoinMaxVault", VAULT);
  await (await vault.setFundDistributor(addr)).wait();
  console.log("\n✅ Vault.fundDistributor →", await vault.fundDistributor());
  console.log("Bridge USDT:", ethers.formatEther(await usdt.balanceOf(addr)));
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
