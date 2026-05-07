"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { Badge } from "@/components/ui/Badge"
import { Database, Play, AlertCircle, CheckCircle2, Terminal, RefreshCw, CalendarDays } from "lucide-react"
import { runDataSyncPipeline } from "./actions"
import { supabase } from "@/lib/supabaseClient"
import SyncCalendar from "@/components/ui/SyncCalendar"

export default function DataSyncPage() {
  const [date, setDate] = useState<string>(new Date().toISOString().split("T")[0])
  const [loading, setLoading] = useState(false)
  const [logs, setLogs] = useState<string>("")
  const [status, setStatus] = useState<"idle" | "running" | "success" | "error">("idle")
  const [dbStatus, setDbStatus] = useState<"checking" | "connected" | "error">("checking")
  const [agentCount, setAgentCount] = useState<number>(0)
  const [metricsCount, setMetricsCount] = useState<number>(0)

  // Check Supabase connection on load
  useEffect(() => {
    const checkConnection = async () => {
      try {
        const { count: agentsTotal, error: agentsErr } = await supabase
          .from("agents")
          .select("*", { count: "exact", head: true })
        
        if (agentsErr) throw agentsErr
        setAgentCount(agentsTotal || 0)

        const { count: metricsTotal, error: metricsErr } = await supabase
          .from("daily_metrics")
          .select("*", { count: "exact", head: true })

        if (metricsErr) throw metricsErr
        setMetricsCount(metricsTotal || 0)

        setDbStatus("connected")
      } catch (e) {
        console.error("Supabase connection check failed:", e)
        setDbStatus("error")
      }
    }
    checkConnection()
  }, [])

  const handleRun = async () => {
    setLoading(true)
    setStatus("running")
    setLogs("Initializing Python data pipeline...\n")
    
    try {
      const result = await runDataSyncPipeline(date)
      setLogs(result.logs)
      setStatus(result.success ? "success" : "error")

      // Refresh DB counts after sync
      if (result.success) {
        const { count: a } = await supabase.from("agents").select("*", { count: "exact", head: true })
        const { count: m } = await supabase.from("daily_metrics").select("*", { count: "exact", head: true })
        setAgentCount(a || 0)
        setMetricsCount(m || 0)
      }
    } catch (e: any) {
      setLogs((prev) => prev + "\nFailed to execute pipeline: " + e.message)
      setStatus("error")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 min-h-screen">
      <header>
        <h1 className="text-3xl font-extrabold text-slate-900 flex items-center gap-3">
          <Database className="w-8 h-8 text-emerald-500" />
          Data Synchronization
        </h1>
        <p className="text-slate-500 mt-2">Trigger data ingestion and view our data source dictionary.</p>
      </header>

      {/* Database Health Bar */}
      <div className={`p-4 rounded-lg border shadow-sm flex items-center justify-between ${
        dbStatus === "connected" ? "bg-emerald-50 border-emerald-200" :
        dbStatus === "error" ? "bg-red-50 border-red-200" :
        "bg-white border-slate-200"
      }`}>
        <div className="flex items-center gap-3">
          {dbStatus === "checking" && <RefreshCw className="w-5 h-5 text-slate-500 animate-spin" />}
          {dbStatus === "connected" && <CheckCircle2 className="w-5 h-5 text-emerald-600" />}
          {dbStatus === "error" && <AlertCircle className="w-5 h-5 text-red-600" />}
          <div>
            <span className="font-semibold text-slate-900">
              {dbStatus === "checking" && "Checking Supabase connection..."}
              {dbStatus === "connected" && "Supabase Connected"}
              {dbStatus === "error" && "Supabase Unreachable"}
            </span>
            {dbStatus === "error" && (
              <p className="text-red-400 text-sm mt-1">
                Cannot resolve the Supabase host. The project may be paused — visit{" "}
                <a href="https://supabase.com/dashboard" target="_blank" className="underline hover:text-red-300">supabase.com/dashboard</a>{" "}
                and check if your project needs to be resumed.
              </p>
            )}
          </div>
        </div>
        {dbStatus === "connected" && (
          <div className="flex gap-6 text-sm">
            <div className="text-center">
              <div className="text-2xl font-bold text-emerald-600">{agentCount}</div>
              <div className="text-slate-600">Agents</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{metricsCount}</div>
              <div className="text-slate-600">Metric Records</div>
            </div>
          </div>
        )}
      </div>

      {/* Sync History Calendar */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm">
          <CalendarDays className="w-4 h-4 text-slate-500" />
          <span className="text-slate-700 font-medium">Sync History</span>
          <span className="text-slate-500 text-xs">— click a date to sync it</span>
        </div>
        <div className="max-w-xs">
          <SyncCalendar onDateSelect={(d) => setDate(d)} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Pipeline Control Card */}
        <Card className="flex flex-col border-emerald-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-emerald-600 flex items-center gap-2">
              <Play className="w-5 h-5" /> Execute Pipeline
            </CardTitle>
            <CardDescription>Run the Python engine to process downloaded files and push data into Supabase.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6 flex-grow">
            <div className="flex flex-col sm:flex-row gap-4 items-end">
              <div className="flex-grow space-y-2">
                <label className="text-sm font-medium text-slate-700">Target Date</label>
                <input 
                  type="date" 
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-md p-2 text-slate-900 shadow-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>
              <Button 
                onClick={handleRun} 
                disabled={loading}
                className="bg-emerald-600 hover:bg-emerald-500 text-white w-full sm:w-auto"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <div className="animate-spin h-4 w-4 border-2 border-white/20 border-t-white rounded-full" />
                    Running...
                  </span>
                ) : (
                  <span className="flex items-center gap-2"><Play className="w-4 h-4" /> Start Sync</span>
                )}
              </Button>
            </div>

            {/* Status Indicator */}
            {status !== "idle" && (
              <div className={`p-4 border rounded-md flex items-center gap-3 ${
                status === "running" ? "bg-blue-50 border-blue-200 text-blue-700" :
                status === "success" ? "bg-emerald-50 border-emerald-200 text-emerald-700" :
                "bg-red-50 border-red-200 text-red-700"
              }`}>
                {status === "running" && <div className="animate-spin h-5 w-5 border-2 border-current border-t-transparent rounded-full" />}
                {status === "success" && <CheckCircle2 className="w-5 h-5" />}
                {status === "error" && <AlertCircle className="w-5 h-5" />}
                <span className="font-medium">
                  {status === "running" && "Pipeline is processing data. Please wait..."}
                  {status === "success" && "Data synchronized successfully!"}
                  {status === "error" && "Pipeline encountered an error. Check logs below."}
                </span>
              </div>
            )}

            {/* Logs Terminal */}
            <div className="flex-grow flex flex-col min-h-[300px]">
              <div className="bg-slate-800 rounded-t-md border border-slate-800 border-b-0 px-4 py-2 flex items-center gap-2 text-slate-300 text-xs font-mono">
                <Terminal className="w-4 h-4" /> Execution Logs
              </div>
              <div className="bg-slate-900 flex-grow rounded-b-md border border-slate-800 p-4 font-mono text-xs text-slate-300 overflow-y-auto whitespace-pre-wrap max-h-[400px]">
                {logs || <span className="text-slate-500">Waiting for execution...</span>}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Data Dictionary Card */}
        <Card className="flex flex-col border-blue-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-blue-600">Data Sources Dictionary</CardTitle>
            <CardDescription>Where every number on the dashboard comes from, and how we get it.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-auto max-h-[700px]">
            <div className="space-y-4">
              <DictionaryItem 
                metric="Agent Roster" 
                source="Daily Standup Report.xlsx" 
                method='Local File → "Spine" sheet'
                location="C:/Users/scag3s29/Documents/Claude Scope/Daily Standup Report.xlsx"
                description="The master agent list. This Excel file's 'Spine' tab defines every agent's name, team, and office. All other data sources are matched back to these agent names."
                type="Core"
              />
              <DictionaryItem 
                metric="Calls & Talk Time (Service)" 
                source="RingCentral" 
                method="Email Attachment → data/raw/"
                location="Outlook → 'Daily Reports' folder (sender: analytics.portal@ringcentral.com)"
                description="A scheduled report from RingCentral is emailed to Outlook daily. The pipeline grabs the Excel attachment, which contains call counts, inbound/outbound splits, and handle time per user."
                type="Communication"
              />
              <DictionaryItem 
                metric="Calls & Talk Time (Sales)" 
                source="Ricochet Dialer" 
                method="Manual Download → Downloads folder"
                location="C:/Users/scag3s29/Downloads/ch-*.zip"
                description="A ZIP file exported from the Ricochet admin portal containing individual call records for Sales agents. You download this manually from ricochet.me, and the pipeline picks it up from your Downloads folder."
                type="Communication"
              />
              <DictionaryItem 
                metric="Text Messages" 
                source="Hearsay Relate" 
                method="Auto-Download → Downloads folder"
                location='C:/Users/scag3s29/Downloads/Performance Breakdown Report*.csv'
                description="The pipeline opens Hearsay download URLs in the browser, which auto-saves CSV files to your Downloads folder. Each CSV is a 'Performance Breakdown Report' covering one workspace. Date in filename = day after the data."
                type="Communication"
              />
              <DictionaryItem 
                metric="Quotes Issued" 
                source="Allstate Portal" 
                method="Manual Download → Downloads folder"
                location="C:/Users/scag3s29/Downloads/Quotes Detail Report*.xlsx"
                description="An Excel report downloaded from the Allstate quoting portal. Lists every quote by Sub Producer and Production Date. The pipeline uses the most recently downloaded file."
                type="Production"
              />
              <DictionaryItem 
                metric="New Business (Items)" 
                source="Allstate Portal" 
                method="Manual Download → Downloads folder"
                location="C:/Users/scag3s29/Downloads/New Business Details*.xlsx"
                description="An Excel download from Allstate listing each new policy bound. Shows Sub-Producer Name, Policy Number, Item Count, and Written Premium. The pipeline counts unique policies and sums items."
                type="Production"
              />
              <DictionaryItem 
                metric="Written Premium (Points)" 
                source="AgencyZoom" 
                method="Manual Download → Downloads folder"
                location='C:/Users/scag3s29/Downloads/sales-report - *.csv'
                description="A CSV exported from AgencyZoom. Shows each producer's items, premium dollars, and points. The date in the filename is the PULL date — data is for the day before. The pipeline matches the correct file by date."
                type="Production"
              />
              <DictionaryItem 
                metric="Lead Pipeline (Hot / Quoted)" 
                source="DeerDama (Ricochet Leads)" 
                method="Auto-Download → Downloads folder"
                location="C:/Users/scag3s29/Downloads/leads_report_*.csv"
                description="A live snapshot of every lead in the Ricochet CRM. The pipeline counts how many leads each agent has in 'Contacted', 'Quoted', 'Hot', and 'XDate' status. This is NOT date-filtered — it's a real-time view of the entire pipeline."
                type="Pipeline"
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function DictionaryItem({ metric, source, method, location, description, type }: { 
  metric: string, source: string, method: string, location: string, description: string, type: string 
}) {
  const typeColors: Record<string, string> = {
    Core: "text-purple-700 border-purple-200 bg-purple-50",
    Communication: "text-cyan-700 border-cyan-200 bg-cyan-50",
    Production: "text-emerald-700 border-emerald-200 bg-emerald-50",
    Pipeline: "text-amber-700 border-amber-200 bg-amber-50",
  }
  const colorClass = typeColors[type] || "text-slate-600 border-slate-200 bg-slate-50"

  return (
    <div className={`rounded-lg p-4 border ${colorClass} transition-colors`}>
      <div className="flex justify-between items-start mb-2 gap-2">
        <h3 className="font-bold text-slate-900 text-sm">{metric}</h3>
        <Badge variant="outline" className={`text-xs shrink-0 whitespace-nowrap bg-white ${colorClass}`}>
          {source}
        </Badge>
      </div>
      <div className="text-xs text-slate-600 font-mono mb-2 flex flex-col gap-0.5">
        <span>📥 <span className="text-slate-500">{method}</span></span>
        <span>📂 <span className="text-slate-500 break-all">{location}</span></span>
      </div>
      <p className="text-sm text-slate-600 leading-relaxed">{description}</p>
    </div>
  )
}
