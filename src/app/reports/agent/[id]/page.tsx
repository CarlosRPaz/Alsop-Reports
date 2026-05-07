"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { supabase } from "@/lib/supabaseClient"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { Badge } from "@/components/ui/Badge"
import { TrendChart } from "@/components/charts/TrendChart"
import { DataTable } from "@/components/ui/DataTable"
import { Button } from "@/components/ui/Button"
import { ArrowLeft, UserCircle } from "lucide-react"
import Link from "next/link"
import { formatValue } from "@/lib/formatters"

export default function AgentReport() {
  const params = useParams()
  const agentId = params.id as string

  const [loading, setLoading] = useState(true)
  const [agent, setAgent] = useState<any>(null)
  const [metrics, setMetrics] = useState<any[]>([])

  useEffect(() => {
    if (!agentId) return

    const fetchAgentData = async () => {
      try {
        // Fetch Agent details
        const { data: agentData } = await supabase
          .from("agents")
          .select("*")
          .eq("id", agentId)
          .single()
        
        setAgent(agentData)

        // Fetch recent metrics for this agent
        const { data: metricsData } = await supabase
          .from("daily_metrics")
          .select("*")
          .eq("agent_id", agentId)
          .order("report_date", { ascending: false })
          .limit(30) // Last 30 entries
        
        setMetrics(metricsData || [])
      } catch (err) {
        console.error("Error fetching agent data:", err)
      } finally {
        setLoading(false)
      }
    }

    fetchAgentData()
  }, [agentId])

  // Prepare chart data (needs to be sorted ascending by date for charts)
  const chartData = [...metrics].sort((a, b) => new Date(a.report_date).getTime() - new Date(b.report_date).getTime()).map(m => ({
    date: m.report_date,
    calls: m.calls,
    premium: m.prem_premium
  }))

  if (loading) {
    return (
      <div className="p-8 flex justify-center items-center h-[50vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    )
  }

  if (!agent) {
    return <div className="p-8 text-slate-400">Agent not found.</div>
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4">
          <Link href="/reports/daily">
            <Button variant="ghost" size="sm" className="mb-1">
              <ArrowLeft className="w-4 h-4 mr-2" /> Back
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <UserCircle className="w-8 h-8 text-blue-400" />
              <h1 className="text-3xl font-extrabold tracking-tight text-slate-100">{agent.name}</h1>
              <Badge variant={agent.presence === 'online' ? 'success' : 'outline'}>
                {agent.presence || 'offline'}
              </Badge>
            </div>
            <div className="flex gap-2 mt-2">
              <Badge variant="outline">{agent.role}</Badge>
              {agent.team && <Badge variant="outline">{agent.team}</Badge>}
              {agent.office && <Badge variant="outline">{agent.office}</Badge>}
            </div>
          </div>
        </div>
      </header>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TrendChart 
          title="Daily Calls (Last 30 Days)" 
          data={chartData} 
          dataKey="calls" 
          color="#3b82f6" 
          xAxisKey="date"
        />
        <TrendChart 
          title="Written Premium (Last 30 Days)" 
          data={chartData} 
          dataKey="premium" 
          color="#10b981" 
          xAxisKey="date"
        />
      </div>

      {/* Data Table */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity Log</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable 
            columns={["Date", "Calls", "Inbound", "Outbound", "Talk Time", "Quotes", "New Business"]}
            data={metrics}
            keyExtractor={(item) => item.id}
            renderRow={(item) => (
              <>
                  <td className="py-1.5 px-3 font-medium text-slate-200">{item.report_date}</td>
                  <td className="py-1.5 px-3 font-mono">{formatValue(item.calls)}</td>
                  <td className="py-1.5 px-3 font-mono text-emerald-400">{formatValue(item.inbound)}</td>
                  <td className="py-1.5 px-3 font-mono text-blue-400">{formatValue(item.outbound)}</td>
                  <td className="py-1.5 px-3 font-mono text-slate-400">{formatValue(Math.floor(item.talk_time_seconds / 60), "", "m")}</td>
                  <td className="py-1.5 px-3 font-mono text-slate-300">{formatValue(item.quotes)}</td>
                  <td className="py-1.5 px-3 font-mono text-slate-300">{formatValue(item.nb_count)}</td>
              </>
            )}
          />
        </CardContent>
      </Card>
    </div>
  )
}
