const { ethers } = require("hardhat");
async function main() {
  const [d] = await ethers.getSigners();
  const to = "0xf9481D700c0C093F2867d975429ec69D4576B8AC";
  console.log("Deployer BNB:", ethers.formatEther(await ethers.provider.getBalance(d.address)));
  const tx = await d.sendTransaction({ to, value: ethers.parseEther("0.005") });
  await tx.wait();
  console.log("Sent 0.005 BNB to", to);
  console.log("User BNB:", ethers.formatEther(await ethers.provider.getBalance(to)));
}
main().catch(console.error);
