"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { PageGuard } from "@/components/layout/PageGuard";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import {
  ArrowRight,
  TrendingUp,
  CalendarDays,
  Trophy,
  Package,
  PhoneCall,
  DollarSign,
  Quote,
  Plus,
  Trash2,
  Building2,
  Bookmark,
  Megaphone,
  Target,
  Users
} from "lucide-react";
import Link from "next/link";
import { TrendChart } from "@/components/charts/TrendChart";
import { OfficeBreakdownChart } from "@/components/charts/OfficeBreakdownChart";
import { FilterBar, FilterState } from "@/components/ui/FilterBar";
import { ChartSkeleton } from "@/components/ui/Skeleton";

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

interface SavedView {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  preset?: string;
  isSystem: boolean;
}


function formatShortDate(dateStr: string): string {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length < 3) return dateStr;
  return `${parseInt(parts[1])}/${parseInt(parts[2])}`;
}


function toLocalDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getDateRange(preset: string): { start: string; end: string } {
  const today = new Date();
  const todayStr = toLocalDateStr(today);

  switch (preset) {
    case "yesterday": {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      const s = toLocalDateStr(d);
      return { start: s, end: s };
    }
    case "last_week": {
      const currentDay = today.getDay(); // 0 is Sunday, 1 is Monday...
      const distanceToLastMonday = (currentDay === 0 ? 6 : currentDay - 1) + 7;
      const lastMonday = new Date();
      lastMonday.setDate(today.getDate() - distanceToLastMonday);
      
      const lastSunday = new Date(lastMonday);
      lastSunday.setDate(lastMonday.getDate() + 6);
      return {
        start: toLocalDateStr(lastMonday),
        end: toLocalDateStr(lastSunday)
      };
    }
    case "last_month": {
      const firstDay = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const lastDay = new Date(today.getFullYear(), today.getMonth(), 0);
      return {
        start: toLocalDateStr(firstDay),
        end: toLocalDateStr(lastDay)
      };
    }
    case "mtd": {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      return {
        start: toLocalDateStr(firstDay),
        end: todayStr
      };
    }
    case "last_3_months": {
      const firstDay = new Date(today.getFullYear(), today.getMonth() - 3, 1);
      const lastDay = new Date(today.getFullYear(), today.getMonth(), 0);
      return {
        start: toLocalDateStr(firstDay),
        end: toLocalDateStr(lastDay)
      };
    }
    case "ytd":
    default: {
      return {
        start: `${today.getFullYear()}-01-01`,
        end: todayStr
      };
    }
  }
}

function formatSeconds(secs: number): string {
  const hrs = Math.floor(secs / 3600);
  const mins = Math.floor((secs % 3600) / 60);
  if (hrs > 0) {
    return `${hrs}h ${mins}m`;
  }
  return `${mins}m`;
}

export default function Home() {
  const [activePreset, setActivePreset] = useState<string>("mtd");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  
  // Custom Date range pickers
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd] = useState<string>("");

  const [filters, setFilters] = useState<FilterState>({ offices: [], teams: [], agents: [], meetings: [] });
  const [allActiveAgents, setAllActiveAgents] = useState<any[]>([]);
  
  const [metrics, setMetrics] = useState<any[]>([]);
  const [goals, setGoals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastSynced, setLastSynced] = useState<string | null>(null);

  // Saved Views State
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [newViewName, setNewViewName] = useState("");

  const [officeMetric, setOfficeMetric] = useState<"premium" | "items" | "quotes" | "outbound">("premium");

  // Initial Range Set
  useEffect(() => {
    const range = getDateRange("mtd");
    setStartDate(range.start);
    setEndDate(range.end);
    setCustomStart(range.start);
    setCustomEnd(range.end);
  }, []);

  // Sync dates when preset changes
  useEffect(() => {
    if (activePreset && activePreset !== "custom") {
      const range = getDateRange(activePreset);
      setStartDate(range.start);
      setEndDate(range.end);
      setCustomStart(range.start);
      setCustomEnd(range.end);
    }
  }, [activePreset]);

  // Load Saved Views from LocalStorage on mount
  useEffect(() => {
    const loadSavedViews = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const { data: agent } = await supabase
            .from("agents")
            .select("id, system_variants")
            .eq("auth_user_id", user.id)
            .single()

          if (agent && agent.system_variants) {
            const variants = agent.system_variants as Record<string, any>
            if (variants.saved_views) {
              setSavedViews(variants.saved_views)
              return
            }
          }
        }
      } catch (e) {
        console.error("Failed to load saved views from database:", e)
      }
      
      const stored = localStorage.getItem("dsr_dashboard_saved_views")
      if (stored) {
        try {
          setSavedViews(JSON.parse(stored))
        } catch {
          setSavedViews([])
        }
      } else {
        setSavedViews([])
      }
    }

    loadSavedViews()
  }, []);

  // Fetch metrics when date range changes
  const fetchOverview = useCallback(async (start: string, end: string) => {
    setLoading(true);
    try {
      // 1. Fetch KPI goals
      const { data: goalsData } = await supabase.from("kpi_goals").select("*");
      setGoals(goalsData || []);

      // 2. Fetch active + report visible agents details for filtering
      const { data: activeAgents } = await supabase
        .from("agents")
        .select("id, name, office, team")
        .eq("active", true)
        .eq("report_visible", true)
        .not("team", "in", '("Managers","Support")');

      // 3. Paginate to get ALL daily_metrics in the date range for active + visible agents
      let allMetrics: any[] = [];
      let page = 0;
      const PAGE_SIZE = 1000;

      while (true) {
        const { data, error } = await supabase
          .from("daily_metrics")
          .select("*, agents(id, name, office, team, active, report_visible)")
          .gte("report_date", start)
          .lte("report_date", end)
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
        
        if (error) throw error;
        if (!data || data.length === 0) break;
        allMetrics = allMetrics.concat(data);
        if (data.length < PAGE_SIZE) break;
        page++;
      }

      setAllActiveAgents(activeAgents || []);
      setMetrics(allMetrics);

      // 4. Fetch last synced timestamp
      const { data: latestRow } = await supabase
        .from("daily_metrics")
        .select("updated_at")
        .order("updated_at", { ascending: false })
        .limit(1)
        .single();
      if (latestRow?.updated_at) {
        setLastSynced(latestRow.updated_at);
      }
    } catch (err) {
      console.error("Error fetching overview data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (startDate && endDate) {
      fetchOverview(startDate, endDate);
    }
  }, [startDate, endDate, fetchOverview]);

  const availableAgents = useMemo(() => {
    return metrics
      .map(m => m.agents).filter(Boolean)
      .filter(a => {
        const matchOffice = filters.offices.length === 0 || filters.offices.includes(a.office);
        const matchTeam = filters.teams.length === 0 || filters.teams.includes(a.team);
        return matchOffice && matchTeam;
      })
      .map(a => a.name)
      .filter((v: string, i: number, a: string[]) => a.indexOf(v) === i)
      .sort();
  }, [metrics, filters.offices, filters.teams]);

  const filteredActiveAgents = useMemo(() => {
    return allActiveAgents.filter(a => {
      const matchOffice = filters.offices.length === 0 || filters.offices.includes(a.office);
      const matchTeam = filters.teams.length === 0 || filters.teams.includes(a.team);
      const matchAgent = filters.agents.length === 0 || filters.agents.includes(a.name);
      return matchOffice && matchTeam && matchAgent;
    });
  }, [allActiveAgents, filters]);

  const filteredMetrics = useMemo(() => {
    return metrics.filter(m => {
      const agent = m.agents || {};
      const matchOffice = filters.offices.length === 0 || filters.offices.includes(agent.office);
      const matchTeam = filters.teams.length === 0 || filters.teams.includes(agent.team);
      const matchAgent = filters.agents.length === 0 || filters.agents.includes(agent.name);
      return matchOffice && matchTeam && matchAgent;
    });
  }, [metrics, filters]);

  const stats = useMemo(() => {
    let totalCalls = 0;
    let totalOutbound = 0;
    let totalTalkTime = 0;
    let totalPremium = 0;
    let totalItems = 0;
    let totalQuotes = 0;

    filteredMetrics.forEach(m => {
      totalCalls += m.calls || 0;
      totalOutbound += m.outbound || 0;
      totalTalkTime += m.talk_time_seconds || 0;
      totalPremium += parseFloat(m.prem_premium || 0);
      totalItems += m.nb_auto_items || 0;
      totalQuotes += m.quotes || 0;
    });

    return {
      agents: filteredActiveAgents.length,
      calls: totalCalls,
      outbound: totalOutbound,
      talkTime: totalTalkTime,
      premium: totalPremium,
      items: totalItems,
      quotes: totalQuotes
    };
  }, [filteredMetrics, filteredActiveAgents]);

  const agentInsights = useMemo(() => {
    if (filters.agents.length !== 1 || !metrics.length || !allActiveAgents.length) return null;

    const selectedAgentName = filters.agents[0];
    const selectedAgent = allActiveAgents.find(a => a.name === selectedAgentName);
    if (!selectedAgent) return null;

    // Filter metrics for just this agent
    const agentMetrics = metrics.filter(m => m.agents?.name === selectedAgentName);
    if (agentMetrics.length === 0) return null;

    const totalDays = agentMetrics.length;
    let totalCalls = 0;
    let totalOutbound = 0;
    let totalTalkTime = 0;
    let totalPremium = 0;
    let totalItems = 0;
    let totalQuotes = 0;
    let totalTexts = 0;

    agentMetrics.forEach(m => {
      totalCalls += m.calls || 0;
      totalOutbound += m.outbound || 0;
      totalTalkTime += m.talk_time_seconds || 0;
      totalPremium += parseFloat(m.prem_premium || 0);
      totalItems += m.nb_auto_items || 0;
      totalQuotes += m.quotes || 0;
      totalTexts += m.texts || 0;
    });

    const avgOutbound = totalOutbound / totalDays;
    const avgTalkTimeMins = (totalTalkTime / totalDays) / 60;
    const avgQuotes = totalQuotes / totalDays;
    const avgPremium = totalPremium / totalDays;
    const avgItems = totalItems / totalDays;

    const outboundToQuoteRatio = totalOutbound > 0 ? (totalQuotes / totalOutbound) * 100 : 0;
    const quoteConversion = totalQuotes > 0 ? (totalItems / totalQuotes) * 100 : 0;

    // Goal resolution helper
    const getAgentGoalVal = (metric: string, timeframe: string) => {
      const matching = goals.filter(g => g.metric_name === metric && g.timeframe === timeframe);
      if (!matching.length) return null;

      const agentOffice = selectedAgent.office;
      const agentTeam = selectedAgent.team;

      const teamAndOffice = matching.find(g => g.team === agentTeam && g.office === agentOffice);
      if (teamAndOffice) return Number(teamAndOffice.target_value);

      const teamOnly = matching.find(g => g.team === agentTeam && !g.office);
      if (teamOnly) return Number(teamOnly.target_value);

      const officeOnly = matching.find(g => g.office === agentOffice && !g.team);
      if (officeOnly) return Number(officeOnly.target_value);

      const defGoal = matching.find(g => !g.office && !g.team);
      return defGoal ? Number(defGoal.target_value) : null;
    };

    let targetTimeframe = "daily";
    if (activePreset === "mtd" || activePreset === "last_month") targetTimeframe = "monthly";
    else if (activePreset === "last_week") targetTimeframe = "weekly";

    const premiumGoal = getAgentGoalVal("written_premium", targetTimeframe) || getAgentGoalVal("prem_premium", targetTimeframe) || 0;
    const itemsGoal = getAgentGoalVal("items", targetTimeframe) || 0;
    const quotesGoal = getAgentGoalVal("quotes", targetTimeframe) || 0;
    const callsGoal = getAgentGoalVal("calls", targetTimeframe) || 0;

    const positives: string[] = [];
    const negatives: string[] = [];
    const recommendations: string[] = [];

    // Analyze Outbound & Activity
    if (avgOutbound >= 45) {
      positives.push(`High call activity: Averaging ${avgOutbound.toFixed(1)} outbound dials per day, showing excellent phone volume and hustle.`);
    } else if (avgOutbound < 30) {
      negatives.push(`Low phone activity: Averaging only ${avgOutbound.toFixed(1)} outbound dials per day. This is well below the target and restricts top-of-funnel opportunities.`);
      recommendations.push("Implement a daily scheduled time block solely dedicated to outbound call campaigns (e.g., 2 hours in the morning) to raise dialing activity.");
    }

    // Analyze Talk Time & Conversation Depth
    if (avgTalkTimeMins >= 90) {
      positives.push(`Strong customer engagement: Averaging ${(avgTalkTimeMins).toFixed(0)} minutes of talk time per day. Shows they are engaging prospects in deeper conversations.`);
    } else if (avgTalkTimeMins < 45) {
      negatives.push(`Low daily engagement: Averaging only ${(avgTalkTimeMins).toFixed(0)} minutes of daily talk time. This suggests brief, transactional calls rather than in-depth sales discussions.`);
      recommendations.push("Review call flows and objection-handling techniques. Encourage the agent to ask open-ended questions to keep prospects on the phone longer.");
    }

    // Analyze Outbound to Quote Conversion (efficiency)
    if (outboundToQuoteRatio >= 15) {
      positives.push(`Highly efficient dialing: ${outboundToQuoteRatio.toFixed(1)}% of outbound calls result in quotes. This indicates excellent call quality and effective script usage.`);
    } else if (outboundToQuoteRatio < 8 && totalOutbound > 10) {
      negatives.push(`Inflow conversion gap: Only ${outboundToQuoteRatio.toFixed(1)}% of outbound dials translate to quotes. Outbound calls are failing to convert, indicating potential lead quality issues or poor pitch execution.`);
      recommendations.push("Shadow the agent's outbound calls. Listen for the initial hook and pitch, ensuring they are pitching value early to secure the quote.");
    }

    // Quote-to-Item Conversion (closing ability)
    if (quoteConversion >= 25) {
      positives.push(`Strong closing rate: Converting ${quoteConversion.toFixed(1)}% of quotes into auto items. This shows high closing efficiency and strong sales skills.`);
    } else if (quoteConversion < 12 && totalQuotes > 5) {
      negatives.push(`Closing bottleneck: Quote-to-item conversion rate is low at ${quoteConversion.toFixed(1)}%. They are generating quotes but struggling to close policies.`);
      recommendations.push("Review follow-up cadences and closing questions. Ensure the agent is presenting quotes with clear next steps and asking for the business directly.");
    }

    // Pacing Goals
    if (premiumGoal > 0) {
      const premPct = (totalPremium / premiumGoal) * 100;
      if (premPct >= 100) {
        positives.push(`Goal exceeded: Achieved ${premPct.toFixed(0)}% of the written premium goal for this timeframe (Wrote $${Math.round(totalPremium).toLocaleString()} vs. $${premiumGoal.toLocaleString()} goal).`);
      } else if (premPct < 75) {
        negatives.push(`Premium pace gap: Currently pacing at only ${premPct.toFixed(0)}% of their written premium goal (Wrote $${Math.round(totalPremium).toLocaleString()} of the $${premiumGoal.toLocaleString()} target).`);
        recommendations.push("Prioritize higher-value leads or multiline opportunities (e.g., cross-selling home/umbrella to auto quotes) to boost premium average per write.");
      }
    }

    if (itemsGoal > 0) {
      const itemsPct = (totalItems / itemsGoal) * 100;
      if (itemsPct >= 100) {
        positives.push(`Items goal met: Achieved ${itemsPct.toFixed(0)}% of the auto items goal (Wrote ${totalItems} items vs. ${itemsGoal} goal).`);
      } else if (itemsPct < 75) {
        negatives.push(`Items volume concern: Currently pacing at ${itemsPct.toFixed(0)}% of the auto items goal (Wrote ${totalItems} items of the ${itemsGoal} target).`);
      }
    }

    // High talk time but low results (efficiency mismatch)
    if (avgTalkTimeMins > 100 && quoteConversion < 10 && totalQuotes > 0) {
      negatives.push("High talk time, low conversion: Agent spends significant time on calls but has a low closing rate. This indicates over-talking or inability to lead the call to a close.");
      recommendations.push("Train the agent on call control. They should guide conversations more efficiently to avoid wasting time on non-viable prospects.");
    }

    // Texting utilization
    if (totalTexts === 0 && totalDays > 3) {
      negatives.push("Zero Hearsay text utilization: No outbound texts sent. Text messaging is a key tool for follow-ups and contact rate improvement.");
      recommendations.push("Ensure Hearsay text templates are configured and set a goal of sending at least 10 follow-up texts per day.");
    } else if (totalTexts > 100) {
      positives.push(`High texting engagement: Sent ${totalTexts} follow-up text messages, demonstrating effective use of omnichannel contact methods.`);
    }

    // Fallbacks if lists are empty
    if (positives.length === 0) {
      positives.push("Maintaining consistent daily login and reporting structure.");
    }
    if (negatives.length === 0) {
      positives.push("No immediate performance gaps identified; maintaining solid overall baselines.");
    }
    if (recommendations.length === 0) {
      recommendations.push("Continue monitoring weekly pacing metrics and maintain current outbound dial volume.");
    }

    return {
      agentName: selectedAgentName,
      office: selectedAgent.office,
      team: selectedAgent.team,
      timeframeLabel: targetTimeframe === "monthly" ? "Month-to-Date" : targetTimeframe === "weekly" ? "Week-to-Date" : "Daily",
      positives,
      negatives,
      recommendations
    };
  }, [metrics, goals, filters.agents, allActiveAgents, activePreset]);

  // Team / Office-level talking points
  const groupInsights = useMemo(() => {
    if (!metrics.length || !allActiveAgents.length) return null;

    // Determine group type and name
    let groupType: "team" | "office" | null = null;
    let groupName = "";

    if (filters.agents.length === 0 && filters.teams.length === 1) {
      groupType = "team";
      groupName = filters.teams[0];
    } else if (filters.agents.length === 0 && filters.teams.length === 0 && filters.offices.length === 1) {
      groupType = "office";
      groupName = filters.offices[0];
    }

    if (!groupType) return null;

    // Get agents in this group
    const groupAgents = allActiveAgents.filter(a =>
      groupType === "team" ? a.team === groupName : a.office === groupName
    );
    if (groupAgents.length < 2) return null; // Need at least 2 agents for group comparison

    const groupAgentNames = new Set(groupAgents.map((a: any) => a.name));

    // Aggregate per-agent totals within the group
    const perAgent: Record<string, { name: string; outbound: number; quotes: number; items: number; premium: number; days: number }> = {};
    metrics.forEach(m => {
      const agentName = m.agents?.name;
      if (!agentName || !groupAgentNames.has(agentName)) return;
      if (!perAgent[agentName]) {
        perAgent[agentName] = { name: agentName, outbound: 0, quotes: 0, items: 0, premium: 0, days: 0 };
      }
      perAgent[agentName].outbound += m.outbound || 0;
      perAgent[agentName].quotes += m.quotes || 0;
      perAgent[agentName].items += m.nb_auto_items || 0;
      perAgent[agentName].premium += parseFloat(m.prem_premium || 0);
      perAgent[agentName].days += 1;
    });

    const agentList = Object.values(perAgent).filter(a => a.days > 0);
    if (agentList.length < 2) return null;

    // Group averages (per agent across the period)
    const groupAgentCount = agentList.length;
    const groupTotalOutbound = agentList.reduce((s, a) => s + a.outbound, 0);
    const groupTotalQuotes = agentList.reduce((s, a) => s + a.quotes, 0);
    const groupTotalItems = agentList.reduce((s, a) => s + a.items, 0);
    const groupTotalPremium = agentList.reduce((s, a) => s + a.premium, 0);

    const groupAvgOutbound = groupTotalOutbound / groupAgentCount;
    const groupAvgQuotes = groupTotalQuotes / groupAgentCount;
    const groupAvgItems = groupTotalItems / groupAgentCount;
    const groupAvgPremium = groupTotalPremium / groupAgentCount;

    // Agency-wide averages (all agents, unfiltered)
    const allPerAgent: Record<string, { outbound: number; quotes: number; items: number; premium: number; days: number }> = {};
    metrics.forEach(m => {
      const agentName = m.agents?.name;
      if (!agentName) return;
      if (!allPerAgent[agentName]) {
        allPerAgent[agentName] = { outbound: 0, quotes: 0, items: 0, premium: 0, days: 0 };
      }
      allPerAgent[agentName].outbound += m.outbound || 0;
      allPerAgent[agentName].quotes += m.quotes || 0;
      allPerAgent[agentName].items += m.nb_auto_items || 0;
      allPerAgent[agentName].premium += parseFloat(m.prem_premium || 0);
      allPerAgent[agentName].days += 1;
    });

    const allAgentList = Object.values(allPerAgent).filter(a => a.days > 0);
    const allAgentCount = allAgentList.length;
    if (allAgentCount === 0) return null;

    const agencyAvgOutbound = allAgentList.reduce((s, a) => s + a.outbound, 0) / allAgentCount;
    const agencyAvgQuotes = allAgentList.reduce((s, a) => s + a.quotes, 0) / allAgentCount;
    const agencyAvgItems = allAgentList.reduce((s, a) => s + a.items, 0) / allAgentCount;
    const agencyAvgPremium = allAgentList.reduce((s, a) => s + a.premium, 0) / allAgentCount;

    // Top and bottom performers (by premium)
    const sortedByPremium = [...agentList].sort((a, b) => b.premium - a.premium);
    const topPerformer = sortedByPremium[0];
    const bottomPerformer = sortedByPremium[sortedByPremium.length - 1];

    // Generate insights
    const positives: string[] = [];
    const negatives: string[] = [];
    const recommendations: string[] = [];

    const pctDiff = (groupVal: number, agencyVal: number) =>
      agencyVal > 0 ? ((groupVal - agencyVal) / agencyVal) * 100 : 0;

    // Outbound calls
    const outboundPct = pctDiff(groupAvgOutbound, agencyAvgOutbound);
    if (outboundPct >= 5) {
      positives.push(`${groupName} ${groupType} averaging ${groupAvgOutbound.toFixed(1)} outbound calls/agent — ${Math.abs(outboundPct).toFixed(0)}% above agency average.`);
    } else if (outboundPct <= -10) {
      negatives.push(`${groupName} ${groupType} averaging only ${groupAvgOutbound.toFixed(1)} outbound calls/agent — ${Math.abs(outboundPct).toFixed(0)}% below agency average.`);
      recommendations.push(`Review outbound call expectations with the ${groupName} ${groupType}. Consider setting a minimum daily dial target.`);
    }

    // Quotes
    const quotesPct = pctDiff(groupAvgQuotes, agencyAvgQuotes);
    if (quotesPct >= 5) {
      positives.push(`${groupName} ${groupType} averaging ${groupAvgQuotes.toFixed(1)} quotes/agent — ${Math.abs(quotesPct).toFixed(0)}% above agency average.`);
    } else if (quotesPct <= -10) {
      negatives.push(`${groupName} ${groupType} averaging only ${groupAvgQuotes.toFixed(1)} quotes/agent — ${Math.abs(quotesPct).toFixed(0)}% below agency average.`);
      recommendations.push(`Investigate quote generation workflow for the ${groupName} ${groupType}. Ensure leads are being worked and quoted promptly.`);
    }

    // Items
    const itemsPct = pctDiff(groupAvgItems, agencyAvgItems);
    if (itemsPct >= 5) {
      positives.push(`${groupName} ${groupType} averaging ${groupAvgItems.toFixed(1)} items/agent — ${Math.abs(itemsPct).toFixed(0)}% above agency average.`);
    } else if (itemsPct <= -10) {
      negatives.push(`${groupName} ${groupType} averaging only ${groupAvgItems.toFixed(1)} items/agent — ${Math.abs(itemsPct).toFixed(0)}% below agency average.`);
    }

    // Premium
    const premiumPct = pctDiff(groupAvgPremium, agencyAvgPremium);
    if (premiumPct >= 5) {
      positives.push(`${groupName} ${groupType} averaging $${Math.round(groupAvgPremium).toLocaleString()} premium/agent — ${Math.abs(premiumPct).toFixed(0)}% above agency average.`);
    } else if (premiumPct <= -10) {
      negatives.push(`${groupName} ${groupType} averaging only $${Math.round(groupAvgPremium).toLocaleString()} premium/agent — ${Math.abs(premiumPct).toFixed(0)}% below agency average.`);
      recommendations.push(`Focus on higher-value opportunities within the ${groupName} ${groupType} to close the premium gap.`);
    }

    // Top/Bottom performer pairing
    if (topPerformer && bottomPerformer && topPerformer.name !== bottomPerformer.name) {
      positives.push(`Top performer: ${topPerformer.name} with $${Math.round(topPerformer.premium).toLocaleString()} in written premium.`);
      if (bottomPerformer.premium < topPerformer.premium * 0.4) {
        recommendations.push(`Consider pairing ${bottomPerformer.name} with ${topPerformer.name} for mentoring — significant premium gap between top and bottom performers.`);
      }
    }

    // Fallbacks
    if (positives.length === 0) {
      positives.push(`${groupName} ${groupType} is performing in line with agency averages across key metrics.`);
    }
    if (negatives.length === 0) {
      positives.push(`No critical performance gaps identified for the ${groupName} ${groupType}.`);
    }
    if (recommendations.length === 0) {
      recommendations.push(`Continue monitoring ${groupName} ${groupType} pacing and maintain current performance standards.`);
    }

    return {
      groupType,
      groupName,
      agentCount: groupAgentCount,
      positives,
      negatives,
      recommendations
    };
  }, [metrics, allActiveAgents, filters.agents, filters.teams, filters.offices]);

  // Saved Views actions
  const handleSelectView = (view: SavedView) => {
    if (view.preset) {
      setActivePreset(view.preset);
    } else {
      setActivePreset("custom");
      setStartDate(view.startDate);
      setEndDate(view.endDate);
      setCustomStart(view.startDate);
      setCustomEnd(view.endDate);
    }
  };

  const saveViewsToDB = async (updatedViews: SavedView[]) => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: agent } = await supabase
          .from("agents")
          .select("id, system_variants")
          .eq("auth_user_id", user.id)
          .single()

        if (agent) {
          const variants = (agent.system_variants as Record<string, any>) || {}
          variants.saved_views = updatedViews
          await supabase
            .from("agents")
            .update({ system_variants: variants, updated_at: new Date().toISOString() })
            .eq("id", agent.id)
        }
      }
    } catch (e) {
      console.error("Failed to save views to database:", e)
    }
  }

  const handleSaveView = async () => {
    if (!newViewName.trim()) return;

    const newView: SavedView = {
      id: "usr-" + Date.now(),
      name: newViewName.trim(),
      startDate,
      endDate,
      isSystem: false
    };

    const updatedViews = [...savedViews, newView];
    localStorage.setItem("dsr_dashboard_saved_views", JSON.stringify(updatedViews));
    setSavedViews(updatedViews);
    setNewViewName("");
    setShowSaveModal(false);
    await saveViewsToDB(updatedViews);
  };

  const handleDeleteView = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updatedViews = savedViews.filter(v => v.id !== id);
    localStorage.setItem("dsr_dashboard_saved_views", JSON.stringify(updatedViews));
    setSavedViews(updatedViews);
    await saveViewsToDB(updatedViews);
  };

  // Custom date submission
  const handleApplyCustomDate = () => {
    if (customStart && customEnd) {
      if (customStart > customEnd) {
        alert("Start date cannot be after end date.");
        return;
      }
      setActivePreset("custom");
      setStartDate(customStart);
      setEndDate(customEnd);
    }
  };

  // Office Manager Alert calculations
  const agentDailyAverages = useMemo(() => {
    const agg: Record<string, { id: string; name: string; office: string; team: string; totalOutbound: number; totalTalkTime: number; daysCount: number }> = {};
    
    filteredMetrics.forEach(m => {
      const aid = m.agent_id;
      if (!aid || !m.agents) return;
      if (!agg[aid]) {
        agg[aid] = {
          id: aid,
          name: m.agents.name,
          office: m.agents.office,
          team: m.agents.team,
          totalOutbound: 0,
          totalTalkTime: 0,
          daysCount: 0
        };
      }
      agg[aid].totalOutbound += m.outbound || 0;
      agg[aid].totalTalkTime += m.talk_time_seconds || 0;
      agg[aid].daysCount += 1;
    });

    return Object.values(agg).map(a => ({
      ...a,
      avgOutbound: a.daysCount > 0 ? a.totalOutbound / a.daysCount : 0,
      avgTalkTimeMinutes: a.daysCount > 0 ? (a.totalTalkTime / a.daysCount) / 60 : 0
    }));
  }, [filteredMetrics]);

  const lowOutboundAlerts = useMemo(() => {
    return agentDailyAverages
      .filter(a => a.avgOutbound < 20)
      .sort((a, b) => a.avgOutbound - b.avgOutbound);
  }, [agentDailyAverages]);

  const lowTalkTimeAlerts = useMemo(() => {
    return agentDailyAverages
      .filter(a => a.avgTalkTimeMinutes < 60)
      .sort((a, b) => a.avgTalkTimeMinutes - b.avgTalkTimeMinutes);
  }, [agentDailyAverages]);

  const quotesGoalHitRate = useMemo(() => {
    if (filteredMetrics.length === 0) return 0;
    const hits = filteredMetrics.filter(m => (m.quotes || 0) >= 4).length;
    return (hits / filteredMetrics.length) * 100;
  }, [filteredMetrics]);

  // Pacing Goals calculation based on selected timeframe
  const pacingGoals = useMemo(() => {
    let timeframe = "daily";
    if (activePreset === "ytd") timeframe = "ytd";
    else if (activePreset === "mtd" || activePreset === "last_month") timeframe = "monthly";
    else if (activePreset === "last_week") timeframe = "weekly";

    const matching = goals.filter(g => g.timeframe === timeframe);

    return matching.map(g => {
      let currentVal = 0;
      if (g.metric_name === "prem_premium" || g.metric_name === "written_premium") {
        currentVal = stats.premium;
      } else if (g.metric_name === "items") {
        currentVal = stats.items;
      } else if (g.metric_name === "calls") {
        currentVal = stats.calls;
      } else if (g.metric_name === "quotes") {
        currentVal = stats.quotes;
      }

      // Multiply target by the number of active agents matching the current filter state
      const target = Number(g.target_value) * (stats.agents || 1);
      const percent = target > 0 ? (currentVal / target) * 100 : 0;

      return {
        id: g.id,
        metric: g.metric_name,
        timeframe: g.timeframe,
        target,
        current: currentVal,
        percent: Math.min(100, Math.round(percent * 10) / 10),
        rawPercent: percent,
        label: g.metric_name === "written_premium" || g.metric_name === "prem_premium" ? "Premium" :
               g.metric_name === "items" ? "Items" :
               g.metric_name === "calls" ? "Calls" :
               g.metric_name === "quotes" ? "Quotes" : g.metric_name
      };
    });
  }, [goals, stats, activePreset]);

  // Analyst Trend Chart Aggregator
  const aggregatedTrendData = useMemo(() => {
    if (filteredMetrics.length === 0 || !startDate || !endDate) return [];

    const diffDays = Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 3600 * 24)) + 1;

    if (diffDays <= 31) {
      // Daily aggregation
      const agg: Record<string, any> = {};
      filteredMetrics.forEach(m => {
        const key = m.report_date;
        if (!key) return;
        if (!agg[key]) {
          const dayAbbr = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][new Date(key + "T12:00:00").getDay()];
          agg[key] = { label: `${dayAbbr} ${formatShortDate(key)}`, premium: 0, items: 0, outbound: 0, talkTime: 0, quotes: 0, nb_count: 0 };
        }
        agg[key].premium += parseFloat(m.prem_premium || 0);
        agg[key].items += m.nb_auto_items || 0;
        agg[key].outbound += m.outbound || 0;
        agg[key].talkTime += (m.talk_time_seconds || 0) / 3600; // hours
        agg[key].quotes += m.quotes || 0;
        agg[key].nb_count += m.nb_auto_count || 0;
      });
      return Object.entries(agg)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([, val]: any) => val);
    } else if (diffDays <= 180) {
      // Weekly aggregation
      const agg: Record<string, any> = {};
      filteredMetrics.forEach(m => {
        if (!m.report_date) return;
        const dateObj = new Date(m.report_date + "T12:00:00");
        const day = dateObj.getDay();
        const diff = dateObj.getDate() - day + (day === 0 ? -6 : 1); // Monday
        const monday = new Date(dateObj.setDate(diff));
        const key = monday.toISOString().split("T")[0];

        if (!agg[key]) {
          agg[key] = { label: `Wk ${key.substring(5)}`, premium: 0, items: 0, outbound: 0, talkTime: 0, quotes: 0, nb_count: 0, _date: key };
        }
        agg[key].premium += parseFloat(m.prem_premium || 0);
        agg[key].items += m.nb_auto_items || 0;
        agg[key].outbound += m.outbound || 0;
        agg[key].talkTime += (m.talk_time_seconds || 0) / 3600;
        agg[key].quotes += m.quotes || 0;
        agg[key].nb_count += m.nb_auto_count || 0;
      });
      return Object.values(agg).sort((a: any, b: any) => a._date.localeCompare(b._date));
    } else {
      // Monthly aggregation
      const agg: Record<string, any> = {};
      filteredMetrics.forEach(m => {
        if (!m.report_date) return;
        const dateObj = new Date(m.report_date + "T12:00:00");
        const monthIdx = dateObj.getMonth();
        const monthName = MONTH_NAMES[monthIdx];
        const year = dateObj.getFullYear();
        const key = `${year}-${String(monthIdx + 1).padStart(2, "0")}`;

        if (!agg[key]) {
          agg[key] = { label: `${monthName} ${year.toString().substring(2)}`, premium: 0, items: 0, outbound: 0, talkTime: 0, quotes: 0, nb_count: 0, _key: key };
        }
        agg[key].premium += parseFloat(m.prem_premium || 0);
        agg[key].items += m.nb_auto_items || 0;
        agg[key].outbound += m.outbound || 0;
        agg[key].talkTime += (m.talk_time_seconds || 0) / 3600;
        agg[key].quotes += m.quotes || 0;
        agg[key].nb_count += m.nb_auto_count || 0;
      });
      return Object.values(agg).sort((a: any, b: any) => a._key.localeCompare(b._key));
    }
  }, [filteredMetrics, startDate, endDate]);

  // Office Comparison breakdown data
  const officeData = useMemo(() => {
    const agg: Record<string, { office: string; premium: number; items: number; quotes: number; outbound: number }> = {};
    
    // Initialize standard offices
    const STANDARD_OFFICES = ["MCM", "MB", "RC", "CH"];
    STANDARD_OFFICES.forEach(o => {
      agg[o] = { office: o, premium: 0, items: 0, quotes: 0, outbound: 0 };
    });

    filteredMetrics.forEach(m => {
      const office = m.agents?.office || "Other";
      if (!agg[office]) {
        agg[office] = { office, premium: 0, items: 0, quotes: 0, outbound: 0 };
      }
      agg[office].premium += parseFloat(m.prem_premium || 0);
      agg[office].items += m.nb_auto_items || 0;
      agg[office].quotes += m.quotes || 0;
      agg[office].outbound += m.outbound || 0;
    });

    return Object.values(agg).filter(o => o.office !== "Other");
  }, [filteredMetrics]);

  // Aggregate Top Agents for the selected timeframe
  const aggregatedAgents = useMemo(() => {
    const agg: Record<string, any> = {};
    filteredMetrics.forEach(m => {
      const id = m.agent_id;
      if (!id || !m.agents || !m.agents.active || !m.agents.report_visible) return;
      if (!agg[id]) {
        agg[id] = {
          id,
          name: m.agents.name,
          office: m.agents.office,
          team: m.agents.team,
          premium: 0,
          items: 0,
          quotes: 0,
          outbound: 0,
          talkTime: 0
        };
      }
      agg[id].premium += parseFloat(m.prem_premium || 0);
      agg[id].items += m.nb_auto_items || 0;
      agg[id].quotes += m.quotes || 0;
      agg[id].outbound += m.outbound || 0;
      agg[id].talkTime += m.talk_time_seconds || 0;
    });
    return Object.values(agg);
  }, [filteredMetrics]);

  const topPremium = useMemo(() => [...aggregatedAgents].sort((a, b) => b.premium - a.premium).slice(0, 3), [aggregatedAgents]);
  const topItems = useMemo(() => [...aggregatedAgents].sort((a, b) => b.items - a.items).slice(0, 3), [aggregatedAgents]);
  const topQuotes = useMemo(() => [...aggregatedAgents].sort((a, b) => b.quotes - a.quotes).slice(0, 3), [aggregatedAgents]);
  const topOutbound = useMemo(() => [...aggregatedAgents].sort((a, b) => b.outbound - a.outbound).slice(0, 3), [aggregatedAgents]);
  const topTalkTime = useMemo(() => [...aggregatedAgents].sort((a, b) => b.talkTime - a.talkTime).slice(0, 3), [aggregatedAgents]);

  const isCurrentViewSaved = useMemo(() => {
    return savedViews.some(v => v.startDate === startDate && v.endDate === endDate);
  }, [savedViews, startDate, endDate]);

  return (
    <PageGuard pageKey="overview">
    <main className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto min-h-screen flex flex-col gap-6 sm:gap-8 text-slate-800">
      
      {/* Compact Header */}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-900 text-white p-5 sm:p-6 rounded-2xl shadow-xl relative overflow-hidden border border-slate-800 shrink-0">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10">
          <Badge variant="success" className="mb-2 bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
            Executive View
          </Badge>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-indigo-100 to-purple-200">
            Agency Overview Dashboard
          </h1>
          <p className="text-slate-400 mt-1 text-xs sm:text-sm font-medium">
            Performance analysis, manager insights, and multi-timeline data breakdowns.
          </p>
        </div>
        <div className="flex items-center gap-2 bg-slate-800/80 px-3.5 py-2 rounded-xl border border-slate-700 font-mono text-xs sm:text-sm font-semibold relative z-10">
          <CalendarDays className="w-4 h-4 text-indigo-400" />
          <span>{formatShortDate(startDate)}</span>
          <span className="text-slate-500">to</span>
          <span>{formatShortDate(endDate)}</span>
        </div>
        {lastSynced && (
          <div className="absolute bottom-2 right-3 z-10 text-[10px] text-slate-500 font-medium">
            Data as of {new Date(lastSynced).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
          </div>
        )}
      </header>

      {/* Filter Bar */}
      <Card className="border border-slate-200 shadow-sm">
        <CardContent className="p-3.5 sm:p-4 flex flex-col gap-3">
          {/* Row 1: Presets + Custom Range */}
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1 rounded-lg border border-slate-200">
              {["yesterday", "last_week", "last_month", "last_3_months", "mtd", "ytd"].map((preset) => (
                <button
                  key={preset}
                  onClick={() => setActivePreset(preset)}
                  className={`px-3 py-1.5 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider rounded-md transition-all ${
                    activePreset === preset
                      ? "bg-white text-indigo-600 shadow-sm border border-slate-200"
                      : "text-slate-500 hover:text-slate-800 hover:bg-white/50"
                  }`}
                >
                  {preset.replaceAll("_", " ")}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2 bg-slate-50 p-1.5 rounded-lg border border-slate-200">
              <span className="text-[10px] font-bold text-slate-400 px-1 uppercase tracking-wider">Custom</span>
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="bg-white text-slate-800 border border-slate-200 rounded-md px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
              />
              <span className="text-slate-400 font-mono text-xs">–</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="bg-white text-slate-800 border border-slate-200 rounded-md px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={handleApplyCustomDate}
                className="bg-indigo-600 border-indigo-600 text-white hover:bg-indigo-700 hover:border-indigo-700 h-7 text-[11px] font-bold rounded-md"
              >
                Apply
              </Button>
            </div>
          </div>

          {/* Row 2: Saved Views + Save Button */}
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mr-1 flex items-center gap-1">
              <Bookmark className="w-3 h-3" /> Views
            </span>
            {savedViews.length > 0 ? (
              savedViews.map((view) => {
                const isActive = view.startDate === startDate && view.endDate === endDate;
                return (
                  <div
                    key={view.id}
                    onClick={() => handleSelectView(view)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-semibold cursor-pointer transition-all ${
                      isActive
                        ? "bg-indigo-600 text-white shadow-sm"
                        : "bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200 hover:text-slate-800"
                    }`}
                  >
                    <span>{view.name}</span>
                    <button
                      onClick={(e) => handleDeleteView(view.id, e)}
                      className={`${isActive ? "text-indigo-200 hover:text-white" : "text-slate-400 hover:text-red-500"} transition-colors p-0.5 rounded`}
                      title="Delete view"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                );
              })
            ) : (
              <span
                onClick={() => setShowSaveModal(true)}
                className="text-[11px] text-slate-400 italic cursor-pointer hover:text-indigo-500 transition-colors flex items-center gap-1"
              >
                <Plus className="w-3 h-3" />
                No saved views — click to bookmark a date range
              </span>
            )}
            <div className="ml-auto">
              {!isCurrentViewSaved && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setShowSaveModal(true)} 
                  className="h-7 px-3 text-[11px] font-bold text-indigo-600 border-indigo-200 hover:bg-indigo-50 rounded-md flex items-center gap-1.5"
                >
                  <Bookmark className="w-3 h-3" />
                  Save View
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <FilterBar 
        onFilterChange={setFilters} 
        availableAgents={availableAgents} 
      />

      {/* Save View Modal Backdrop/Overlay */}
      {showSaveModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <Card className="max-w-md w-full border border-slate-200 shadow-2xl bg-white animate-in zoom-in-95 duration-150">
            <CardHeader className="pb-4">
              <CardTitle className="text-xl font-black flex items-center gap-2 text-slate-900">
                <Bookmark className="w-5 h-5 text-indigo-600" /> Save Current View
              </CardTitle>
              <CardDescription>
                Create a quick shortcut for the active date range ({formatShortDate(startDate)} to {formatShortDate(endDate)}).
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">View Name</label>
                <input
                  type="text"
                  placeholder="e.g., Q1 Performance Review"
                  value={newViewName}
                  onChange={(e) => setNewViewName(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg p-2.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50 text-slate-800"
                  maxLength={30}
                  autoFocus
                />
              </div>
              <div className="flex justify-end gap-2 mt-2">
                <Button variant="outline" onClick={() => setShowSaveModal(false)} className="rounded-lg h-10 text-xs font-bold">
                  Cancel
                </Button>
                <Button onClick={handleSaveView} className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg h-10 text-xs font-bold px-5">
                  Save View
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Module Access Navigation Cards */}
      <section>
        <h2 className="text-lg sm:text-xl font-bold text-slate-900 mb-3 sm:mb-4">Module Access</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <NavCard title="Daily Standup" desc="Detailed daily breakdown of activities." href="/reports/daily" />
          <NavCard title="Weekly Report" desc="Aggregated performance for the week." href="/reports/weekly" />
          <NavCard title="MTD Performance" desc="Analyze month-to-date trends & pace." href="/reports/mtd" />
          <NavCard title="Communication" desc="Agency announcements & messaging." href="/communication" />
        </div>
      </section>

      {/* Leaderboard Lists */}
      {!loading && aggregatedAgents.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="text-lg sm:text-xl font-bold text-slate-900 mb-1 flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-500 shrink-0" /> Agency Top Performers ({formatShortDate(startDate)} to {formatShortDate(endDate)})
          </h2>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4 sm:gap-6">
            <LeaderboardCard
              title="Top Premium"
              data={topPremium}
              metricKey="premium"
              isCurrency={true}
              color="emerald"
            />
            <LeaderboardCard
              title="Most Items"
              data={topItems}
              metricKey="items"
              isCurrency={false}
              color="blue"
            />
            <LeaderboardCard
              title="Top Quotes"
              data={topQuotes}
              metricKey="quotes"
              isCurrency={false}
              color="amber"
            />
            <LeaderboardCard
              title="Top Outbound Dials"
              data={topOutbound}
              metricKey="outbound"
              isCurrency={false}
              color="violet"
            />
            <LeaderboardCard
              title="Top Talk Duration"
              data={topTalkTime}
              metricKey="talkTime"
              isDuration={true}
              color="pink"
            />
          </div>
        </section>
      )}

      {/* Main KPI Row */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6">
        <KPICard
          title="Written Premium"
          value={loading ? "..." : `$${Math.round(stats.premium).toLocaleString()}`}
          description={`${loading ? "..." : stats.agents} active agents submitting`}
          icon={<DollarSign className="w-5 h-5 text-emerald-600" />}
          color="emerald"
        />
        <KPICard
          title="Items Written"
          value={loading ? "..." : stats.items.toLocaleString()}
          description={loading ? "..." : `Average ${(stats.items / (stats.agents || 1)).toFixed(1)} items / agent`}
          icon={<Package className="w-5 h-5 text-blue-600" />}
          color="blue"
        />
        <KPICard
          title="Quotes Provided"
          value={loading ? "..." : stats.quotes.toLocaleString()}
          description={loading ? "..." : `${quotesGoalHitRate.toFixed(1)}% daily quote goal hit rate`}
          icon={<Quote className="w-5 h-5 text-amber-600" />}
          color="amber"
        />
        <KPICard
          title="Call Center Velocity"
          value={loading ? "..." : `${stats.calls.toLocaleString()} dials`}
          description={loading ? "..." : `${formatSeconds(stats.talkTime)} talk time (${stats.outbound.toLocaleString()} outbound)`}
          icon={<PhoneCall className="w-5 h-5 text-violet-600" />}
          color="violet"
        />
      </section>

      {/* Timeline Trend Charts — 2x2 Grid */}
      <section className="flex flex-col gap-6">
        <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-blue-500" /> Timeline Trends
        </h2>

        {loading ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {[1,2,3,4].map(i => (
              <ChartSkeleton key={i} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="h-[380px]">
              <TrendChart
                title="Items Written"
                data={aggregatedTrendData}
                xAxisKey="label"
                lines={[{ key: "items", name: "Items", color: "#3b82f6" }]}
              />
            </div>
            <div className="h-[380px]">
              <TrendChart
                title="Written Premium"
                data={aggregatedTrendData}
                xAxisKey="label"
                lines={[{ key: "premium", name: "Premium", color: "#10b981", formatter: (v: number) => `$${v >= 1000 ? `${(v/1000).toFixed(0)}K` : Math.round(v).toLocaleString()}` }]}
                yAxisFormatter={(v: number) => v >= 1000000 ? `$${(v/1000000).toFixed(1)}M` : v >= 1000 ? `$${(v/1000).toFixed(0)}K` : `$${v}`}
              />
            </div>
            <div className="h-[380px]">
              <TrendChart
                title="Quotes Provided"
                data={aggregatedTrendData}
                xAxisKey="label"
                lines={[{ key: "quotes", name: "Quotes", color: "#f59e0b" }]}
              />
            </div>
            <div className="h-[380px]">
              <TrendChart
                title="New Business (Policies Sold)"
                data={aggregatedTrendData}
                xAxisKey="label"
                lines={[{ key: "nb_count", name: "NB Policies", color: "#8b5cf6" }]}
              />
            </div>
          </div>
        )}
      </section>

      {/* Office Comparison Chart */}
      <section className="flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-emerald-500" /> Office Comparisons
          </h2>
          <select
            value={officeMetric}
            onChange={(e: any) => setOfficeMetric(e.target.value)}
            className="text-xs font-bold bg-white text-slate-700 border border-slate-200 rounded px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-sm"
          >
            <option value="premium">Premium</option>
            <option value="items">Items</option>
            <option value="quotes">Quotes</option>
            <option value="outbound">Outbound</option>
          </select>
        </div>

        {loading ? (
          <Card className="h-[350px] flex items-center justify-center text-slate-400">Loading chart...</Card>
        ) : (
          <div className="h-[350px]">
            <OfficeBreakdownChart
              title={`Office Breakdown (${officeMetric.charAt(0).toUpperCase() + officeMetric.slice(1)})`}
              data={officeData}
              metricKey={officeMetric}
              metricName={officeMetric === "premium" ? "Premium ($)" : officeMetric === "items" ? "Items" : officeMetric === "quotes" ? "Quotes" : "Outbound Calls"}
              color={officeMetric === "premium" ? "#10b981" : officeMetric === "items" ? "#3b82f6" : officeMetric === "quotes" ? "#f59e0b" : "#8b5cf6"}
            />
          </div>
        )}
      </section>

      {/* Agent-Specific Talking Points */}
      {agentInsights && (
        <section className="mt-4 border-t border-slate-200 pt-6">
          <Card className="border border-slate-200 shadow-md bg-white">
            <CardHeader className="bg-slate-50 border-b border-slate-100 py-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                <div>
                  <Badge variant="outline" className="mb-1 text-slate-500 text-[10px] uppercase font-bold tracking-wider">
                    Performance Insight • {agentInsights.timeframeLabel}
                  </Badge>
                  <CardTitle className="text-lg font-black text-slate-900 flex items-center gap-2">
                    <Megaphone className="w-5 h-5 text-indigo-500" />
                    Critical Talking Points for {agentInsights.agentName}
                  </CardTitle>
                </div>
                <div className="text-xs text-slate-400 font-medium font-mono bg-white px-3 py-1 rounded border border-slate-200/60 shadow-inner shrink-0 self-start md:self-auto">
                  Office: {agentInsights.office} • Team: {agentInsights.team}
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6 flex flex-col gap-6">
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Positive Signals */}
                <div className="space-y-3">
                  <h3 className="text-xs font-bold text-emerald-600 uppercase tracking-widest flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" /> Positive Signals
                  </h3>
                  <ul className="space-y-2.5">
                    {agentInsights.positives.map((p, idx) => (
                      <li key={idx} className="text-xs font-medium text-slate-600 bg-emerald-50/30 border border-emerald-50 rounded-lg p-3 leading-relaxed flex items-start gap-2">
                        <span className="text-emerald-500 font-bold shrink-0">✓</span>
                        <span>{p}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Gaps & Concerns */}
                <div className="space-y-3">
                  <h3 className="text-xs font-bold text-rose-600 uppercase tracking-widest flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-rose-500" /> Critical Concerns & Gaps
                  </h3>
                  <ul className="space-y-2.5">
                    {agentInsights.negatives.map((n, idx) => (
                      <li key={idx} className="text-xs font-medium text-slate-600 bg-rose-50/30 border border-rose-50 rounded-lg p-3 leading-relaxed flex items-start gap-2">
                        <span className="text-rose-500 font-bold shrink-0">⚠️</span>
                        <span>{n}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Recommendations */}
              <div className="border-t border-slate-100 pt-5 space-y-3">
                <h3 className="text-xs font-bold text-indigo-600 uppercase tracking-widest flex items-center gap-1.5">
                  💡 Manager Action Items
                </h3>
                <ul className="space-y-2">
                  {agentInsights.recommendations.map((r, idx) => (
                    <li key={idx} className="text-xs font-semibold text-slate-700 bg-indigo-50/20 border border-indigo-50/50 rounded-lg p-3 leading-relaxed flex items-start gap-2.5">
                      <span className="text-indigo-500 shrink-0 mt-0.5">🔹</span>
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              </div>

            </CardContent>
          </Card>
        </section>
      )}

      {/* Team / Office-Level Talking Points */}
      {groupInsights && (
        <section className="mt-4 border-t border-slate-200 pt-6">
          <Card className="border border-slate-200 shadow-md bg-white">
            <CardHeader className="bg-slate-50 border-b border-slate-100 py-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                <div>
                  <Badge variant="outline" className="mb-1 text-slate-500 text-[10px] uppercase font-bold tracking-wider">
                    Group Insight • {groupInsights.agentCount} Agents
                  </Badge>
                  <CardTitle className="text-lg font-black text-slate-900 flex items-center gap-2">
                    <Users className="w-5 h-5 text-indigo-500" />
                    {groupInsights.groupType === "team" ? "Team" : "Office"} Insights: {groupInsights.groupName}
                  </CardTitle>
                </div>
                <div className="text-xs text-slate-400 font-medium font-mono bg-white px-3 py-1 rounded border border-slate-200/60 shadow-inner shrink-0 self-start md:self-auto">
                  {groupInsights.groupType === "team" ? "Team" : "Office"}: {groupInsights.groupName} • {groupInsights.agentCount} agents
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6 flex flex-col gap-6">

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Positive Signals */}
                <div className="space-y-3">
                  <h3 className="text-xs font-bold text-emerald-600 uppercase tracking-widest flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" /> Positive Signals
                  </h3>
                  <ul className="space-y-2.5">
                    {groupInsights.positives.map((p, idx) => (
                      <li key={idx} className="text-xs font-medium text-slate-600 bg-emerald-50/30 border border-emerald-50 rounded-lg p-3 leading-relaxed flex items-start gap-2">
                        <span className="text-emerald-500 font-bold shrink-0">✓</span>
                        <span>{p}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Gaps & Concerns */}
                <div className="space-y-3">
                  <h3 className="text-xs font-bold text-rose-600 uppercase tracking-widest flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-rose-500" /> Critical Concerns & Gaps
                  </h3>
                  <ul className="space-y-2.5">
                    {groupInsights.negatives.length > 0 ? groupInsights.negatives.map((n, idx) => (
                      <li key={idx} className="text-xs font-medium text-slate-600 bg-rose-50/30 border border-rose-50 rounded-lg p-3 leading-relaxed flex items-start gap-2">
                        <span className="text-rose-500 font-bold shrink-0">⚠️</span>
                        <span>{n}</span>
                      </li>
                    )) : (
                      <li className="text-xs font-medium text-slate-400 italic p-3">No critical concerns identified.</li>
                    )}
                  </ul>
                </div>
              </div>

              {/* Recommendations */}
              <div className="border-t border-slate-100 pt-5 space-y-3">
                <h3 className="text-xs font-bold text-indigo-600 uppercase tracking-widest flex items-center gap-1.5">
                  💡 Manager Action Items
                </h3>
                <ul className="space-y-2">
                  {groupInsights.recommendations.map((r, idx) => (
                    <li key={idx} className="text-xs font-semibold text-slate-700 bg-indigo-50/20 border border-indigo-50/50 rounded-lg p-3 leading-relaxed flex items-start gap-2.5">
                      <span className="text-indigo-500 shrink-0 mt-0.5">🔹</span>
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              </div>

            </CardContent>
          </Card>
        </section>
      )}

    </main>
    </PageGuard>
  );
}

// Subcomponents

function KPICard({ title, value, description, icon, color }: { title: string; value: string; description: string; icon: React.ReactNode; color: string }) {
  const bgHeaderMap: Record<string, string> = {
    emerald: "bg-emerald-50/60 text-emerald-900 border-emerald-100/50 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/30",
    blue: "bg-blue-50/60 text-blue-900 border-blue-100/50 dark:bg-blue-950/20 dark:text-blue-400 dark:border-blue-900/30",
    amber: "bg-amber-50/60 text-amber-900 border-amber-100/50 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900/30",
    violet: "bg-violet-50/60 text-violet-900 border-violet-100/50 dark:bg-violet-950/20 dark:text-violet-400 dark:border-violet-900/30"
  };

  const bgGradientMap: Record<string, string> = {
    emerald: "from-emerald-50/40 to-emerald-100/10 dark:from-emerald-950/20 dark:to-emerald-950/5",
    blue: "from-blue-50/40 to-blue-100/10 dark:from-blue-950/20 dark:to-blue-950/5",
    amber: "from-amber-50/40 to-amber-100/10 dark:from-amber-950/20 dark:to-amber-950/5",
    violet: "from-violet-50/40 to-violet-100/10 dark:from-violet-950/20 dark:to-violet-950/5"
  };

  return (
    <Card className="overflow-hidden shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 border border-slate-200/80 flex flex-col h-full bg-white">
      <div className={`px-4 py-2.5 border-b text-[10px] font-bold uppercase tracking-wider ${bgHeaderMap[color] || "bg-slate-50 text-slate-800"}`}>
        {title}
      </div>
      <CardContent className={`p-4 flex-1 flex flex-col justify-between bg-gradient-to-br ${bgGradientMap[color] || "from-slate-50/50 to-slate-100/10"}`}>
        <div className="flex justify-between items-end gap-2 mt-1">
          <h3 className="text-2xl lg:text-3xl font-black text-slate-900 dark:text-slate-100 font-mono tracking-tight truncate leading-none">{value}</h3>
          <div className="bg-slate-50 dark:bg-slate-900 p-1.5 rounded-lg border border-slate-100 dark:border-slate-800 shadow-inner -mt-1 shrink-0">{icon}</div>
        </div>
        <p className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold mt-3">{description}</p>
      </CardContent>
    </Card>
  );
}

function LeaderboardCard({
  title,
  data,
  metricKey,
  isCurrency = false,
  isDuration = false,
  color
}: {
  title: string;
  data: any[];
  metricKey: string;
  isCurrency?: boolean;
  isDuration?: boolean;
  color: string;
}) {
  const bgHeaderMap: Record<string, string> = {
    emerald: "bg-emerald-50/60 text-emerald-900 border-emerald-100/50 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/30",
    blue: "bg-blue-50/60 text-blue-900 border-blue-100/50 dark:bg-blue-950/20 dark:text-blue-400 dark:border-blue-900/30",
    amber: "bg-amber-50/60 text-amber-900 border-amber-100/50 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900/30",
    violet: "bg-violet-50/60 text-violet-900 border-violet-100/50 dark:bg-violet-950/20 dark:text-violet-400 dark:border-violet-900/30",
    pink: "bg-pink-50/60 text-pink-900 border-pink-100/50 dark:bg-pink-950/20 dark:text-pink-400 dark:border-pink-900/30"
  };

  const textValColorMap: Record<string, string> = {
    emerald: "text-emerald-600 dark:text-emerald-400",
    blue: "text-blue-600 dark:text-blue-400",
    amber: "text-amber-600 dark:text-amber-400",
    violet: "text-violet-600 dark:text-violet-400",
    pink: "text-pink-600 dark:text-pink-400"
  };

  const medals = ["🥇", "🥈", "🥉"];

  return (
    <Card className="bg-white border-slate-200/80 shadow-sm overflow-hidden flex flex-col h-full hover:shadow transition-shadow">
      <div className={`px-4 py-3 border-b text-xs font-bold uppercase tracking-widest ${bgHeaderMap[color] || "bg-slate-50 text-slate-800"}`}>
        {title}
      </div>
      <div className="divide-y divide-slate-100 dark:divide-slate-800 flex-1 flex flex-col justify-between">
        {data.length > 0 ? (
          data.map((agent, i) => (
            <div key={agent.id} className="p-3.5 flex items-center justify-between hover:bg-slate-50/80 dark:hover:bg-slate-900/10 transition-colors gap-2 flex-1">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-base w-5 text-center shrink-0">{medals[i] || `${i + 1}.`}</span>
                <div className="min-w-0">
                  <Link href={`/reports/agent/${agent.id}`} className="font-bold text-slate-700 dark:text-slate-350 hover:text-blue-600 dark:hover:text-blue-400 transition-colors text-xs truncate block">
                    {agent.name}
                  </Link>
                  <p className="text-[9px] text-slate-400 dark:text-slate-500 font-medium truncate">{agent.office} • {agent.team}</p>
                </div>
              </div>
              <div className="text-right shrink-0">
                <span className={`text-sm font-black font-mono ${textValColorMap[color] || "text-slate-800 dark:text-slate-100"}`}>
                  {isCurrency
                    ? `$${Math.round(agent[metricKey]).toLocaleString()}`
                    : isDuration
                    ? formatSeconds(agent[metricKey])
                    : agent[metricKey].toLocaleString()}
                </span>
              </div>
            </div>
          ))
        ) : (
          <div className="p-8 text-center text-xs text-slate-400 italic">No data</div>
        )}
      </div>
    </Card>
  );
}

function NavCard({ title, desc, href }: { title: string; desc: string; href: string }) {
  return (
    <Link href={href} className="block group h-full">
      <Card className="h-full border border-slate-200 hover:border-indigo-400 hover:shadow-md transition-all cursor-pointer bg-white">
        <CardContent className="p-4 flex flex-col h-full justify-between gap-4">
          <div>
            <h3 className="font-bold text-slate-800 group-hover:text-indigo-700 transition-colors text-sm">{title}</h3>
            <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">{desc}</p>
          </div>
          <div className="flex items-center text-xs font-semibold text-indigo-600 group-hover:translate-x-1 transition-transform">
            Go to module <ArrowRight className="w-3.5 h-3.5 ml-1" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
