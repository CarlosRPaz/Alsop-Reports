"use client";

import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ArrowRight, Activity, TrendingUp, CalendarDays, Trophy, Package, PhoneCall, DollarSign, Quote } from "lucide-react";
import Link from "next/link";
import { formatValue } from "@/lib/formatters";
import { TrendChart } from "@/components/charts/TrendChart";
import { OfficeBreakdownChart } from "@/components/charts/OfficeBreakdownChart";

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function Home() {
  const [stats, setStats] = useState({ agents: 0, calls: 0, premium: 0, items: 0, quotes: 0 });
  const [metrics, setMetrics] = useState<any[]>([]);
  const [goals, setGoals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchOverview = async () => {
      try {
        const { data: goalsData } = await supabase.from("kpi_goals").select("*").eq("timeframe", "ytd");
        setGoals(goalsData || []);

        const { data: agents } = await supabase.from("agents").select("id", { count: "exact" });

        // Paginate to get ALL daily_metrics (Supabase caps at 1000 per request)
        let allMetrics: any[] = [];
        let page = 0;
        const PAGE_SIZE = 1000;
        const currentYearStr = new Date().getFullYear().toString();

        while (true) {
          const { data, error } = await supabase
            .from("daily_metrics")
            .select("*, agents(id, name, office, team)")
            .gte("report_date", `${currentYearStr}-01-01`)
            .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
          if (error) throw error;
          if (!data || data.length === 0) break;
          allMetrics = allMetrics.concat(data);
          if (data.length < PAGE_SIZE) break;
          page++;
        }
        
        let totalCalls = 0;
        let totalPremium = 0;
        let totalItems = 0;
        let totalQuotes = 0;
        
        allMetrics.forEach(m => {
          totalCalls += m.calls || 0;
          totalPremium += parseFloat(m.prem_premium || 0);
          totalItems += m.items || 0;
          totalQuotes += m.quotes || 0;
        });

        setStats({
          agents: agents?.length || 0,
          calls: totalCalls,
          premium: totalPremium,
          items: totalItems,
          quotes: totalQuotes
        });
        
        setMetrics(allMetrics);
      } catch (err) {
        console.error("Error fetching overview:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchOverview();
  }, []);

  // Aggregate by Month for Trend Chart
  const monthlyData = useMemo(() => {
    const agg: Record<string, { month: string; items: number; quotes: number }> = {};
    metrics.forEach(m => {
      if (!m.report_date) return;
      const dateObj = new Date(m.report_date);
      const monthIdx = dateObj.getMonth(); // 0-11
      const monthName = MONTH_NAMES[monthIdx];
      
      if (!agg[monthName]) {
        agg[monthName] = { month: monthName, items: 0, quotes: 0, _idx: monthIdx } as any;
      }
      agg[monthName].items += m.items || 0;
      agg[monthName].quotes += m.quotes || 0;
    });
    
    return Object.values(agg).sort((a: any, b: any) => a._idx - b._idx);
  }, [metrics]);

  // Aggregate by Office for Breakdown Chart
  const officeData = useMemo(() => {
    const agg: Record<string, { office: string; items: number; premium: number }> = {};
    metrics.forEach(m => {
      const office = m.agents?.office || "Other";
      if (!agg[office]) {
        agg[office] = { office, items: 0, premium: 0 };
      }
      agg[office].items += m.items || 0;
      agg[office].premium += parseFloat(m.prem_premium || 0);
    });
    return Object.values(agg).sort((a, b) => b.items - a.items);
  }, [metrics]);

  // Aggregate Top Agents YTD
  const aggregatedYTD = useMemo(() => {
    const agg: Record<string, any> = {};
    metrics.forEach(m => {
      const id = m.agents?.id;
      if (!id) return;
      if (!agg[id]) {
        agg[id] = {
          id: id,
          name: m.agents.name,
          team: m.agents.team,
          office: m.agents.office,
          items: 0,
          prem_premium: 0,
          quotes: 0
        };
      }
      agg[id].items += m.items || 0;
      agg[id].prem_premium += parseFloat(m.prem_premium || 0);
      agg[id].quotes += m.quotes || 0;
    });
    return Object.values(agg);
  }, [metrics]);

  const topPremiumYTD = [...aggregatedYTD].sort((a: any, b: any) => b.prem_premium - a.prem_premium).slice(0, 3);
  const topItemsYTD = [...aggregatedYTD].sort((a: any, b: any) => b.items - a.items).slice(0, 3);

  return (
    <main className="p-8 max-w-7xl mx-auto min-h-screen flex flex-col gap-8">
      <div className="bg-amber-50 text-amber-800 p-3 text-center text-sm font-medium rounded-md shadow-sm border border-amber-200 shrink-0 flex items-center justify-center gap-2">
        <span className="text-amber-500">🚧</span> Under Construction; message Charlie with requests
      </div>
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-purple-600">
            Overview Dashboard
          </h1>
          <p className="text-slate-500 mt-2 text-lg">
            High-level executive view of Year-to-Date performance.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-500 font-medium bg-slate-100 px-3 py-1.5 rounded-full border border-slate-200">
          <CalendarDays className="w-4 h-4 text-blue-500" />
          YTD {new Date().getFullYear()}
        </div>
      </header>

      {/* YTD KPIs Row */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
        <KPI 
          title="YTD Premium" 
          value={loading ? "..." : `$${Math.round(stats.premium).toLocaleString()}`} 
          icon={<DollarSign className="text-emerald-500" />} 
          color="emerald"
        />
        <KPI 
          title="YTD Items" 
          value={loading ? "..." : stats.items.toLocaleString()} 
          icon={<Package className="text-blue-500" />} 
          color="blue"
        />
        <KPI 
          title="YTD Quotes" 
          value={loading ? "..." : stats.quotes.toLocaleString()} 
          icon={<Quote className="text-amber-500" />} 
          color="amber"
        />
        <KPI 
          title="YTD Calls" 
          value={loading ? "..." : stats.calls.toLocaleString()} 
          icon={<PhoneCall className="text-violet-500" />} 
          color="violet"
        />
      </section>

      {/* Charts Row */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          {loading ? (
            <Card className="h-[350px] flex items-center justify-center text-slate-400">Loading chart...</Card>
          ) : (
            <div className="h-[350px]">
              <TrendChart 
                title="Production Trends (YTD)"
                data={monthlyData}
                xAxisKey="month"
                lines={[
                  { key: "items", name: "Items", color: "#3b82f6" },
                  { key: "quotes", name: "Quotes", color: "#f59e0b" }
                ]}
              />
            </div>
          )}
        </div>
        <div className="lg:col-span-1">
          {loading ? (
            <Card className="h-[350px] flex items-center justify-center text-slate-400">Loading chart...</Card>
          ) : (
            <div className="h-[350px]">
              <OfficeBreakdownChart 
                title="Office Breakdown (YTD)"
                data={officeData}
              />
            </div>
          )}
        </div>
      </section>

      {/* YTD Leaders */}
      {!loading && (topPremiumYTD.length > 0 || topItemsYTD.length > 0) && (
        <section>
          <h2 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-500" /> Agency Top Performers
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <LeaderboardList title="Top Premium (YTD)" data={topPremiumYTD} metricKey="prem_premium" isCurrency={true} color="emerald" />
            <LeaderboardList title="Most Items (YTD)" data={topItemsYTD} metricKey="items" isCurrency={false} color="blue" />
          </div>
        </section>
      )}

      {/* Navigation Cards */}
      <section>
        <h2 className="text-xl font-bold text-slate-900 mb-4 mt-4">Module Access</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <NavCard title="Daily Standup" desc="Detailed daily breakdown of activities." href="/reports/daily" />
          <NavCard title="MTD Performance" desc="Analyze month-to-date trends & pace." href="/reports/mtd" />
          <NavCard title="Weekly Report" desc="Aggregated performance for the week." href="/reports/weekly" />
          <NavCard title="Communication" desc="Agency announcements & messaging." href="/communication" />
        </div>
      </section>
    </main>
  );
}

function KPI({ title, value, icon, color }: { title: string, value: string, icon: React.ReactNode, color: string }) {
  const bgMap: Record<string, string> = { emerald: "bg-emerald-50", blue: "bg-blue-50", amber: "bg-amber-50", violet: "bg-violet-50" };
  const textMap: Record<string, string> = { emerald: "text-emerald-900", blue: "text-blue-900", amber: "text-amber-900", violet: "text-violet-900" };
  const borderMap: Record<string, string> = { emerald: "border-emerald-500", blue: "border-blue-500", amber: "border-amber-500", violet: "border-violet-500" };
  
  return (
    <Card className="overflow-hidden shadow-sm hover:shadow-md transition-shadow h-full">
      <CardContent className={`p-5 ${bgMap[color] || "bg-slate-50"} h-full flex flex-col justify-between border-b-4 ${borderMap[color] || "border-slate-500"}`}>
        <div className="flex justify-between items-start mb-2">
          <span className="text-slate-500 font-semibold text-xs uppercase tracking-wider">{title}</span>
          <div className="bg-white p-1.5 rounded shadow-sm border border-slate-100">{icon}</div>
        </div>
        <h3 className={`text-2xl lg:text-3xl font-black ${textMap[color] || "text-slate-900"} font-mono truncate`}>{value}</h3>
      </CardContent>
    </Card>
  );
}

function LeaderboardList({ title, data, metricKey, isCurrency, color }: { title: string, data: any[], metricKey: string, isCurrency: boolean, color: string }) {
  const colorMap: Record<string, string> = { emerald: "text-emerald-600 bg-emerald-50", blue: "text-blue-600 bg-blue-50" };
  const medals = ["🥇", "🥈", "🥉"];
  
  return (
    <Card className="bg-white border-slate-200 shadow-sm overflow-hidden">
      <div className={`p-4 border-b border-slate-100 ${color === 'emerald' ? 'bg-emerald-50/50' : 'bg-blue-50/50'}`}>
        <h3 className={`font-bold uppercase tracking-widest text-xs ${color === 'emerald' ? 'text-emerald-700' : 'text-blue-700'}`}>{title}</h3>
      </div>
      <div className="divide-y divide-slate-100">
        {data.map((agent, i) => (
          <div key={agent.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
            <div className="flex items-center gap-3">
              <span className="text-xl w-6 text-center">{medals[i] || `${i + 1}.`}</span>
              <div>
                <Link href={`/reports/agent/${agent.id}`} className="font-bold text-slate-800 hover:text-blue-600 transition-colors">
                  {agent.name}
                </Link>
                <p className="text-[11px] text-slate-500 font-medium">{agent.office} • {agent.team}</p>
              </div>
            </div>
            <div className="text-right">
              <span className={`text-lg font-black font-mono ${color === 'emerald' ? 'text-emerald-600' : 'text-blue-600'}`}>
                {isCurrency ? `$${Math.round(agent[metricKey]).toLocaleString()}` : agent[metricKey].toLocaleString()}
              </span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

function NavCard({ title, desc, href }: { title: string, desc: string, href: string }) {
  return (
    <Link href={href} className="block group h-full">
      <Card className="h-full border border-slate-200 hover:border-blue-400 hover:shadow-md transition-all cursor-pointer bg-white">
        <CardContent className="p-4 flex flex-col h-full justify-between gap-4">
          <div>
            <h3 className="font-bold text-slate-800 group-hover:text-blue-700 transition-colors">{title}</h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">{desc}</p>
          </div>
          <div className="flex items-center text-xs font-semibold text-blue-600 group-hover:translate-x-1 transition-transform">
            Go to module <ArrowRight className="w-3 h-3 ml-1" />
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
