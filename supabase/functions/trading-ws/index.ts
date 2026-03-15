/**
 * Trading WebSocket Edge Function
 *
 * Phase 5.5: Real-time PnL updates via Supabase Realtime broadcast.
 * Publishes position updates, signal events, and performance reports.
 *
 * Events:
 *   - signal:          New trade signal generated
 *   - position_open:   Position opened (paper or live)
 *   - position_update: Position PnL updated
 *   - position_close:  Position closed with result
 *   - performance:     Periodic performance report
 *   - kill_switch:     Emergency stop activated
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface WSEvent {
  type: "signal" | "position_open" | "position_update" | "position_close" | "performance" | "kill_switch";
  data: Record<string, unknown>;
  timestamp: string;
  userId?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { action, ...payload } = await req.json();

    switch (action) {
      // Broadcast a position update to all subscribers
      case "broadcast_position": {
        const event: WSEvent = {
          type: payload.closed ? "position_close" : "position_update",
          data: {
            positionId: payload.positionId,
            asset: payload.asset,
            side: payload.side,
            entryPrice: payload.entryPrice,
            markPrice: payload.markPrice,
            unrealizedPnl: payload.unrealizedPnl,
            unrealizedPnlPct: payload.unrealizedPnlPct,
            leverage: payload.leverage,
            // Close data
            exitPrice: payload.exitPrice,
            realizedPnl: payload.realizedPnl,
            closeReason: payload.closeReason,
          },
          timestamp: new Date().toISOString(),
          userId: payload.userId,
        };

        // Broadcast to user-specific channel if userId provided, else global
        const channelName = payload.userId ? `trading:${payload.userId}` : "trading:global";
        await supabase.channel(channelName).send({
          type: "broadcast",
          event: event.type,
          payload: event,
        });

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Broadcast a performance report
      case "broadcast_performance": {
        const event: WSEvent = {
          type: "performance",
          data: {
            totalPnlUsd: payload.totalPnlUsd,
            totalPnlPct: payload.totalPnlPct,
            winRate: payload.winRate,
            openPositions: payload.openPositions,
            dailyPnl: payload.dailyPnl,
            totalTrades: payload.totalTrades,
          },
          timestamp: new Date().toISOString(),
          userId: payload.userId,
        };

        const channelName = payload.userId ? `trading:${payload.userId}` : "trading:global";
        await supabase.channel(channelName).send({
          type: "broadcast",
          event: "performance",
          payload: event,
        });

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Trigger kill switch for a user
      case "kill_switch": {
        const userId = payload.userId;
        if (!userId) {
          return new Response(JSON.stringify({ error: "userId required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Update user config
        await supabase.from("user_risk_config").upsert({
          user_id: userId,
          kill_switch: true,
          copy_enabled: false,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });

        // Broadcast kill switch event
        await supabase.channel(`trading:${userId}`).send({
          type: "broadcast",
          event: "kill_switch",
          payload: {
            type: "kill_switch",
            data: { activated: true, reason: payload.reason || "manual" },
            timestamp: new Date().toISOString(),
            userId,
          },
        });

        return new Response(JSON.stringify({ success: true, message: "Kill switch activated" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get recent events for a user (for initial load)
      case "get_recent_events": {
        const userId = payload.userId;

        // Get open positions
        const { data: positions } = await supabase
          .from("paper_trades")
          .select("*")
          .eq("status", "OPEN")
          .order("opened_at", { ascending: false })
          .limit(10);

        // Get recent signals
        const { data: signals } = await supabase
          .from("trade_signals")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(20);

        // Get daily PnL
        const today = new Date().toISOString().slice(0, 10);
        const { data: todayTrades } = await supabase
          .from("paper_trades")
          .select("pnl")
          .eq("status", "CLOSED")
          .gte("closed_at", today);

        const dailyPnl = (todayTrades || []).reduce((s: number, t: any) => s + (t.pnl || 0), 0);

        return new Response(JSON.stringify({
          positions: positions || [],
          signals: signals || [],
          dailyPnl,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
