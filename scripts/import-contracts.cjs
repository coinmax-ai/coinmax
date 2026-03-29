/**
 * Import active contracts to thirdweb Dashboard
 * Uses thirdweb v5 SDK
 */

const { createThirdwebClient, getContract, resolveContractAbi } = require('thirdweb');
const { defineChain } = require('thirdweb/chains');

const SECRET_KEY = 'EwFZ-cz8maTnDHEukynx4UgOx_0oqeqg1qR1gx2cHIM0L-Nks5ogM0U7JhZGQMyg3489Tc42J_QSZ9rLGojFSQ';

const client = createThirdwebClient({ secretKey: SECRET_KEY });
const bsc = defineChain(56);

const CONTRACTS = [
  { address: '0xB4F16aC18e2c8a0693E28e4E05F78982223a2A0f', name: 'CoinMax Vault (UUPS)' },
  { address: '0xE3d19D3299B0C2D6c5FDB74dBb79b102449Edc36', name: 'MA Token' },
  { address: '0x3EC635802091b9F95b2891f3fd2504499f710145', name: 'MAPriceOracle (UUPS)' },
  { address: '0xC80724a4133c90824A64914323fE856019D52B67', name: 'CoinMaxRelease (UUPS)' },
  { address: '0xcfF14557337368E4A9E09586B0833C5Bbf323845', name: 'Splitter' },
  { address: '0x670dbfAA27C9a32023484B4BF7688171E70962f6', name: 'BatchBridge (BSC→ARB)' },
  { address: '0x7dE393D02C153cF943E0cf30C7B2B7A073E5e75a', name: 'NodePool' },
  { address: '0xabF960833168c3D69284De219F8Da0D8054d96e4', name: 'FlashSwap (UUPS)' },
  { address: '0xfFac6b2Dea45E57d3bebEE5D4FD7Ab0e3e0D4fF2', name: 'Gateway' },
];

(async () => {
  for (const c of CONTRACTS) {
    try {
      const contract = getContract({ client, chain: bsc, address: c.address });
      // Resolving ABI registers the contract in thirdweb's system
      const abi = await resolveContractAbi(contract);
      const fnCount = abi.filter(a => a.type === 'function').length;
      console.log('✅', c.name, '-', fnCount, 'functions');
    } catch (e) {
      console.log('❌', c.name, '-', e.message.slice(0, 80));
    }
  }
  console.log('\nDone. Check https://thirdweb.com/dashboard/contracts');
})();
