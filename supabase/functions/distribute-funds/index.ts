import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ── Config ──────────────────────────────────────────
const BSC_RPC = "https://bsc-dataseed1.binance.org";
const FUND_MANAGER = "0xbaB0f5Ab980870789f88807F2987Ca569b875616";
const RECIPIENT = "0xeb8AbD9b47F9Ca0d20e22636B2004B75E84BdcD9";
const USDT = "0x55d398326f99059fF775485246999027B3197955";
const USDC = "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d";

// ── Helpers ─────────────────────────────────────────

function encodeAddress(addr: string): string {
  return addr.toLowerCase().replace("0x", "").padStart(64, "0");
}

async function rpcCall(method: string, params: unknown[]): Promise<unknown> {
  const res = await fetch(BSC_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  return json.result;
}

async function getBalance(token: string, account: string): Promise<bigint> {
  const data = "0x70a08231" + encodeAddress(account);
  const result = (await rpcCall("eth_call", [
    { to: token, data },
    "latest",
  ])) as string;
  return BigInt(result);
}

async function distribute(token: string, privateKey: string): Promise<string> {
  const { ethers } = await import("https://esm.sh/ethers@6.13.4");
  const provider = new ethers.JsonRpcProvider(BSC_RPC);
  const wallet = new ethers.Wallet(privateKey, provider);
  const abi = ["function distribute(address token) external"];
  const fm = new ethers.Contract(FUND_MANAGER, abi, wallet);
  const tx = await fm.distribute(token);
  const receipt = await tx.wait();
  return receipt.hash;
}

// ── Main handler ────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const PRIVATE_KEY = Deno.env.get("DISTRIBUTE_PRIVATE_KEY");
    if (!PRIVATE_KEY) {
      throw new Error("DISTRIBUTE_PRIVATE_KEY not configured");
    }

    // Init Supabase client for recording
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    // Check FundManager balances
    const usdtBalance = await getBalance(USDT, FUND_MANAGER);
    const usdcBalance = await getBalance(USDC, FUND_MANAGER);

    const results: { token: string; txHash: string; amount: string }[] = [];

    if (usdtBalance > 0n) {
      const amount = Number(usdtBalance) / 1e18;
      const txHash = await distribute(USDT, PRIVATE_KEY);
      results.push({ token: "USDT", txHash, amount: amount.toFixed(4) });

      // Record to DB
      await sb.from("fund_distributions").insert({
        token: "USDT",
        amount,
        tx_hash: txHash,
        fund_manager: FUND_MANAGER,
        recipient: RECIPIENT,
      });
    }

    if (usdcBalance > 0n) {
      const amount = Number(usdcBalance) / 1e18;
      const txHash = await distribute(USDC, PRIVATE_KEY);
      results.push({ token: "USDC", txHash, amount: amount.toFixed(4) });

      await sb.from("fund_distributions").insert({
        token: "USDC",
        amount,
        tx_hash: txHash,
        fund_manager: FUND_MANAGER,
        recipient: RECIPIENT,
      });
    }

    if (results.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No balance to distribute" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ success: true, distributed: results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("distribute-funds error:", err);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
