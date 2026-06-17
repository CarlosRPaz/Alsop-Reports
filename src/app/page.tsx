"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
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
  AlertTriangle,
  CheckCircle,
  Flame,
  Plus,
  Trash2,
  Clock,
  Building2,
  Bookmark
} from "lucide-react";
import Link from "next/link";
import { TrendChart } from "@/components/charts/TrendChart";
import { OfficeBreakdownChart } from "@/components/charts/OfficeBreakdownChart";

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

interface SavedView {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  preset?: string;
  isSystem: boolean;
}

const DEFAULT_SAVED_VIEWS: SavedView[] = [
  { id: "sys-ytd", name: "YTD Leaderboard", startDate: "", endDate: "", preset: "ytd", isSystem: true },
  { id: "sys-mtd", name: "Current Month Focus", startDate: "", endDate: "", preset: "mtd", isSystem: true },
  { id: "sys-yesterday", name: "Yesterday's Volume", startDate: "", endDate: "", preset: "yesterday", isSystem: true },
  { id: "sys-lastweek", name: "Last Week Summary", startDate: "", endDate: "", preset: "last_week", isSystem: true },
  { id: "sys-lastmonth", name: "Last Month Results", startDate: "", endDate: "", preset: "last_month", isSystem: true },
];

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
  const [activePreset, setActivePreset] = useState<string>("ytd");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  
  // Custom Date range pickers
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd] = useState<string>("");

  const [stats, setStats] = useState({
    agents: 0,
    calls: 0,
    outbound: 0,
    talkTime: 0,
    premium: 0,
    items: 0,
    quotes: 0
  });
  
  const [metrics, setMetrics] = useState<any[]>([]);
  const [goals, setGoals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Saved Views State
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [newViewName, setNewViewName] = useState("");

  // Chart toggles
  const [chartMetric, setChartMetric] = useState<"production" | "activity" | "conversions">("production");
  const [officeMetric, setOfficeMetric] = useState<"premium" | "items" | "quotes" | "outbound">("premium");

  // Initial Range Set
  useEffect(() => {
    const range = getDateRange("ytd");
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
    const today = new Date();
    const todayStr = toLocalDateStr(today);
    
    // Resolve dynamic dates for system views
    const resolvedSystemViews = DEFAULT_SAVED_VIEWS.map(v => {
      if (v.preset) {
        const r = getDateRange(v.preset);
        return { ...v, startDate: r.start, endDate: r.end };
      }
      return v;
    });

    const stored = localStorage.getItem("dsr_dashboard_saved_views");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setSavedViews([...resolvedSystemViews, ...parsed]);
      } catch (e) {
        setSavedViews(resolvedSystemViews);
      }
    } else {
      setSavedViews(resolvedSystemViews);
    }
  }, []);

  // Fetch metrics when date range changes
  const fetchOverview = useCallback(async (start: string, end: string) => {
    setLoading(true);
    try {
      // 1. Fetch KPI goals
      const { data: goalsData } = await supabase.from("kpi_goals").select("*");
      setGoals(goalsData || []);

      // 2. Fetch active + report visible agents count
      const { data: activeAgents } = await supabase
        .from("agents")
        .select("id", { count: "exact" })
        .eq("active", true)
        .eq("report_visible", true);

      // 3. Paginate to get ALL daily_metrics in the date range for active + visible agents
      let allMetrics: any[] = [];
      let page = 0;
      const PAGE_SIZE = 1000;

      while (true) {
        const { data, error } = await supabase
          .from("daily_metrics")
          .select("*, agents!inner(id, name, office, team, active, report_visible)")
          .gte("report_date", start)
          .lte("report_date", end)
          .eq("agents.active", true)
          .eq("agents.report_visible", true)
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
        
        if (error) throw error;
        if (!data || data.length === 0) break;
        allMetrics = allMetrics.concat(data);
        if (data.length < PAGE_SIZE) break;
        page++;
      }

      let totalCalls = 0;
      let totalOutbound = 0;
      let totalTalkTime = 0;
      let totalPremium = 0;
      let totalItems = 0;
      let totalQuotes = 0;

      allMetrics.forEach(m => {
        totalCalls += m.calls || 0;
        totalOutbound += m.outbound || 0;
        totalTalkTime += m.talk_time_seconds || 0;
        totalPremium += parseFloat(m.prem_premium || 0);
        totalItems += m.items || 0;
        totalQuotes += m.quotes || 0;
      });

      setStats({
        agents: activeAgents?.length || 0,
        calls: totalCalls,
        outbound: totalOutbound,
        talkTime: totalTalkTime,
        premium: totalPremium,
        items: totalItems,
        quotes: totalQuotes
      });

      setMetrics(allMetrics);
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

  const handleSaveView = () => {
    if (!newViewName.trim()) return;

    const newView: SavedView = {
      id: "usr-" + Date.now(),
      name: newViewName.trim(),
      startDate,
      endDate,
      isSystem: false
    };

    const currentCustoms = savedViews.filter(v => !v.isSystem);
    const updatedCustoms = [...currentCustoms, newView];
    
    localStorage.setItem("dsr_dashboard_saved_views", JSON.stringify(updatedCustoms));
    
    // Rebuild active list with refreshed system views
    const today = new Date();
    const resolvedSystemViews = DEFAULT_SAVED_VIEWS.map(v => {
      if (v.preset) {
        const r = getDateRange(v.preset);
        return { ...v, startDate: r.start, endDate: r.end };
      }
      return v;
    });

    setSavedViews([...resolvedSystemViews, ...updatedCustoms]);
    setNewViewName("");
    setShowSaveModal(false);
  };

  const handleDeleteView = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const currentCustoms = savedViews.filter(v => !v.isSystem);
    const updatedCustoms = currentCustoms.filter(v => v.id !== id);
    
    localStorage.setItem("dsr_dashboard_saved_views", JSON.stringify(updatedCustoms));
    
    const today = new Date();
    const resolvedSystemViews = DEFAULT_SAVED_VIEWS.map(v => {
      if (v.preset) {
        const r = getDateRange(v.preset);
        return { ...v, startDate: r.start, endDate: r.end };
      }
      return v;
    });

    setSavedViews([...resolvedSystemViews, ...updatedCustoms]);
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
    
    metrics.forEach(m => {
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
  }, [metrics]);

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
    if (metrics.length === 0) return 0;
    const hits = metrics.filter(m => (m.quotes || 0) >= 4).length;
    return (hits / metrics.length) * 100;
  }, [metrics]);

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

      const target = Number(g.target_value);
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
    if (metrics.length === 0 || !startDate || !endDate) return [];

    const diffDays = Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 3600 * 24)) + 1;

    if (diffDays <= 31) {
      // Daily aggregation
      const agg: Record<string, any> = {};
      metrics.forEach(m => {
        const key = m.report_date;
        if (!key) return;
        if (!agg[key]) {
          agg[key] = { label: key.substring(5), premium: 0, items: 0, outbound: 0, talkTime: 0, quotes: 0 };
        }
        agg[key].premium += parseFloat(m.prem_premium || 0);
        agg[key].items += m.items || 0;
        agg[key].outbound += m.outbound || 0;
        agg[key].talkTime += (m.talk_time_seconds || 0) / 3600; // hours
        agg[key].quotes += m.quotes || 0;
      });
      return Object.entries(agg)
        .map(([label, val]: any) => ({ label, ...val }))
        .sort((a, b) => a.label.localeCompare(b.label));
    } else if (diffDays <= 180) {
      // Weekly aggregation
      const agg: Record<string, any> = {};
      metrics.forEach(m => {
        if (!m.report_date) return;
        const dateObj = new Date(m.report_date + "T12:00:00");
        const day = dateObj.getDay();
        const diff = dateObj.getDate() - day + (day === 0 ? -6 : 1); // Monday
        const monday = new Date(dateObj.setDate(diff));
        const key = monday.toISOString().split("T")[0];

        if (!agg[key]) {
          agg[key] = { label: `Wk ${key.substring(5)}`, premium: 0, items: 0, outbound: 0, talkTime: 0, quotes: 0, _date: key };
        }
        agg[key].premium += parseFloat(m.prem_premium || 0);
        agg[key].items += m.items || 0;
        agg[key].outbound += m.outbound || 0;
        agg[key].talkTime += (m.talk_time_seconds || 0) / 3600;
        agg[key].quotes += m.quotes || 0;
      });
      return Object.values(agg).sort((a: any, b: any) => a._date.localeCompare(b._date));
    } else {
      // Monthly aggregation
      const agg: Record<string, any> = {};
      metrics.forEach(m => {
        if (!m.report_date) return;
        const dateObj = new Date(m.report_date + "T12:00:00");
        const monthIdx = dateObj.getMonth();
        const monthName = MONTH_NAMES[monthIdx];
        const year = dateObj.getFullYear();
        const key = `${year}-${String(monthIdx + 1).padStart(2, "0")}`;

        if (!agg[key]) {
          agg[key] = { label: `${monthName} ${year.toString().substring(2)}`, premium: 0, items: 0, outbound: 0, talkTime: 0, quotes: 0, _key: key };
        }
        agg[key].premium += parseFloat(m.prem_premium || 0);
        agg[key].items += m.items || 0;
        agg[key].outbound += m.outbound || 0;
        agg[key].talkTime += (m.talk_time_seconds || 0) / 3600;
        agg[key].quotes += m.quotes || 0;
      });
      return Object.values(agg).sort((a: any, b: any) => a._key.localeCompare(b._key));
    }
  }, [metrics, startDate, endDate]);

  // Office Comparison breakdown data
  const officeData = useMemo(() => {
    const agg: Record<string, { office: string; premium: number; items: number; quotes: number; outbound: number }> = {};
    
    // Initialize standard offices
    const STANDARD_OFFICES = ["MCM", "MB", "RC", "CH"];
    STANDARD_OFFICES.forEach(o => {
      agg[o] = { office: o, premium: 0, items: 0, quotes: 0, outbound: 0 };
    });

    metrics.forEach(m => {
      const office = m.agents?.office || "Other";
      if (!agg[office]) {
        agg[office] = { office, premium: 0, items: 0, quotes: 0, outbound: 0 };
      }
      agg[office].premium += parseFloat(m.prem_premium || 0);
      agg[office].items += m.items || 0;
      agg[office].quotes += m.quotes || 0;
      agg[office].outbound += m.outbound || 0;
    });

    return Object.values(agg);
  }, [metrics]);

  // Aggregate Top Agents for the selected timeframe
  const aggregatedAgents = useMemo(() => {
    const agg: Record<string, any> = {};
    metrics.forEach(m => {
      const id = m.agent_id;
      if (!id || !m.agents) return;
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
      agg[id].items += m.items || 0;
      agg[id].quotes += m.quotes || 0;
      agg[id].outbound += m.outbound || 0;
      agg[id].talkTime += m.talk_time_seconds || 0;
    });
    return Object.values(agg);
  }, [metrics]);

  const topPremium = useMemo(() => [...aggregatedAgents].sort((a, b) => b.premium - a.premium).slice(0, 3), [aggregatedAgents]);
  const topItems = useMemo(() => [...aggregatedAgents].sort((a, b) => b.items - a.items).slice(0, 3), [aggregatedAgents]);
  const topQuotes = useMemo(() => [...aggregatedAgents].sort((a, b) => b.quotes - a.quotes).slice(0, 3), [aggregatedAgents]);
  const topOutbound = useMemo(() => [...aggregatedAgents].sort((a, b) => b.outbound - a.outbound).slice(0, 3), [aggregatedAgents]);
  const topTalkTime = useMemo(() => [...aggregatedAgents].sort((a, b) => b.talkTime - a.talkTime).slice(0, 3), [aggregatedAgents]);

  const isCurrentViewSaved = useMemo(() => {
    return savedViews.some(v => !v.isSystem && v.startDate === startDate && v.endDate === endDate);
  }, [savedViews, startDate, endDate]);

  return (
    <main className="p-8 max-w-7xl mx-auto min-h-screen flex flex-col gap-8 text-slate-800">
      
      {/* Premium Header */}
      <header className="flex flex-col gap-6 bg-slate-900 text-white p-8 rounded-2xl shadow-xl relative overflow-hidden border border-slate-800 shrink-0">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 relative z-10">
          <div>
            <Badge variant="success" className="mb-2.5 bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              Executive View
            </Badge>
            <h1 className="text-4xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-indigo-100 to-purple-200">
              Agency Overview Dashboard
            </h1>
            <p className="text-slate-400 mt-1.5 text-base font-medium">
              Performance analysis, manager insights, and multi-timeline data breakdowns.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 bg-slate-800/80 px-4 py-2.5 rounded-xl border border-slate-700 font-mono text-sm font-semibold">
              <CalendarDays className="w-4 h-4 text-indigo-400" />
              <span>{startDate}</span>
              <span className="text-slate-500">to</span>
              <span>{endDate}</span>
            </div>
            
            {!isCurrentViewSaved && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setShowSaveModal(true)} 
                className="bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700 hover:text-white h-[42px] px-4 rounded-xl flex items-center gap-2"
              >
                <Bookmark className="w-4 h-4 text-indigo-400" />
                Save View
              </Button>
            )}
          </div>
        </div>

        {/* Date Filter Bar */}
        <div className="flex flex-col gap-4 pt-4 border-t border-slate-800 relative z-10">
          {/* Preset Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2 bg-slate-800/40 p-1.5 rounded-xl border border-slate-800/80">
              {["yesterday", "last_week", "last_month", "mtd", "ytd"].map((preset) => (
                <button
                  key={preset}
                  onClick={() => setActivePreset(preset)}
                  className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${
                    activePreset === preset
                      ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-indigo-950"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                  }`}
                >
                  {preset.replace("_", " ")}
                </button>
              ))}
            </div>

            {/* Custom Picker Inputs */}
            <div className="flex flex-wrap items-center gap-2.5 bg-slate-800/20 p-2 rounded-xl border border-slate-800/60">
              <span className="text-xs font-bold text-slate-400 px-1 uppercase tracking-wider">Custom Range</span>
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="bg-slate-800 text-white border border-slate-700 rounded-lg px-2.5 py-1 text-sm font-mono focus:outline-none focus:border-indigo-500"
              />
              <span className="text-slate-500 font-mono text-sm">–</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="bg-slate-800 text-white border border-slate-700 rounded-lg px-2.5 py-1 text-sm font-mono focus:outline-none focus:border-indigo-500"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={handleApplyCustomDate}
                className="bg-slate-700 border-slate-600 text-white hover:bg-indigo-600 hover:border-indigo-500 h-8 text-xs font-bold"
              >
                Apply
              </Button>
            </div>
          </div>

          {/* Saved Views Pills */}
          {savedViews.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mr-2 flex items-center gap-1.5">
                <Bookmark className="w-3 h-3" /> Quick Views:
              </span>
              {savedViews.map((view) => {
                const isActive = (view.preset === activePreset && activePreset !== "custom") ||
                                 (activePreset === "custom" && view.startDate === startDate && view.endDate === endDate);
                return (
                  <div
                    key={view.id}
                    onClick={() => handleSelectView(view)}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
                      isActive
                        ? "bg-indigo-600/90 text-white border border-indigo-500 shadow-sm"
                        : "bg-slate-800/50 text-slate-300 border border-slate-800 hover:bg-slate-800 hover:text-white"
                    }`}
                  >
                    <span>{view.name}</span>
                    {!view.isSystem && (
                      <button
                        onClick={(e) => handleDeleteView(view.id, e)}
                        className="text-slate-400 hover:text-red-400 transition-colors p-0.5 rounded"
                        title="Delete view"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </header>

      {/* Save View Modal Backdrop/Overlay */}
      {showSaveModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <Card className="max-w-md w-full border border-slate-200 shadow-2xl bg-white animate-in zoom-in-95 duration-150">
            <CardHeader className="pb-4">
              <CardTitle className="text-xl font-black flex items-center gap-2 text-slate-900">
                <Bookmark className="w-5 h-5 text-indigo-600" /> Save Current View
              </CardTitle>
              <CardDescription>
                Create a quick shortcut for the active date range ({startDate} to {endDate}).
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

      {/* Main KPI Row */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
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

      {/* Office Manager Insights Panel */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Call Center Alerts (Outbound / Talk Time) - 7 Columns */}
        <Card className="lg:col-span-7 border-slate-200/80 shadow-sm flex flex-col h-full bg-white relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 bg-amber-500 h-full" />
          <CardHeader className="pb-3 bg-slate-50/50 border-b border-slate-100 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                <AlertTriangle className="w-4.5 h-4.5 text-amber-500" /> Office Manager Action Panel
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Targeting agents requiring outbound volume or talk-time corrections.
              </CardDescription>
            </div>
            <Badge variant="outline" className="font-bold border-slate-200">
              Active Focus
            </Badge>
          </CardHeader>
          <CardContent className="p-6 flex-1 flex flex-col gap-6">
            
            {/* Low Outbound Alert Widget */}
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  Low Outbound Activity (<span className="text-amber-600">&lt; 20/day avg</span>)
                </span>
                <Badge variant={lowOutboundAlerts.length > 0 ? "warning" : "success"} className="text-[10px] font-bold">
                  {lowOutboundAlerts.length} Flagged
                </Badge>
              </div>

              {loading ? (
                <div className="h-16 flex items-center justify-center text-xs text-slate-400 font-medium bg-slate-50 border border-slate-100 rounded-lg">Loading...</div>
              ) : lowOutboundAlerts.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-1">
                  {lowOutboundAlerts.map(a => (
                    <div key={a.id} className="flex items-center justify-between p-2.5 rounded-xl border border-amber-100 bg-amber-50/40 text-xs hover:bg-amber-50 transition-colors">
                      <div className="flex flex-col">
                        <span className="font-bold text-slate-800">{a.name}</span>
                        <span className="text-[10px] text-slate-500 font-medium">{a.office} • {a.team}</span>
                      </div>
                      <div className="text-right flex flex-col items-end">
                        <span className="font-black text-amber-700 font-mono text-sm">{a.avgOutbound.toFixed(1)}</span>
                        <span className="text-[9px] text-slate-500 font-medium">dials/day ({a.totalOutbound} total)</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-2.5 p-3.5 rounded-xl border border-emerald-100 bg-emerald-50/20 text-xs text-emerald-800 font-semibold shadow-sm">
                  <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>Outbound calling volume meets targets for all active agents!</span>
                </div>
              )}
            </div>

            {/* Low Talk Time Alert Widget */}
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  Low Daily Talk Time (<span className="text-red-600">&lt; 60m avg</span>)
                </span>
                <Badge variant={lowTalkTimeAlerts.length > 0 ? "danger" : "success"} className="text-[10px] font-bold">
                  {lowTalkTimeAlerts.length} Flagged
                </Badge>
              </div>

              {loading ? (
                <div className="h-16 flex items-center justify-center text-xs text-slate-400 font-medium bg-slate-50 border border-slate-100 rounded-lg">Loading...</div>
              ) : lowTalkTimeAlerts.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-1">
                  {lowTalkTimeAlerts.map(a => (
                    <div key={a.id} className="flex items-center justify-between p-2.5 rounded-xl border border-red-100 bg-red-50/40 text-xs hover:bg-red-50 transition-colors">
                      <div className="flex flex-col">
                        <span className="font-bold text-slate-800">{a.name}</span>
                        <span className="text-[10px] text-slate-500 font-medium">{a.office} • {a.team}</span>
                      </div>
                      <div className="text-right flex flex-col items-end">
                        <span className="font-black text-red-700 font-mono text-sm">{Math.round(a.avgTalkTimeMinutes)}m</span>
                        <span className="text-[9px] text-slate-500 font-medium">avg/day ({formatSeconds(a.totalTalkTime)} total)</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-2.5 p-3.5 rounded-xl border border-emerald-100 bg-emerald-50/20 text-xs text-emerald-800 font-semibold shadow-sm">
                  <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>Talk time duration meets targets for all active agents!</span>
                </div>
              )}
            </div>

          </CardContent>
        </Card>

        {/* Goals Pacing & Quote Consistency Widget - 5 Columns */}
        <Card className="lg:col-span-5 border-slate-200/80 shadow-sm flex flex-col h-full bg-white relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 bg-indigo-600 h-full" />
          <CardHeader className="pb-3 bg-slate-50/50 border-b border-slate-100 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Flame className="w-4.5 h-4.5 text-indigo-500" /> Production & Quote Pace
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Tracking goal attainment for active date range timeframe.
              </CardDescription>
            </div>
            <Clock className="w-4 h-4 text-slate-400" />
          </CardHeader>
          <CardContent className="p-6 flex-1 flex flex-col gap-6">
            
            {/* Quote consistency Hit rate */}
            <div className="flex flex-col gap-2 bg-gradient-to-r from-amber-50/20 to-orange-50/20 border border-amber-100/70 p-4 rounded-xl">
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-slate-600 uppercase tracking-wider">Quote Goal Hit Rate</span>
                <span className="font-black text-amber-700 font-mono text-base">{quotesGoalHitRate.toFixed(1)}%</span>
              </div>
              <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden mt-1 shadow-inner">
                <div 
                  className="bg-gradient-to-r from-amber-500 to-orange-500 h-full rounded-full transition-all duration-500"
                  style={{ width: `${quotesGoalHitRate}%` }}
                />
              </div>
              <p className="text-[10px] text-slate-500 font-semibold leading-relaxed mt-1">
                Target: 4+ quotes daily per agent. Measures consistency across all agent working days in active range.
              </p>
            </div>

            {/* Timeframe pacing goals */}
            <div className="flex flex-col gap-4">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                Target Goal Attainment ({activePreset.toUpperCase()})
              </span>
              
              {loading ? (
                <div className="h-16 flex items-center justify-center text-xs text-slate-400 bg-slate-50 border border-slate-100 rounded-lg">Loading...</div>
              ) : pacingGoals.length > 0 ? (
                <div className="flex flex-col gap-3.5">
                  {pacingGoals.map(g => (
                    <div key={g.id} className="flex flex-col gap-1.5">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-bold text-slate-700">{g.label} Pacing</span>
                        <span className="font-mono font-bold text-indigo-600">
                          {g.metric.includes("premium") ? `$${Math.round(g.current).toLocaleString()}` : g.current.toLocaleString()} /{" "}
                          {g.metric.includes("premium") ? `$${Math.round(g.target).toLocaleString()}` : g.target.toLocaleString()}{" "}
                          ({g.percent}%)
                        </span>
                      </div>
                      <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden border border-slate-200/50">
                        <div
                          className="bg-indigo-600 h-full rounded-full transition-all duration-500"
                          style={{ width: `${g.percent}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-slate-400 font-medium italic p-3 text-center border border-dashed border-slate-200 bg-slate-50 rounded-xl">
                  No active goals defined in the database for the '{activePreset}' timeframe.
                </div>
              )}
            </div>

          </CardContent>
        </Card>
      </section>

      {/* Analyst Visual Dashboards */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Trend Chart (2/3 columns) */}
        <div className="lg:col-span-2 flex flex-col gap-2.5">
          <div className="flex justify-between items-center px-1">
            <span className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-500" /> Adaptive Timeline Trends
            </span>
            {/* Metric select control */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200">
              <button
                onClick={() => setChartMetric("production")}
                className={`px-3 py-1 rounded text-xs font-bold transition-all ${
                  chartMetric === "production" ? "bg-white text-blue-600 shadow-sm border border-slate-200" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                Production
              </button>
              <button
                onClick={() => setChartMetric("activity")}
                className={`px-3 py-1 rounded text-xs font-bold transition-all ${
                  chartMetric === "activity" ? "bg-white text-blue-600 shadow-sm border border-slate-200" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                Call Center
              </button>
              <button
                onClick={() => setChartMetric("conversions")}
                className={`px-3 py-1 rounded text-xs font-bold transition-all ${
                  chartMetric === "conversions" ? "bg-white text-blue-600 shadow-sm border border-slate-200" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                Conversions
              </button>
            </div>
          </div>

          {loading ? (
            <Card className="h-[350px] flex items-center justify-center text-slate-400">Loading chart...</Card>
          ) : (
            <div className="h-[350px]">
              {chartMetric === "production" && (
                <TrendChart
                  title="Items & Written Premium Trends"
                  data={aggregatedTrendData}
                  xAxisKey="label"
                  lines={[
                    { key: "premium", name: "Premium ($)", color: "#10b981" },
                    { key: "items", name: "Items Written", color: "#3b82f6" }
                  ]}
                />
              )}
              {chartMetric === "activity" && (
                <TrendChart
                  title="Dials Velocity & Average Talk Duration"
                  data={aggregatedTrendData}
                  xAxisKey="label"
                  lines={[
                    { key: "outbound", name: "Outbound Calls", color: "#8b5cf6" },
                    { key: "talkTime", name: "Talk Time (Hrs)", color: "#ec4899" }
                  ]}
                />
              )}
              {chartMetric === "conversions" && (
                <TrendChart
                  title="Quotes Volume & Items Conversion"
                  data={aggregatedTrendData}
                  xAxisKey="label"
                  lines={[
                    { key: "quotes", name: "Total Quotes", color: "#f59e0b" },
                    { key: "items", name: "Items Written", color: "#3b82f6" }
                  ]}
                />
              )}
            </div>
          )}
        </div>

        {/* Office Comparison Chart (1/3 column) */}
        <div className="lg:col-span-1 flex flex-col gap-2.5">
          <div className="flex justify-between items-center px-1">
            <span className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-emerald-500" /> Office Comparisons
            </span>
            {/* Metric select control */}
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
        </div>
      </section>

      {/* Leaderboard Lists */}
      {!loading && aggregatedAgents.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="text-xl font-bold text-slate-900 mb-1 flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-500" /> Agency Top Performers ({startDate} to {endDate})
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6">
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

      {/* Module Access Navigation Cards */}
      <section className="mt-4">
        <h2 className="text-xl font-bold text-slate-900 mb-4">Module Access</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <NavCard title="Daily Standup" desc="Detailed daily breakdown of activities." href="/reports/daily" />
          <NavCard title="Weekly Report" desc="Aggregated performance for the week." href="/reports/weekly" />
          <NavCard title="MTD Performance" desc="Analyze month-to-date trends & pace." href="/reports/mtd" />
          <NavCard title="Communication" desc="Agency announcements & messaging." href="/communication" />
        </div>
      </section>

    </main>
  );
}

// Subcomponents

function KPICard({ title, value, description, icon, color }: { title: string; value: string; description: string; icon: React.ReactNode; color: string }) {
  const borderMap: Record<string, string> = {
    emerald: "border-emerald-500",
    blue: "border-blue-500",
    amber: "border-amber-500",
    violet: "border-violet-500"
  };

  const bgGradientMap: Record<string, string> = {
    emerald: "from-emerald-50/40 to-emerald-100/10",
    blue: "from-blue-550/40 to-blue-100/10",
    amber: "from-amber-50/40 to-amber-100/10",
    violet: "from-violet-50/40 to-violet-100/10"
  };

  return (
    <Card className={`overflow-hidden shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 border-t-4 ${borderMap[color] || "border-slate-500"} bg-white`}>
      <CardContent className={`p-5 flex flex-col justify-between h-full bg-gradient-to-br ${bgGradientMap[color] || "from-slate-50/50 to-slate-100/10"}`}>
        <div className="flex justify-between items-start mb-2">
          <span className="text-slate-400 font-bold text-[10px] uppercase tracking-wider">{title}</span>
          <div className="bg-slate-50 p-1.5 rounded-lg border border-slate-100 shadow-inner">{icon}</div>
        </div>
        <div className="flex flex-col gap-1">
          <h3 className="text-2xl lg:text-3xl font-black text-slate-900 font-mono tracking-tight truncate">{value}</h3>
          <p className="text-[10px] text-slate-500 font-medium">{description}</p>
        </div>
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
    emerald: "bg-emerald-50/60 text-emerald-800 border-emerald-100/50",
    blue: "bg-blue-50/60 text-blue-800 border-blue-100/50",
    amber: "bg-amber-50/60 text-amber-800 border-amber-100/50",
    violet: "bg-violet-50/60 text-violet-800 border-violet-100/50",
    pink: "bg-pink-50/60 text-pink-800 border-pink-100/50"
  };

  const textValColorMap: Record<string, string> = {
    emerald: "text-emerald-600",
    blue: "text-blue-600",
    amber: "text-amber-600",
    violet: "text-violet-600",
    pink: "text-pink-600"
  };

  const medals = ["🥇", "🥈", "🥉"];

  return (
    <Card className="bg-white border-slate-200/80 shadow-sm overflow-hidden flex flex-col h-full hover:shadow transition-shadow">
      <div className={`px-4 py-3 border-b text-xs font-bold uppercase tracking-widest ${bgHeaderMap[color] || "bg-slate-50 text-slate-800"}`}>
        {title}
      </div>
      <div className="divide-y divide-slate-100 flex-1 flex flex-col justify-between">
        {data.length > 0 ? (
          data.map((agent, i) => (
            <div key={agent.id} className="p-3.5 flex items-center justify-between hover:bg-slate-50/80 transition-colors gap-2 flex-1">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-base w-5 text-center shrink-0">{medals[i] || `${i + 1}.`}</span>
                <div className="min-w-0">
                  <Link href={`/reports/agent/${agent.id}`} className="font-bold text-slate-700 hover:text-blue-600 transition-colors text-xs truncate block">
                    {agent.name}
                  </Link>
                  <p className="text-[9px] text-slate-400 font-medium truncate">{agent.office} • {agent.team}</p>
                </div>
              </div>
              <div className="text-right shrink-0">
                <span className={`text-sm font-black font-mono ${textValColorMap[color] || "text-slate-800"}`}>
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
