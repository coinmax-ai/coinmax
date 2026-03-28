/**
 * Check Node Activation — Checks vault deposits + mini referrals to activate node rank
 *
 * Called after vault deposits to check if a node should be activated.
 * Also called by daily cron to re-check all pending nodes.
 *
 * POST body: { walletAddress: string } or { batchAll: true }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json();
    const { walletAddress, batchAll } = body;

    if (batchAll) {
      // Batch mode: check all users with pending node memberships
      const { data: pendingUsers } = await supabase
        .from("node_memberships")
        .select("user_id, profiles!inner(wallet_address)")
        .in("status", ["ACTIVE", "PENDING_MILESTONES"])
        .is("activated_rank", null);

      const results: Array<{ address: string; result: unknown }> = [];
      const addresses = new Set<string>();

      for (const row of pendingUsers || []) {
        const addr = (row as any).profiles?.wallet_address;
        if (!addr || addresses.has(addr)) continue;
        addresses.add(addr);

        const { data, error } = await supabase.rpc("check_node_activation", { addr });
        results.push({ address: addr, result: error ? { error: error.message } : data });
      }

      return json({ success: true, checked: results.length, results });
    }

    if (!walletAddress) {
      return json({ error: "Missing: walletAddress" }, 400);
    }

    // Single user mode: check activation for specific wallet
    const { data, error } = await supabase.rpc("check_node_activation", {
      addr: walletAddress,
    });

    if (error) {
      return json({ error: error.message }, 500);
    }

    // Also run milestone checks after activation
    const { data: milestoneResult } = await supabase.rpc("check_node_milestones", {
      addr: walletAddress,
    });

    return json({
      success: true,
      activation: data,
      milestones: milestoneResult,
    });

  } catch (e: any) {
    return json({ error: e.message }, 500);
  }
});

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
