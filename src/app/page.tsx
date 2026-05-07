"use client";

import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ArrowRight, Activity, TrendingUp, CalendarDays, Trophy } from "lucide-react";
import Link from "next/link";
import { formatValue } from "@/lib/formatters";

export default function Home() {
  const [stats, setStats] = useState({ agents: 0, calls: 0, premium: 0 });
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
        while (true) {
          const { data, error } = await supabase
            .from("daily_metrics")
            .select("*, agents(id, name, office, team)")
            .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
          if (error) throw error;
          if (!data || data.length === 0) break;
          allMetrics = allMetrics.concat(data);
          if (data.length < PAGE_SIZE) break;
          page++;
        }
        
        let totalCalls = 0;
        let totalPremium = 0;
        
        allMetrics.forEach(m => {
          totalCalls += m.calls || 0;
          totalPremium += parseFloat(m.prem_premium || 0);
        });

        setStats({
          agents: agents?.length || 0,
          calls: totalCalls,
          premium: totalPremium
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
        };
      }
      agg[id].items += m.items || 0;
      agg[id].prem_premium += parseFloat(m.prem_premium || 0);
    });
    return Object.values(agg);
  }, [metrics]);

  const topPremiumYTD = [...aggregatedYTD].sort((a: any, b: any) => b.prem_premium - a.prem_premium)[0];
  const topItemsYTD = [...aggregatedYTD].sort((a: any, b: any) => b.items - a.items)[0];

  return (
    <main className="p-8 max-w-7xl mx-auto min-h-screen flex flex-col gap-8">
      <div className="bg-amber-100 text-amber-800 p-3 text-center text-sm font-medium rounded-md shadow-sm border border-amber-200">
        🚧 Under Construction; message Charlie with requests
      </div>
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-purple-600">
            Overview
          </h1>
          <p className="text-slate-500 mt-2 text-lg">
            Welcome to the Alsop Reports Command Center.
          </p>
        </div>
      </header>

      {/* Stats Overview */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard title="Total Agents" value={loading ? "..." : stats.agents.toString()} icon={<Activity />} />
        <StatCard title="Total Calls Logged" value={loading ? "..." : stats.calls.toLocaleString()} icon={<CalendarDays />} />
        <StatCard title="Total Premium Logged" value={loading ? "..." : `$${stats.premium.toLocaleString()}`} icon={<TrendingUp />} />
      </section>

      {/* YTD Leaders */}
      {!loading && (topPremiumYTD || topItemsYTD) && (
        <section>
          <h2 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-500" /> YTD Agency Leaders
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {topPremiumYTD && (
              <Card className="bg-white border-emerald-200 shadow-sm">
                <CardContent className="p-6 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wider mb-1">
                      Highest Premium (YTD)
                    </p>
                    <Link href={`/reports/agent/${topPremiumYTD.id}`} className="text-xl font-bold text-slate-900 hover:text-emerald-600 transition-colors">
                      {topPremiumYTD.name}
                    </Link>
                    <p className="text-xs text-slate-500 mt-1">{topPremiumYTD.office} • {topPremiumYTD.team}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-2xl font-black text-emerald-600">
                      {formatValue(
                        topPremiumYTD.prem_premium.toFixed(2), 
                        "$", 
                        "", 
                        goals.find(g => g.metric_name === 'prem_premium' && (!g.office || g.office === topPremiumYTD.office) && (!g.team || g.team === topPremiumYTD.team))
                      )}
                    </span>
                  </div>
                </CardContent>
              </Card>
            )}
            {topItemsYTD && (
              <Card className="bg-white border-blue-200 shadow-sm">
                <CardContent className="p-6 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-1">
                      Most Items Sold (YTD)
                    </p>
                    <Link href={`/reports/agent/${topItemsYTD.id}`} className="text-xl font-bold text-slate-900 hover:text-blue-600 transition-colors">
                      {topItemsYTD.name}
                    </Link>
                    <p className="text-xs text-slate-500 mt-1">{topItemsYTD.office} • {topItemsYTD.team}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-2xl font-black text-blue-600">
                      {formatValue(
                        topItemsYTD.items, 
                        "", 
                        " Items", 
                        goals.find(g => g.metric_name === 'items' && (!g.office || g.office === topItemsYTD.office) && (!g.team || g.team === topItemsYTD.team))
                      )}
                    </span>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </section>
      )}

      {/* Navigation Cards */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
        <NavCard 
          title="Daily Standup" 
          desc="View the detailed daily breakdown of all agent activities." 
          href="/reports/daily" 
        />
        <NavCard 
          title="MTD Performance" 
          desc="Analyze month-to-date trends, close rates, and new business." 
          href="/reports/mtd" 
        />
        <NavCard 
          title="Weekly Report" 
          desc="Aggregated performance for the current week." 
          href="/reports/weekly" 
        />
        <NavCard 
          title="Communication Hub" 
          desc="Agency announcements and messaging." 
          href="/communication" 
        />
      </section>
    </main>
  );
}

function StatCard({ title, value, icon }: { title: string, value: string, icon: React.ReactNode }) {
  return (
    <Card className="p-6 flex flex-col gap-4">
      <div className="flex justify-between items-start">
        <span className="text-slate-500 font-medium text-sm">{title}</span>
        <span className="text-blue-600 bg-blue-50 p-2 rounded-lg">{icon}</span>
      </div>
      <div>
        <h3 className="text-3xl font-bold text-slate-900">{value}</h3>
      </div>
    </Card>
  );
}

function NavCard({ title, desc, href }: { title: string, desc: string, href: string }) {
  return (
    <Card className="group hover:border-blue-300 transition-colors">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-slate-500 mb-6">{desc}</p>
        <Link href={href}>
          <Button variant="outline" className="w-full group-hover:bg-blue-600 group-hover:text-white group-hover:border-blue-600">
            View Module
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  )
}
