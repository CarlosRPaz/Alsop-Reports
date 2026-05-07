"use client"

import { useEffect, useState, useMemo } from "react"
import { supabase } from "@/lib/supabaseClient"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { DataTable } from "@/components/ui/DataTable"
import { Badge } from "@/components/ui/Badge"
import { TrendChart } from "@/components/charts/TrendChart"
import { Button } from "@/components/ui/Button"
import { Download, Trophy, TrendingUp } from "lucide-react"
import { FilterBar, FilterState } from "@/components/ui/FilterBar"
import Link from "next/link"
import { formatValue } from "@/lib/formatters"

export default function MTDReport() {
  const [loading, setLoading] = useState(true)
  const [metrics, setMetrics] = useState<any[]>([])
  const [goals, setGoals] = useState<any[]>([])
  const [filters, setFilters] = useState<FilterState>({ offices: [], teams: [], agents: [], meetings: [] })
  
  // Dummy chart data representing aggregated MTD performance
  const chartData = [
    { date: 'Apr 1', closeRate: 12, newBusiness: 4000, quotes: 24 },
    { date: 'Apr 5', closeRate: 15, newBusiness: 5500, quotes: 30 },
    { date: 'Apr 10', closeRate: 14, newBusiness: 4800, quotes: 28 },
    { date: 'Apr 15', closeRate: 18, newBusiness: 7200, quotes: 35 },
    { date: 'Apr 17', closeRate: 22, newBusiness: 8900, quotes: 42 },
  ]

  useEffect(() => {
    const fetchMTD = async () => {
      try {
        // Current month boundaries
        const now = new Date()
        const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
        const nextMonth = now.getMonth() === 11
          ? `${now.getFullYear() + 1}-01-01`
          : `${now.getFullYear()}-${String(now.getMonth() + 2).padStart(2, '0')}-01`

        // Fetch ALL metrics for the current month (no limit)
        let allMetrics: any[] = []
        let page = 0
        const PAGE_SIZE = 1000
        while (true) {
          const { data, error } = await supabase
            .from("daily_metrics")
            .select("*, agents(id, name, team, office)")
            .gte("report_date", monthStart)
            .lt("report_date", nextMonth)
            .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
          if (error) throw error
          if (!data || data.length === 0) break
          allMetrics = allMetrics.concat(data)
          if (data.length < PAGE_SIZE) break
          page++
        }
        
        const { data: goalsData } = await supabase.from("kpi_goals").select("*").eq("timeframe", "monthly")
        setGoals(goalsData || [])

        setMetrics(allMetrics)
      } catch (err) {
        console.error("Error fetching MTD metrics:", err)
      } finally {
        setLoading(false)
      }
    }

    fetchMTD()
  }, [])

  const availableAgents = useMemo(() => {
    return metrics
      .map(m => m.agents)
      .filter(Boolean)
      .filter(a => {
        const matchOffice = filters.offices.length === 0 || filters.offices.includes(a.office);
        const matchTeam = filters.teams.length === 0 || filters.teams.includes(a.team);
        return matchOffice && matchTeam;
      })
      .map(a => a.name)
      .filter((v, i, a) => a.indexOf(v) === i)
      .sort();
  }, [metrics, filters]);

  const filteredMetrics = useMemo(() => {
    return metrics.filter(m => {
      const agent = m.agents || {};
      const matchOffice = filters.offices.length === 0 || filters.offices.includes(agent.office);
      const matchTeam = filters.teams.length === 0 || filters.teams.includes(agent.team);
      const matchAgent = filters.agents.length === 0 || filters.agents.includes(agent.name);
      return matchOffice && matchTeam && matchAgent;
    });
  }, [metrics, filters]);

  // Aggregate MTD per agent
  const aggregatedMTD = useMemo(() => {
    const agg: Record<string, any> = {};
    filteredMetrics.forEach(m => {
      const id = m.agents?.id;
      if (!id) return;
      if (!agg[id]) {
        agg[id] = {
          id: id,
          name: m.agents.name,
          team: m.agents.team,
          office: m.agents.office,
          quotes: 0,
          nb_count: 0,
          items: 0,
          prem_premium: 0,
        };
      }
      agg[id].quotes += m.quotes || 0;
      agg[id].nb_count += m.nb_count || 0;
      agg[id].items += m.items || 0;
      agg[id].prem_premium += parseFloat(m.prem_premium || 0);
    });
    return Object.values(agg).sort((a: any, b: any) => b.prem_premium - a.prem_premium);
  }, [filteredMetrics]);

  const topPremium = aggregatedMTD[0];
  const topQuotes = [...aggregatedMTD].sort((a: any, b: any) => b.quotes - a.quotes)[0];

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div className="bg-amber-100 text-amber-800 p-3 text-center text-sm font-medium rounded-md shadow-sm border border-amber-200">
        🚧 Under Construction; message Charlie with requests
      </div>
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">MTD Performance</h1>
          <p className="text-slate-500 mt-1">Month-To-Date aggregated reporting.</p>
        </div>
        <Button variant="outline">
          <Download className="w-4 h-4 mr-2" />
          Export CSV
        </Button>
      </header>

      <FilterBar onFilterChange={setFilters} availableAgents={availableAgents} />

      {/* Top Performers */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {topPremium && (
          <Card className="bg-white border-emerald-200 shadow-sm">
            <CardContent className="p-6 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-emerald-600 flex items-center gap-2 mb-1">
                  <Trophy className="w-4 h-4" /> Top Premium (MTD)
                </p>
                <Link href={`/reports/agent/${topPremium.id}`} className="text-2xl font-bold text-slate-900 hover:text-emerald-600 transition-colors">
                  {topPremium.name}
                </Link>
                <p className="text-sm text-slate-500 mt-1">{topPremium.office} • {topPremium.team}</p>
              </div>
              <div className="text-right">
                <span className="text-3xl font-black text-emerald-600">${topPremium.prem_premium.toFixed(2)}</span>
              </div>
            </CardContent>
          </Card>
        )}
        
        {topQuotes && (
          <Card className="bg-white border-purple-200 shadow-sm">
            <CardContent className="p-6 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-purple-600 flex items-center gap-2 mb-1">
                  <TrendingUp className="w-4 h-4" /> Most Quotes (MTD)
                </p>
                <Link href={`/reports/agent/${topQuotes.id}`} className="text-2xl font-bold text-slate-900 hover:text-purple-600 transition-colors">
                  {topQuotes.name}
                </Link>
                <p className="text-sm text-slate-500 mt-1">{topQuotes.office} • {topQuotes.team}</p>
              </div>
              <div className="text-right">
                <span className="text-3xl font-black text-purple-600">{topQuotes.quotes} Quotes</span>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        <TrendChart 
          title="New Business Premium ($)" 
          data={chartData} 
          dataKey="newBusiness" 
          color="#10b981" 
        />
        <TrendChart 
          title="Close Rate (%)" 
          data={chartData} 
          dataKey="closeRate" 
          color="#8b5cf6" 
        />
        <TrendChart 
          title="Quotes Generated" 
          data={chartData} 
          dataKey="quotes" 
          color="#3b82f6" 
        />
      </div>

      {/* Data Table */}
      <Card>
        <CardHeader>
          <CardTitle>MTD Agent Aggregation</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="h-32 flex items-center justify-center">
              <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-blue-500"></div>
            </div>
          ) : (
            <DataTable 
              columns={["Agent", "Team", "Office", "Quotes", "New Business", "Items", "Written Premium"]}
              data={aggregatedMTD}
              keyExtractor={(item) => item.id}
              renderRow={(item) => {
                const getGoal = (metric: string) => {
                  return goals.find(g => 
                    g.metric_name === metric && 
                    (!g.office || g.office === item.office) &&
                    (!g.team || g.team === item.team)
                  );
                };

                return (
                  <>
                    <td className="py-1.5 px-3">
                      <Link href={`/reports/agent/${item.id}`} className="font-medium text-blue-600 hover:underline">
                        {item.name}
                      </Link>
                    </td>
                    <td className="py-1.5 px-3 text-slate-500">
                      {item.team ? <Badge variant="outline">{item.team}</Badge> : '-'}
                    </td>
                    <td className="py-1.5 px-3 text-slate-500">{item.office || "-"}</td>
                    <td className="py-1.5 px-3 font-mono font-bold text-slate-900">{formatValue(item.quotes, "", "", getGoal("quotes"))}</td>
                    <td className="py-1.5 px-3 font-mono font-bold text-slate-900">{formatValue(item.nb_count, "", "", getGoal("nb_count"))}</td>
                    <td className="py-1.5 px-3 font-mono font-bold text-slate-900">{formatValue(item.items, "", "", getGoal("items"))}</td>
                    <td className="py-1.5 px-3 font-mono font-bold text-slate-900">{formatValue(item.prem_premium.toFixed(2), "$", "", getGoal("prem_premium"))}</td>
                  </>
                );
              }}
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
