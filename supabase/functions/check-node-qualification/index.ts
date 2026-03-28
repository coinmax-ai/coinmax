/**
 * Check Node Qualification — Daily cron function for qualification day checks
 *
 * Runs daily to check all active nodes at their qualification checkpoints.
 * Applies pass/fail consequences:
 * - MINI: lock/unlock/destroy earnings at day 30 and 90
 * - MAX: pause/continue earnings at day 15/30/60, unlock frozen at day 120
 *
 * POST body: { walletAddress?: string } (optional, omit for batch all)
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

    const body = await req.json().catch(() => ({}));
    const { walletAddress } = body;

    if (walletAddress) {
      // Single user check
      // 1. Check activation first
      const { data: activationResult } = await supabase.rpc("check_node_activation", {
        addr: walletAddress,
      });

      // 2. Check milestones/qualification
      const { data: milestoneResult, error } = await supabase.rpc("check_node_milestones", {
        addr: walletAddress,
      });

      if (error) {
        return json({ error: error.message }, 500);
      }

      return json({
        success: true,
        walletAddress,
        activation: activationResult,
        qualification: milestoneResult,
      });
    }

    // Batch mode: check all users with active/pending nodes
    const { data: nodeUsers } = await supabase
      .from("node_memberships")
      .select("user_id, profiles!inner(wallet_address)")
      .in("status", ["ACTIVE", "PENDING_MILESTONES"]);

    const addresses = new Set<string>();
    const results: Array<{
      address: string;
      activation: unknown;
      qualification: unknown;
    }> = [];

    let activatedCount = 0;
    let achievedCount = 0;
    let failedCount = 0;

    for (const row of nodeUsers || []) {
      const addr = (row as any).profiles?.wallet_address;
      if (!addr || addresses.has(addr)) continue;
      addresses.add(addr);

      // 1. Check activation
      const { data: actResult } = await supabase.rpc("check_node_activation", { addr });
      if (actResult?.activated > 0) activatedCount += actResult.activated;

      // 2. Check qualification milestones
      const { data: qualResult } = await supabase.rpc("check_node_milestones", { addr });
      if (qualResult?.achieved > 0) achievedCount += qualResult.achieved;
      if (qualResult?.failed > 0) failedCount += qualResult.failed;

      results.push({
        address: addr,
        activation: actResult,
        qualification: qualResult,
      });
    }

    return json({
      success: true,
      totalChecked: addresses.size,
      activatedCount,
      achievedCount,
      failedCount,
      results,
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
