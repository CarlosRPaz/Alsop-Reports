"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { Badge } from "@/components/ui/Badge"
import { Database, Play, AlertCircle, CheckCircle2, Terminal, RefreshCw, CalendarDays, Upload, X, FileSpreadsheet, Phone, MessageSquare, FileText, Package, DollarSign, Zap, Loader2, ChevronDown, Info } from "lucide-react"
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

      {/* ── File Upload Panel ── */}
      <UploadPanel />

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

// ── File Type Detection ──
const FILE_PATTERNS: { pattern: RegExp; type: string; label: string; icon: React.ReactNode; color: string; hasInternalDate: boolean }[] = [
  { pattern: /rc_|Office_Perf.*Users/i, type: "rc", label: "RC (RingCentral)", icon: <Phone className="w-3.5 h-3.5" />, color: "bg-sky-100 text-sky-700 border-sky-200", hasInternalDate: true },
  { pattern: /Performance Breakdown Report/i, type: "hs", label: "Hearsay", icon: <MessageSquare className="w-3.5 h-3.5" />, color: "bg-purple-100 text-purple-700 border-purple-200", hasInternalDate: false },
  { pattern: /Quotes Detail Report/i, type: "quotes", label: "Quotes", icon: <FileText className="w-3.5 h-3.5" />, color: "bg-amber-100 text-amber-700 border-amber-200", hasInternalDate: true },
  { pattern: /New Business Details/i, type: "nb", label: "NB (Items)", icon: <Package className="w-3.5 h-3.5" />, color: "bg-violet-100 text-violet-700 border-violet-200", hasInternalDate: true },
  { pattern: /sales-report/i, type: "premium", label: "Premium (AgencyZoom)", icon: <DollarSign className="w-3.5 h-3.5" />, color: "bg-emerald-100 text-emerald-700 border-emerald-200", hasInternalDate: false },
  { pattern: /^ch-/i, type: "rico_ch", label: "Rico CH", icon: <Zap className="w-3.5 h-3.5" />, color: "bg-rose-100 text-rose-700 border-rose-200", hasInternalDate: true },
  { pattern: /Agent Performance/i, type: "rico_ap", label: "Rico AP", icon: <Zap className="w-3.5 h-3.5" />, color: "bg-orange-100 text-orange-700 border-orange-200", hasInternalDate: false },
]

function detectFileType(filename: string) {
  for (const p of FILE_PATTERNS) {
    if (p.pattern.test(filename)) return p
  }
  return null
}

interface UploadFile {
  file: File
  type: string
  label: string
  icon: React.ReactNode
  color: string
  hasInternalDate: boolean
  dateOverride: string | null
}

function UploadPanel() {
  const [defaultDate, setDefaultDate] = useState<string>(new Date().toISOString().split("T")[0])
  const [files, setFiles] = useState<UploadFile[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadLogs, setUploadLogs] = useState<string>("")
  const [uploadStatus, setUploadStatus] = useState<"idle" | "running" | "success" | "error">("idle")
  const [dragOver, setDragOver] = useState(false)

  const addFiles = (newFiles: FileList | File[]) => {
    const added: UploadFile[] = []
    for (const f of Array.from(newFiles)) {
      const detection = detectFileType(f.name)
      added.push({
        file: f,
        type: detection?.type || "unknown",
        label: detection?.label || "Unknown",
        icon: detection?.icon || <FileSpreadsheet className="w-3.5 h-3.5" />,
        color: detection?.color || "bg-slate-100 text-slate-600 border-slate-200",
        hasInternalDate: detection?.hasInternalDate || false,
        // Lock in the current default date for files needing a date,
        // so changing the default later won't retroactively update staged files
        dateOverride: (!detection?.hasInternalDate && detection) ? defaultDate : null,
      })
    }
    setFiles(prev => [...prev, ...added])
  }

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index))
  }

  const setFileDateOverride = (index: number, date: string | null) => {
    setFiles(prev => prev.map((f, i) => i === index ? { ...f, dateOverride: date } : f))
  }

  const handleUpload = async () => {
    if (files.length === 0) return
    setUploading(true)
    setUploadStatus("running")
    setUploadLogs("Uploading files and processing...\n")

    try {
      const formData = new FormData()
      formData.append("defaultDate", defaultDate)

      // Build per-file date overrides
      const fileDates: Record<string, string> = {}
      for (const f of files) {
        formData.append("files", f.file)
        if (f.dateOverride) {
          fileDates[f.file.name] = f.dateOverride
        }
      }
      formData.append("fileDates", JSON.stringify(fileDates))

      const res = await fetch("/api/upload-data", {
        method: "POST",
        body: formData,
      })

      const result = await res.json()
      setUploadLogs(result.logs || result.error || "No output")
      setUploadStatus(result.success ? "success" : "error")

      if (result.success) {
        // Clear files on success
        setFiles([])
      }
    } catch (err: any) {
      setUploadLogs(prev => prev + "\nUpload failed: " + err.message)
      setUploadStatus("error")
    } finally {
      setUploading(false)
    }
  }

  const validFiles = files.filter(f => f.type !== "unknown")
  const unknownFiles = files.filter(f => f.type === "unknown")

  return (
    <Card className="border-indigo-200 bg-white shadow-sm">
      <CardHeader>
        <CardTitle className="text-indigo-600 flex items-center gap-2">
          <Upload className="w-5 h-5" /> Upload Data Files
        </CardTitle>
        <CardDescription>
          Manually upload source files to fill gaps or correct data. Files are auto-detected by filename and parsed into Supabase.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Source Guide (collapsible) */}
        <details className="group">
          <summary className="text-sm font-semibold text-indigo-600 cursor-pointer hover:text-indigo-500 flex items-center gap-2 select-none">
            <FileText className="w-4 h-4" />
            <span>File Source Guide — What to upload &amp; where to get it</span>
            <ChevronDown className="w-3.5 h-3.5 group-open:rotate-180 transition-transform ml-auto" />
          </summary>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
            <SourceGuideItem
              icon={<Phone className="w-3.5 h-3.5" />}
              color="bg-sky-50 border-sky-200 text-sky-700"
              label="RC (RingCentral)"
              filename="rc_YYYYMMDD_Office_Perf_Users_*.xlsx"
              source="Outlook → Daily Reports folder (auto-emailed from analytics.portal@ringcentral.com)"
              dateNote="Has internal date (Filters sheet). The filename date is the PULL date — data is for the day before."
              needsDate={false}
            />
            <SourceGuideItem
              icon={<MessageSquare className="w-3.5 h-3.5" />}
              color="bg-purple-50 border-purple-200 text-purple-700"
              label="Hearsay (Texts)"
              filename="Performance Breakdown Report*.csv"
              source="Hearsay Relate → Reports → Performance Breakdown → Download CSV"
              dateNote="No internal date. You must set the Target Date for which day this data belongs to."
              needsDate={true}
            />
            <SourceGuideItem
              icon={<FileText className="w-3.5 h-3.5" />}
              color="bg-amber-50 border-amber-200 text-amber-700"
              label="Quotes"
              filename="Quotes Detail Report__*.xlsx"
              source="Allstate Portal → Quoting Reports → Quotes Detail → Download"
              dateNote="Has internal date (Production Date column). One file can cover multiple days — set the date range before downloading."
              needsDate={false}
            />
            <SourceGuideItem
              icon={<Package className="w-3.5 h-3.5" />}
              color="bg-violet-50 border-violet-200 text-violet-700"
              label="NB (New Business / Items)"
              filename="New Business Details_*.xlsx"
              source="Allstate Portal → Production Reports → New Business Details → Download"
              dateNote="Has internal date (Issued Date column). One file can cover multiple days."
              needsDate={false}
            />
            <SourceGuideItem
              icon={<DollarSign className="w-3.5 h-3.5" />}
              color="bg-emerald-50 border-emerald-200 text-emerald-700"
              label="Premium (AgencyZoom)"
              filename="sales-report - YYYY-MM-DDT*.csv"
              source="AgencyZoom → Reports → Sales Report → Download CSV"
              dateNote="No internal date. You must set the Target Date. The date in the filename is the PULL date (data = day before)."
              needsDate={true}
            />
            <SourceGuideItem
              icon={<Zap className="w-3.5 h-3.5" />}
              color="bg-rose-50 border-rose-200 text-rose-700"
              label="Rico CH (Talk Time)"
              filename="ch-*.zip or ch-*.csv"
              source="Ricochet Admin → Reports → Call History → Set date range → Download"
              dateNote="Has internal date. Set the date range in Ricochet before exporting."
              needsDate={false}
            />
            <SourceGuideItem
              icon={<Zap className="w-3.5 h-3.5" />}
              color="bg-orange-50 border-orange-200 text-orange-700"
              label="Rico AP (Call Counts)"
              filename="Agent Performance*.xlsx"
              source="Ricochet Admin → Reports → Agent Performance → Download"
              dateNote="No internal date. You must set the Target Date for which day this data belongs to."
              needsDate={true}
            />
          </div>
        </details>

        {/* Date + Drop Zone */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="space-y-2 shrink-0">
            <label className="text-sm font-medium text-slate-700">Default Target Date</label>
            <input
              type="date"
              value={defaultDate}
              onChange={e => setDefaultDate(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-md p-2 text-slate-900 shadow-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            />
            <p className="text-[11px] text-slate-400 leading-tight">Used for files without internal dates (Hearsay, Premium, Rico AP)</p>
          </div>

          {/* Drag & Drop Zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files) }}
            className={`flex-grow border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer ${
              dragOver
                ? "border-indigo-400 bg-indigo-50"
                : "border-slate-300 bg-slate-50 hover:border-indigo-300 hover:bg-indigo-50/50"
            }`}
            onClick={() => document.getElementById("file-upload-input")?.click()}
          >
            <Upload className={`w-8 h-8 mx-auto mb-2 ${dragOver ? "text-indigo-500" : "text-slate-400"}`} />
            <p className="text-sm font-medium text-slate-600">Drag & drop files here, or click to browse</p>
            <p className="text-xs text-slate-400 mt-1">RC, Hearsay, Quotes, NB, Premium, Rico CH, Rico AP</p>
            <input
              id="file-upload-input"
              type="file"
              multiple
              accept=".xlsx,.xls,.csv,.zip"
              className="hidden"
              onChange={e => e.target.files && addFiles(e.target.files)}
            />
          </div>
        </div>

        {/* File List */}
        {files.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-slate-700">
                {files.length} file{files.length !== 1 ? "s" : ""} selected
                {unknownFiles.length > 0 && (
                  <span className="text-slate-400 font-normal ml-2">({unknownFiles.length} unrecognized)</span>
                )}
              </h4>
              <button onClick={() => setFiles([])} className="text-xs text-slate-400 hover:text-red-500 transition-colors">Clear all</button>
            </div>

            <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 overflow-hidden">
              {files.map((f, i) => (
                <div key={i} className={`flex items-center gap-3 px-3 py-2 ${f.type === "unknown" ? "bg-red-50/50" : "bg-white"}`}>
                  {/* Type badge */}
                  <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full border ${f.color}`}>
                    {f.icon} {f.label}
                  </span>

                  {/* Filename */}
                  <span className="text-sm text-slate-700 font-mono truncate flex-grow" title={f.file.name}>
                    {f.file.name}
                  </span>

                  {/* Date: show override input for files without internal dates */}
                  {!f.hasInternalDate && f.type !== "unknown" ? (
                    <div className="shrink-0 flex items-center gap-1">
                      <input
                        type="date"
                        value={f.dateOverride || defaultDate}
                        onChange={e => setFileDateOverride(i, e.target.value || null)}
                        className="text-xs border border-slate-200 rounded px-1.5 py-0.5 bg-white text-slate-700 w-[130px]"
                      />
                    </div>
                  ) : f.type !== "unknown" ? (
                    <span className="text-[10px] text-slate-400 shrink-0">auto-date</span>
                  ) : (
                    <span className="text-[10px] text-red-400 shrink-0">won't process</span>
                  )}

                  {/* Size */}
                  <span className="text-[10px] text-slate-400 shrink-0 w-14 text-right">
                    {(f.file.size / 1024).toFixed(0)} KB
                  </span>

                  {/* Remove button */}
                  <button onClick={() => removeFile(i)} className="text-slate-300 hover:text-red-500 transition-colors shrink-0">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Upload Button */}
        {validFiles.length > 0 && (
          <Button
            onClick={handleUpload}
            disabled={uploading}
            className="bg-indigo-600 hover:bg-indigo-500 text-white w-full sm:w-auto"
          >
            {uploading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Processing {validFiles.length} files...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Upload className="w-4 h-4" /> Process & Upload {validFiles.length} file{validFiles.length !== 1 ? "s" : ""}
              </span>
            )}
          </Button>
        )}

        {/* Upload Status */}
        {uploadStatus !== "idle" && (
          <div className={`p-3 border rounded-md flex items-center gap-3 ${
            uploadStatus === "running" ? "bg-blue-50 border-blue-200 text-blue-700" :
            uploadStatus === "success" ? "bg-emerald-50 border-emerald-200 text-emerald-700" :
            "bg-red-50 border-red-200 text-red-700"
          }`}>
            {uploadStatus === "running" && <Loader2 className="w-4 h-4 animate-spin" />}
            {uploadStatus === "success" && <CheckCircle2 className="w-4 h-4" />}
            {uploadStatus === "error" && <AlertCircle className="w-4 h-4" />}
            <span className="text-sm font-medium">
              {uploadStatus === "running" && "Processing uploaded files..."}
              {uploadStatus === "success" && "Files processed and data pushed to Supabase!"}
              {uploadStatus === "error" && "Processing encountered errors. Check logs."}
            </span>
          </div>
        )}

        {/* Upload Logs */}
        {uploadLogs && (
          <div className="flex flex-col">
            <div className="bg-slate-800 rounded-t-md border border-slate-800 border-b-0 px-4 py-2 flex items-center gap-2 text-slate-300 text-xs font-mono">
              <Terminal className="w-4 h-4" /> Upload Logs
            </div>
            <div className="bg-slate-900 rounded-b-md border border-slate-800 p-4 font-mono text-xs text-slate-300 overflow-y-auto whitespace-pre-wrap max-h-[300px]">
              {uploadLogs}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function SourceGuideItem({ icon, color, label, filename, source, dateNote, needsDate }: {
  icon: React.ReactNode; color: string; label: string; filename: string;
  source: string; dateNote: string; needsDate: boolean
}) {
  return (
    <div className={`rounded-lg p-3 border text-xs ${color}`}>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="inline-flex items-center gap-1 font-bold text-sm">{icon} {label}</span>
        {needsDate && (
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-white/60 border border-current/20">DATE REQUIRED</span>
        )}
      </div>
      <div className="space-y-1 text-slate-600">
        <p className="font-mono text-[11px] text-slate-500 break-all">{filename}</p>
        <p><span className="font-semibold text-slate-700">Where:</span> {source}</p>
        <p className="flex items-start gap-1"><Info className="w-3 h-3 mt-0.5 shrink-0" /> {dateNote}</p>
      </div>
    </div>
  )
}
