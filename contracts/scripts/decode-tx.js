const { ethers } = require("hardhat");

async function main() {
  const TX = "0x2ffd45c985aee29b60da390798d93eb05569473c4ce679d7aef4edf7f012761a";
  
  const tx = await ethers.provider.getTransaction(TX);
  console.log("From:", tx.from);
  console.log("To:", tx.to);
  console.log("Value:", ethers.formatEther(tx.value), "BNB");
  console.log("Selector:", tx.data.slice(0, 10));
  
  // Decode using Gateway ABI
  const gw = await ethers.getContractAt("CoinMaxGateway", tx.to);
  try {
    const decoded = gw.interface.parseTransaction({ data: tx.data, value: tx.value });
    console.log("\nFunction:", decoded.name);
    console.log("Args:");
    for (let i = 0; i < decoded.args.length; i++) {
      console.log(`  [${i}]:`, decoded.args[i].toString());
    }
  } catch (e) {
    console.log("Cannot decode with Gateway ABI:", e.message.slice(0, 80));
  }
  
  // Try to replay and get revert reason
  console.log("\n=== Replay to get revert reason ===");
  try {
    const result = await ethers.provider.call({
      from: tx.from,
      to: tx.to,
      data: tx.data,
      value: tx.value,
      blockTag: tx.blockNumber - 1,
    });
    console.log("Would succeed:", result.slice(0, 20));
  } catch (e) {
    const msg = e.message || "";
    console.log("Revert:", msg.slice(0, 200));
    if (e.data) {
      console.log("Data:", e.data.slice(0, 100));
      // Try to decode
      if (e.data.startsWith("0x08c379a0")) {
        const reason = ethers.AbiCoder.defaultAbiCoder().decode(["string"], "0x" + e.data.slice(10));
        console.log("Reason string:", reason[0]);
      }
    }
  }
}

main().catch(console.error);
