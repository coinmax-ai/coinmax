import { getContract } from "thirdweb";
import { bsc } from "thirdweb/chains";
import type { ThirdwebClient } from "thirdweb";

// BSC Mainnet (chain ID 56)
export const BSC_CHAIN = bsc;

// USDT on BSC (18 decimals)
export const USDT_ADDRESS = import.meta.env.VITE_USDT_ADDRESS || "0x55d398326f99059fF775485246999027B3197955";
export const USDT_DECIMALS = 18;

// USDC on BSC (18 decimals)
export const USDC_ADDRESS = import.meta.env.VITE_USDC_ADDRESS || "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d";
export const USDC_DECIMALS = 18;

// ── V1 Contract addresses ──
export const VAULT_CONTRACT_ADDRESS = import.meta.env.VITE_VAULT_CONTRACT_ADDRESS || "";
export const NODE_CONTRACT_ADDRESS = import.meta.env.VITE_NODE_CONTRACT_ADDRESS || "0x71237E535d5E00CDf18A609eA003525baEae3489";
export const VIP_CONTRACT_ADDRESS = import.meta.env.VITE_VIP_CONTRACT_ADDRESS || "";
export const VIP_RECEIVER_ADDRESS = import.meta.env.VITE_VIP_RECEIVER_ADDRESS || "0x927eDe64b4B8a7C08Cf4225924Fa9c6759943E0A";

// ── V2 Contract addresses (PancakeSwap V3 swap flow) ──
export const SWAP_ROUTER_ADDRESS = import.meta.env.VITE_SWAP_ROUTER_ADDRESS || "0x5650383D9f8d8f80fc972b8F49A3cc31d3A7F7E3";
export const NODE_V2_CONTRACT_ADDRESS = import.meta.env.VITE_NODE_V2_CONTRACT_ADDRESS || "0x17DDad4C9c2fD61859D37dD40300c419cBdd4cE2";

// ── V3 Contract addresses (Clean deployment 2026-03-31) ──
export const MA_TOKEN_ADDRESS = import.meta.env.VITE_MA_TOKEN_ADDRESS || "0x89b70f36168429604cE3c084552e9cF453A91d06";
export const CUSD_ADDRESS = import.meta.env.VITE_CUSD_ADDRESS || "0xDDB67fe20382868d7378FB3F4f5e23DBd1B2C4D6";
export const PRICE_ORACLE_ADDRESS = import.meta.env.VITE_PRICE_ORACLE_ADDRESS || "0x3F994e6AF97D3153C22AbFDcE55361e932bD0DAA";
export const VAULT_V3_ADDRESS = import.meta.env.VITE_VAULT_V3_ADDRESS || "0x2E07f56219FB9f39DcAce289288DE07F2bA96B93";
export const ENGINE_ADDRESS = import.meta.env.VITE_ENGINE_ADDRESS || "";
export const RELEASE_ADDRESS = import.meta.env.VITE_RELEASE_ADDRESS || "0x22d7E4b936c504d124767a8B4fB9C8F3724438Ef";
export const FORWARDER_ADDRESS = import.meta.env.VITE_FORWARDER_ADDRESS || "0x6EF9AD688dFD9B545158b05FC51ab38B9D5a8556";
export const TIMELOCK_ADDRESS = import.meta.env.VITE_TIMELOCK_ADDRESS || "0x857c472F8587B2D3E7F90B10b99458104CcaCdfC";
export const BATCH_BRIDGE_ADDRESS = import.meta.env.VITE_BATCH_BRIDGE_ADDRESS || "0x1Baa40837a253DA171a458A979f87b9A29CE0Efa";
export const ARB_FUND_ROUTER_ADDRESS = import.meta.env.VITE_ARB_FUND_ROUTER_ADDRESS || "0x71237E535d5E00CDf18A609eA003525baEae3489";
export const NODE_ENGINE_ADDRESS = import.meta.env.VITE_NODE_ENGINE_ADDRESS || "";
export const FLASH_SWAP_ADDRESS = import.meta.env.VITE_FLASH_SWAP_ADDRESS || "0x7cEdABFaB97DAbc6ceF4e36b560D174D09d05d1C";
export const ARB_FLASH_SWAP_ADDRESS = "0x681a734AbE80D9f52236d70d29cA5504207b6d7C";
export const MA_DECIMALS = 18;

// Convert USD amount to USDT units (6 decimals)
export function usdToUsdtUnits(amount: number): bigint {
  return BigInt(Math.round(amount * 10 ** USDT_DECIMALS));
}

export function getUsdtContract(client: ThirdwebClient) {
  return getContract({ client, chain: BSC_CHAIN, address: USDT_ADDRESS });
}

export function getUsdcContract(client: ThirdwebClient) {
  return getContract({ client, chain: BSC_CHAIN, address: USDC_ADDRESS });
}

export function getVaultContract(client: ThirdwebClient) {
  if (!VAULT_CONTRACT_ADDRESS) throw new Error("Vault contract not configured");
  return getContract({ client, chain: BSC_CHAIN, address: VAULT_CONTRACT_ADDRESS });
}

export function getNodeContract(client: ThirdwebClient) {
  if (!NODE_CONTRACT_ADDRESS) throw new Error("Node contract not configured");
  return getContract({ client, chain: BSC_CHAIN, address: NODE_CONTRACT_ADDRESS });
}

export function getVIPContract(client: ThirdwebClient) {
  if (!VIP_CONTRACT_ADDRESS) throw new Error("VIP contract not configured");
  return getContract({ client, chain: BSC_CHAIN, address: VIP_CONTRACT_ADDRESS });
}

// ── V2 contract getters ──

export function getSwapRouterContract(client: ThirdwebClient) {
  if (!SWAP_ROUTER_ADDRESS) throw new Error("SwapRouter contract not configured");
  return getContract({ client, chain: BSC_CHAIN, address: SWAP_ROUTER_ADDRESS });
}

export function getNodeV2Contract(client: ThirdwebClient) {
  if (!NODE_V2_CONTRACT_ADDRESS) throw new Error("NodeV2 contract not configured");
  return getContract({ client, chain: BSC_CHAIN, address: NODE_V2_CONTRACT_ADDRESS });
}

// ── V3 contract getters ──

export function getMATokenContract(client: ThirdwebClient) {
  return getContract({ client, chain: BSC_CHAIN, address: MA_TOKEN_ADDRESS });
}

export function getPriceOracleContract(client: ThirdwebClient) {
  return getContract({ client, chain: BSC_CHAIN, address: PRICE_ORACLE_ADDRESS });
}

export function getVaultV3Contract(client: ThirdwebClient) {
  return getContract({ client, chain: BSC_CHAIN, address: VAULT_V3_ADDRESS });
}

export function getGatewayContract(client: ThirdwebClient) {
  return getContract({ client, chain: BSC_CHAIN, address: GATEWAY_ADDRESS });
}

// ── ABIs (minimal, only the pay functions) ──

export const VAULT_ABI = [
  {
    type: "function",
    name: "deposit",
    inputs: [
      { name: "amount", type: "uint256", internalType: "uint256" },
      { name: "planType", type: "string", internalType: "string" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

export const NODE_ABI = [
  {
    type: "function",
    name: "purchaseNode",
    inputs: [
      { name: "nodeType", type: "string", internalType: "string" },
      { name: "token", type: "address", internalType: "address" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

export const VIP_ABI = [
  {
    type: "function",
    name: "subscribe",
    inputs: [
      { name: "planLabel", type: "string", internalType: "string" },
      { name: "token", type: "address", internalType: "address" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

// ── V2 ABIs (SwapRouter: USDT → PancakeSwap V3 → USDC → Node/Vault) ──

export const SWAP_ROUTER_ABI = [
  {
    type: "function",
    name: "swapAndPurchaseNode",
    inputs: [
      { name: "usdtAmount", type: "uint256", internalType: "uint256" },
      { name: "nodeType", type: "string", internalType: "string" },
      { name: "minUsdcOut", type: "uint256", internalType: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "swapAndDepositVault",
    inputs: [
      { name: "usdtAmount", type: "uint256", internalType: "uint256" },
      { name: "planIndex", type: "uint256", internalType: "uint256" },
      { name: "minUsdcOut", type: "uint256", internalType: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "maxSlippageBps",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
] as const;
