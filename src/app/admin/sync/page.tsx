"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { Badge } from "@/components/ui/Badge"
import {
  Database, AlertCircle, CheckCircle2, Terminal, RefreshCw, CalendarDays,
  Upload, X, FileSpreadsheet, Phone, MessageSquare, FileText, Package,
  DollarSign, Zap, Loader2, ChevronDown, Info, ShieldCheck, ExternalLink, Monitor, Pencil,
  ChevronLeft, ChevronRight, Ban,
} from "lucide-react"
import { supabase } from "@/lib/supabaseClient"
import SyncCalendar from "@/components/ui/SyncCalendar"
import UploadHistory from "@/components/ui/UploadHistory"
import { getDailyCoverage, toggleSourceUnavailable } from "@/app/reports/daily/actions"
import Link from "next/link"
import { processUploadedFiles, type UploadFile } from "@/lib/pipeline"
import { LeadsModal } from "@/components/reports/LeadsModal"

// ─── Source Configuration ─────────────────────────────────────────────────────

type FilePattern = {
  pattern: RegExp
  type: string
  label: string
  hasInternalDate: boolean
}

type DataSource = {
  key: string
  label: string
  system: string
  icon: React.ComponentType<{ className?: string }>
  color: string
  uploadTypes: string[]
  filePatterns: FilePattern[]
  howToGet: string
  isManualEntry?: boolean
  isAutomatic?: boolean
}

const DATA_SOURCES: DataSource[] = [
  {
    key: "calls", label: "Calls & Talk Time", system: "RingCentral / Ricochet", icon: Phone, color: "sky",
    uploadTypes: ["rc", "rico_ch", "rico_ap"],
    filePatterns: [
      { pattern: /rc_|Office_Perf.*Users/i, type: "rc", label: "RC (RingCentral)", hasInternalDate: true },
      { pattern: /^ch-/i, type: "rico_ch", label: "Rico CH (Talk Time)", hasInternalDate: true },
      { pattern: /Agent Performance/i, type: "rico_ap", label: "Rico AP (Calls)", hasInternalDate: false },
    ],
    howToGet: "Download from RingCentral email (auto-arrives in Outlook) or Ricochet Admin → Reports",
  },
  {
    key: "texts", label: "Text Messages", system: "Hearsay Relate", icon: MessageSquare, color: "purple",
    uploadTypes: ["hs"],
    filePatterns: [
      { pattern: /Performance Breakdown Report/i, type: "hs", label: "Hearsay", hasInternalDate: false },
    ],
    howToGet: "Hearsay Relate → Reports → Performance Breakdown → Download CSV",
  },
  {
    key: "quotes", label: "Quotes Issued", system: "Allstate DASH", icon: FileText, color: "amber",
    uploadTypes: ["quotes"],
    filePatterns: [
      { pattern: /Quotes Detail/i, type: "quotes", label: "Quotes", hasInternalDate: true },
    ],
    howToGet: "Allstate Portal → Quoting Reports → Quotes Detail → Download",
  },
  {
    key: "items", label: "New Business (Items)", system: "Allstate DASH", icon: Package, color: "violet",
    uploadTypes: ["nb"],
    filePatterns: [
      { pattern: /New Business/i, type: "nb", label: "NB (Items)", hasInternalDate: true },
    ],
    howToGet: "Allstate Portal → Production Reports → New Business Details → Download",
  },
  {
    key: "premium", label: "Written Premium", system: "AgencyZoom", icon: DollarSign, color: "emerald",
    uploadTypes: ["premium"],
    filePatterns: [
      { pattern: /sales-report/i, type: "premium", label: "Premium", hasInternalDate: false },
    ],
    howToGet: "AgencyZoom → Reports → Sales Report → Download CSV",
  },
  {
    key: "eagent", label: "eAgent Tasks", system: "Daily Report Modal", icon: ShieldCheck, color: "rose",
    uploadTypes: [],
    filePatterns: [],
    howToGet: "Enter via the eAgent modal on the Daily Report page",
    isManualEntry: true,
  },
  {
    key: "leads", label: "Lead Pipeline", system: "DeerDama", icon: Zap, color: "orange",
    uploadTypes: [],
    filePatterns: [],
    howToGet: "Enter via the Enter Lead Data modal on the Daily Report page — or run automated scrape from local server",
    isAutomatic: true,
  },
]

// ─── Color Palette ────────────────────────────────────────────────────────────

const SOURCE_COLORS: Record<string, { bg: string; border: string; text: string; light: string; missing: string }> = {
  sky:     { bg: "bg-sky-50 dark:bg-sky-950/50",     border: "border-sky-200 dark:border-sky-800",     text: "text-sky-700 dark:text-sky-300",     light: "bg-sky-100 dark:bg-sky-900/40",     missing: "bg-sky-50/50 dark:bg-sky-950/30 border-sky-200/50 dark:border-sky-800/40 text-sky-400 dark:text-sky-600" },
  purple:  { bg: "bg-purple-50 dark:bg-purple-950/50",  border: "border-purple-200 dark:border-purple-800",  text: "text-purple-700 dark:text-purple-300",  light: "bg-purple-100 dark:bg-purple-900/40",  missing: "bg-purple-50/50 dark:bg-purple-950/30 border-purple-200/50 dark:border-purple-800/40 text-purple-400 dark:text-purple-600" },
  amber:   { bg: "bg-amber-50 dark:bg-amber-950/50",   border: "border-amber-200 dark:border-amber-800",   text: "text-amber-700 dark:text-amber-300",   light: "bg-amber-100 dark:bg-amber-900/40",   missing: "bg-amber-50/50 dark:bg-amber-950/30 border-amber-200/50 dark:border-amber-800/40 text-amber-400 dark:text-amber-600" },
  violet:  { bg: "bg-violet-50 dark:bg-violet-950/50",  border: "border-violet-200 dark:border-violet-800",  text: "text-violet-700 dark:text-violet-300",  light: "bg-violet-100 dark:bg-violet-900/40",  missing: "bg-violet-50/50 dark:bg-violet-950/30 border-violet-200/50 dark:border-violet-800/40 text-violet-400 dark:text-violet-600" },
  emerald: { bg: "bg-emerald-50 dark:bg-emerald-950/50", border: "border-emerald-200 dark:border-emerald-800", text: "text-emerald-700 dark:text-emerald-300", light: "bg-emerald-100 dark:bg-emerald-900/40", missing: "bg-emerald-50/50 dark:bg-emerald-950/30 border-emerald-200/50 dark:border-emerald-800/40 text-emerald-400 dark:text-emerald-600" },
  rose:    { bg: "bg-rose-50 dark:bg-rose-950/50",    border: "border-rose-200 dark:border-rose-800",    text: "text-rose-700 dark:text-rose-300",    light: "bg-rose-100 dark:bg-rose-900/40",    missing: "bg-rose-50/50 dark:bg-rose-950/30 border-rose-200/50 dark:border-rose-800/40 text-rose-400 dark:text-rose-600" },
  orange:  { bg: "bg-orange-50 dark:bg-orange-950/50",  border: "border-orange-200 dark:border-orange-800",  text: "text-orange-700 dark:text-orange-300",  light: "bg-orange-100 dark:bg-orange-900/40",  missing: "bg-orange-50/50 dark:bg-orange-950/30 border-orange-200/50 dark:border-orange-800/40 text-orange-400 dark:text-orange-600" },
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface CoverageItem {
  present: boolean
  agentCount: number
  subSources?: Record<string, boolean>
  unavailable?: boolean
  unavailReason?: string | null
}

type CoverageData = Record<string, CoverageItem>

interface StagedFile {
  file: File
  sourceKey: string
  type: string
  label: string
  hasInternalDate: boolean
  dateOverride: string | null
}

// ─── File Detection ───────────────────────────────────────────────────────────

function detectFileSource(filename: string): { source: DataSource; pattern: FilePattern } | null {
  for (const source of DATA_SOURCES) {
    for (const fp of source.filePatterns) {
      if (fp.pattern.test(filename)) {
        return { source, pattern: fp }
      }
    }
  }
  return null
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DataSyncPage() {
  const [date, setDate] = useState<string>(() => {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    return d.toISOString().split("T")[0]
  })

  const adjustDate = (days: number) => {
    const parts = date.split('-')
    if (parts.length !== 3) return
    const year = parseInt(parts[0], 10)
    const month = parseInt(parts[1], 10) - 1
    const day = parseInt(parts[2], 10)
    
    const d = new Date(year, month, day)
    d.setDate(d.getDate() + days)
    
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const r = String(d.getDate()).padStart(2, '0')
    setDate(`${y}-${m}-${r}`)
  }
  const [dbStatus, setDbStatus] = useState<"checking" | "connected" | "error">("checking")
  const [agentCount, setAgentCount] = useState<number>(0)
  const [metricsCount, setMetricsCount] = useState<number>(0)
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0)

  // Coverage
  const [coverage, setCoverage] = useState<CoverageData | null>(null)
  const [coverageLoading, setCoverageLoading] = useState(false)

  // Staged files (per source)
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([])

  // Upload state
  const [uploading, setUploading] = useState(false)
  const [uploadStatus, setUploadStatus] = useState<"idle" | "running" | "success" | "error">("idle")
  const [uploadLogs, setUploadLogs] = useState<string>("")
  const [lastFailedSource, setLastFailedSource] = useState<string | null>(null)



  // Sections

  const [dictionaryOpen, setDictionaryOpen] = useState(false)
  const [leadsModalOpen, setLeadsModalOpen] = useState(false)

  const topRef = useRef<HTMLDivElement>(null)

  // ── DB Health Check ──
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

  // ── Fetch Coverage when date changes ──
  const fetchCoverage = useCallback(async (d: string) => {
    setCoverageLoading(true)
    try {
      const result = await getDailyCoverage(d)
      if (result.success && result.data) {
        setCoverage(result.data as CoverageData)
      } else {
        setCoverage(null)
      }
    } catch (e) {
      console.error("Coverage fetch failed:", e)
      setCoverage(null)
    } finally {
      setCoverageLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchCoverage(date)
  }, [date, refreshTrigger, fetchCoverage])

  // ── Gap click handler from SyncCalendar ──
  const handleGapClick = useCallback((gapDate: string, _missingSources: string[]) => {
    setDate(gapDate)
    topRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [])

  // ── File staging ──
  const addFilesToSource = useCallback((sourceKey: string, newFiles: FileList | File[]) => {
    const added: StagedFile[] = []
    for (const f of Array.from(newFiles)) {
      const detected = detectFileSource(f.name)
      // If detected and belongs to this source, use that. Otherwise still add to the specified source.
      const matchedSource = detected?.source.key === sourceKey ? detected : null
      const source = DATA_SOURCES.find(s => s.key === sourceKey)!

      if (matchedSource) {
        added.push({
          file: f,
          sourceKey,
          type: matchedSource.pattern.type,
          label: matchedSource.pattern.label,
          hasInternalDate: matchedSource.pattern.hasInternalDate,
          dateOverride: !matchedSource.pattern.hasInternalDate ? date : null,
        })
      } else {
        // File doesn't match patterns for this source — try auto-detect
        const autoDetected = detectFileSource(f.name)
        if (autoDetected) {
          added.push({
            file: f,
            sourceKey: autoDetected.source.key,
            type: autoDetected.pattern.type,
            label: autoDetected.pattern.label,
            hasInternalDate: autoDetected.pattern.hasInternalDate,
            dateOverride: !autoDetected.pattern.hasInternalDate ? date : null,
          })
        } else {
          // Unknown file — still stage it for the target source
          added.push({
            file: f,
            sourceKey,
            type: "unknown",
            label: "Unknown",
            hasInternalDate: false,
            dateOverride: date,
          })
        }
      }
    }
    setStagedFiles(prev => [...prev, ...added])
  }, [date])

  const handleUnifiedDrop = useCallback((newFiles: FileList | File[]) => {
    const added: StagedFile[] = []
    for (const f of Array.from(newFiles)) {
      // Duplicate detection — skip files already staged with the same name + size
      const isDuplicate = stagedFiles.some(
        existing => existing.file.name === f.name && existing.file.size === f.size
      )
      if (isDuplicate) {
        continue
      }

      const detected = detectFileSource(f.name)
      if (detected) {
        added.push({
          file: f,
          sourceKey: detected.source.key,
          type: detected.pattern.type,
          label: detected.pattern.label,
          hasInternalDate: detected.pattern.hasInternalDate,
          dateOverride: detected.pattern.hasInternalDate ? null : date,
        })
      } else {
        added.push({
          file: f,
          sourceKey: "unknown",
          type: "unknown",
          label: "Unknown",
          hasInternalDate: false,
          dateOverride: date,
        })
      }
    }
    if (added.length === 0 && Array.from(newFiles).length > 0) {
      // All files were duplicates
      return
    }
    setStagedFiles(prev => [...prev, ...added])
  }, [date, stagedFiles])

  const removeFile = useCallback((index: number) => {
    setStagedFiles(prev => prev.filter((_, i) => i !== index))
  }, [])

  const setFileDateOverride = useCallback((index: number, newDate: string | null) => {
    setStagedFiles(prev => prev.map((f, i) => i === index ? { ...f, dateOverride: newDate } : f))
  }, [])

  // ── Upload Handler ──
  const validFiles = useMemo(() => stagedFiles.filter(f => f.type !== "unknown"), [stagedFiles])

  const handleUpload = useCallback(async (autoScrapeKey?: string) => {
    if (!autoScrapeKey && validFiles.length === 0) return
    setUploading(true)
    setUploadStatus("running")
    setLastFailedSource(null)
    setUploadLogs(autoScrapeKey ? `Triggering automation for ${autoScrapeKey}...\n` : "Processing files...\n")

    try {
      if (autoScrapeKey) {
        // Auto-scrape (Lead Pipeline) — still uses the server-side API route (localhost only)
        const formData = new FormData()
        formData.append("defaultDate", date)
        formData.append("autoScrape", autoScrapeKey)

        const res = await fetch("/api/upload-data", {
          method: "POST",
          body: formData,
        })

        const result = await res.json()
        setUploadLogs(result.logs || result.error || "No output")
        setUploadStatus(result.success ? "success" : "error")
        if (!result.success) setLastFailedSource(autoScrapeKey || null)
      } else {
        // File uploads — process entirely on the client side
        const uploadFiles: UploadFile[] = validFiles.map(f => ({
          file: f.file,
          type: f.type,
          label: f.label,
          hasInternalDate: f.hasInternalDate,
          dateOverride: f.dateOverride,
        }))

        const result = await processUploadedFiles(
          supabase,
          uploadFiles,
          date,
          (msg) => setUploadLogs(prev => prev + msg + "\n"),
        )

        setUploadLogs(result.logs)
        setUploadStatus(result.success ? "success" : "error")
        if (!result.success) setLastFailedSource(null)
      }

      // Always clear staged files
      setStagedFiles([])
      // Refresh coverage + counts to show what actually landed
      setRefreshTrigger(prev => prev + 1)
      const { count: a } = await supabase.from("agents").select("*", { count: "exact", head: true })
      const { count: m } = await supabase.from("daily_metrics").select("*", { count: "exact", head: true })
      setAgentCount(a || 0)
      setMetricsCount(m || 0)
    } catch (err: any) {
      setUploadLogs(prev => prev + "\nUpload failed: " + err.message)
      setUploadStatus("error")
      if (autoScrapeKey) setLastFailedSource(autoScrapeKey)
    } finally {
      setUploading(false)
    }
  }, [validFiles, date])

  // ── Coverage helpers ──
  const sourcesPresent = useMemo(() => {
    if (!coverage) return 0
    return DATA_SOURCES.filter(s => coverage[s.key]?.present).length
  }, [coverage])

  const sourcesMissing = useMemo(() => {
    if (!coverage) return DATA_SOURCES.length
    return DATA_SOURCES.filter(s => !coverage[s.key]?.present).length
  }, [coverage])

  const filesForSource = useCallback((sourceKey: string) => {
    return stagedFiles.filter(f => f.sourceKey === sourceKey)
  }, [stagedFiles])

  // ── Formatted date ──
  const formattedDate = useMemo(() => {
    const d = new Date(date + "T12:00:00")
    return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })
  }, [date])

  return (
    <>
    <div ref={topRef} className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 min-h-screen pb-32">

      {/* ═══ Header ═══ */}
      <header className="space-y-1">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 flex items-center gap-3">
          <Database className="w-7 h-7 sm:w-8 sm:h-8 text-emerald-500 shrink-0" />
          Data Sync Hub
        </h1>
        <p className="text-slate-500 text-xs sm:text-sm">Upload source files and track data coverage for the daily standup report.</p>
      </header>

      {/* ═══ Date Picker + DB Health Row ═══ */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
        {/* Date Picker */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Report Date</label>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                onClick={() => adjustDate(-1)}
                className="h-10 w-10 p-0 flex items-center justify-center border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 active:scale-95 transition-all"
                title="Previous Day"
              >
                <ChevronLeft className="w-5 h-5" />
              </Button>
              
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 shadow-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-shadow h-10 w-44"
              />
              
              <Button
                variant="outline"
                onClick={() => adjustDate(1)}
                className="h-10 w-10 p-0 flex items-center justify-center border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 active:scale-95 transition-all"
                title="Next Day"
              >
                <ChevronRight className="w-5 h-5" />
              </Button>
            </div>
            
            <p className="text-sm text-slate-600 font-medium">{formattedDate}</p>
          </div>
        </div>

        <div className="sm:ml-auto flex items-center gap-3">
          {/* Coverage summary pill */}
          {coverage && !coverageLoading && (
            <div className="flex items-center gap-1.5">
              <Badge variant={sourcesPresent === DATA_SOURCES.length ? "success" : sourcesMissing === DATA_SOURCES.length ? "danger" : "warning"}
                className="text-xs"
              >
                {sourcesPresent}/{DATA_SOURCES.length} sources
              </Badge>
            </div>
          )}

          {/* DB Status */}
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
            dbStatus === "connected" ? "bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300" :
            dbStatus === "error" ? "bg-red-50 dark:bg-red-950/50 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300" :
            "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400"
          }`}>
            {dbStatus === "checking" && <RefreshCw className="w-3 h-3 animate-spin" />}
            {dbStatus === "connected" && <CheckCircle2 className="w-3 h-3" />}
            {dbStatus === "error" && <AlertCircle className="w-3 h-3" />}
            {dbStatus === "connected" ? (
              <span>{agentCount} agents · {metricsCount.toLocaleString()} records</span>
            ) : dbStatus === "error" ? (
              <span>DB Unreachable</span>
            ) : (
              <span>Connecting…</span>
            )}
          </div>
        </div>
      </div>

      {/* DB Error details */}
      {dbStatus === "error" && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
          <p className="font-medium flex items-center gap-2"><AlertCircle className="w-4 h-4" /> Supabase Unreachable</p>
          <p className="text-red-500 mt-1">
            Cannot resolve the Supabase host. The project may be paused — visit{" "}
            <a href="https://supabase.com/dashboard" target="_blank" className="underline hover:text-red-400">supabase.com/dashboard</a>{" "}
            and check if your project needs to be resumed.
          </p>
        </div>
      )}



      {/* ═══ Coverage Loading Skeleton ═══ */}
      {coverageLoading && (
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Loading coverage for {date}…</span>
        </div>
      )}

      {/* ═══ Unified Upload Area ═══ */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-indigo-50 text-indigo-600">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Upload Files</h3>
              <p className="text-xs text-slate-500">Drop any source files here — they&apos;ll be auto-detected and routed to the correct tables.</p>
            </div>
          </div>

          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("border-indigo-400", "bg-indigo-50/50", "scale-[1.005]") }}
            onDragLeave={(e) => { e.currentTarget.classList.remove("border-indigo-400", "bg-indigo-50/50", "scale-[1.005]") }}
            onDrop={(e) => {
              e.preventDefault()
              e.currentTarget.classList.remove("border-indigo-400", "bg-indigo-50/50", "scale-[1.005]")
              handleUnifiedDrop(e.dataTransfer.files)
            }}
            onClick={() => document.getElementById("unified-file-input")?.click()}
            className="border-2 border-dashed border-slate-300 rounded-lg py-6 text-center transition-all duration-200 cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/30"
          >
            <FileSpreadsheet className="w-8 h-8 mx-auto text-slate-400" />
            <p className="text-sm font-medium text-slate-600 mt-2">Drop files here, or click to browse</p>
            <p className="text-xs text-slate-400 mt-1">
              Supported: RC, Hearsay, Quotes Detail, NB Details, AgencyZoom Premium, Rico CH/AP
            </p>
            <input
              id="unified-file-input"
              type="file"
              multiple
              accept=".xlsx,.xls,.csv,.zip"
              className="hidden"
              onChange={(e) => e.target.files && handleUnifiedDrop(e.target.files)}
            />
          </div>

          {/* Staged files list */}
          {stagedFiles.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  {stagedFiles.length} file{stagedFiles.length !== 1 ? "s" : ""} staged
                </span>
                <button onClick={() => setStagedFiles([])} className="text-xs text-slate-400 hover:text-red-500 transition-colors">
                  Clear all
                </button>
              </div>
              {stagedFiles.map((f, idx) => {
                const colors = f.sourceKey !== "unknown" ? SOURCE_COLORS[DATA_SOURCES.find(s => s.key === f.sourceKey)?.color || "sky"] : null
                return (
                  <div key={idx} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs border ${
                    f.type === "unknown"
                      ? "bg-red-50 border-red-200"
                      : colors ? `${colors.bg} ${colors.border}` : "bg-slate-50 border-slate-200"
                  }`}>
                    <Badge variant="outline" className={`text-[10px] shrink-0 ${
                      f.type === "unknown"
                        ? "bg-red-100 text-red-600 border-red-200"
                        : colors ? `${colors.light} ${colors.text} ${colors.border}` : ""
                    }`}>
                      {f.label}
                    </Badge>
                    <span className="font-mono text-slate-700 truncate flex-grow" title={f.file.name}>
                      {f.file.name}
                    </span>
                    {f.type === "unknown" ? (
                      <span className="text-[10px] text-red-400 shrink-0">won&apos;t process</span>
                    ) : f.hasInternalDate ? (
                      <span className="text-[10px] text-emerald-600 font-medium shrink-0 flex items-center gap-1">
                        <CalendarDays className="w-3 h-3" /> Dates from file
                      </span>
                    ) : (
                      <input
                        type="date"
                        value={f.dateOverride || date}
                        onChange={(e) => setFileDateOverride(idx, e.target.value || null)}
                        className="text-[10px] border border-slate-200 rounded px-1.5 py-0.5 bg-white text-slate-700 w-[120px] shrink-0"
                      />
                    )}
                    <span className="text-[10px] text-slate-400 shrink-0">{(f.file.size / 1024).toFixed(0)} KB</span>
                    <button onClick={() => removeFile(idx)} className="text-slate-300 hover:text-red-500 transition-colors shrink-0">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ═══ Upload Status + Logs ═══ */}
      {uploadStatus !== "idle" && (
        <div className="space-y-3">
          <div className={`px-4 py-3 rounded-lg flex items-center gap-3 text-sm border ${
            uploadStatus === "running" ? "bg-blue-50 dark:bg-blue-950/50 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300" :
            uploadStatus === "success" ? "bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300" :
            "bg-red-50 dark:bg-red-950/50 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300"
          }`}>
            {uploadStatus === "running" && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
            {uploadStatus === "success" && <CheckCircle2 className="w-4 h-4 shrink-0" />}
            {uploadStatus === "error" && <AlertCircle className="w-4 h-4 shrink-0" />}
            <span className="font-medium">
              {uploadStatus === "running" && "Processing uploaded files\u2026"}
              {uploadStatus === "success" && "Files processed and data pushed to Supabase!"}
              {uploadStatus === "error" && "Processing encountered errors. Check logs below."}
            </span>
          </div>

          {uploadLogs && (
            <details open={uploadStatus === "error"}>
              <summary className="text-xs font-medium text-slate-400 cursor-pointer hover:text-slate-600 transition-colors flex items-center gap-1.5 select-none">
                <Terminal className="w-3.5 h-3.5" /> Processing Log
              </summary>
              <div className="mt-2 bg-slate-900 rounded-lg border border-slate-800 p-4 font-mono text-xs text-slate-300 overflow-y-auto whitespace-pre-wrap max-h-[300px]">
                {uploadLogs}
              </div>
            </details>
          )}

          {/* Lead Pipeline failure CTA */}
          {uploadStatus === "error" && lastFailedSource === "leads" && (
            <div className="flex items-start gap-3 p-4 bg-orange-50 border border-orange-200 rounded-lg">
              <Monitor className="w-5 h-5 text-orange-500 shrink-0 mt-0.5" />
              <div className="flex-grow space-y-2">
                <p className="text-sm font-semibold text-orange-800">Lead Pipeline automation failed</p>
                <p className="text-xs text-orange-700">
                  This automation runs on your local computer. It requires a browser (Playwright) to scrape data from DeerDama (Ricochet). 
                  If the automation encounters an issue, ensure your Ricochet credentials are configured in <code>excel-report-automation/config/config.json</code>.
                </p>
                <p className="text-xs text-orange-700">
                  Instead, you can <span className="font-semibold">manually enter lead data</span> using the button below.
                </p>
                <Button 
                  onClick={() => { setLeadsModalOpen(true); setUploadStatus("idle"); setLastFailedSource(null); }}
                  size="sm" 
                  className="bg-orange-600 hover:bg-orange-500 text-white text-xs"
                >
                  <Pencil className="w-3 h-3 mr-1.5" /> Enter Lead Data Manually
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ Source Checklist + Sync Calendar — side by side ═══ */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">

        {/* Left: Source Checklist */}
        <div className="space-y-3">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">Source Checklist</h2>
            </div>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 ml-[38px]">
              Showing coverage for <span className="font-semibold text-slate-600 dark:text-slate-300">{new Date(date + "T12:00:00").toLocaleDateString("en-US", { month: "numeric", day: "numeric" })}</span>
            </p>
          </div>
          <div className="grid grid-cols-1 gap-2.5">
            {DATA_SOURCES.map((source) => {
              const Icon = source.icon
              const colors = SOURCE_COLORS[source.color]
              const cov = coverage?.[source.key]
              const isPresent = cov?.present ?? false
              const agentsWithData = cov?.agentCount ?? 0
              const sourceFiles = filesForSource(source.key)
              const isProcessing = uploading && sourceFiles.length > 0

              return (
                <SourceCard
                  key={source.key}
                  source={source}
                  Icon={Icon}
                  colors={colors}
                  isPresent={isPresent}
                  agentsWithData={agentsWithData}
                  isProcessing={isProcessing}
                  coverageLoaded={!!coverage}
                  date={date}
                  subSources={cov?.subSources}
                  isUnavailable={cov?.unavailable ?? false}
                  onToggleUnavailable={async () => {
                    const result = await toggleSourceUnavailable(date, source.key)
                    if (result.success) {
                      // Refresh coverage
                      const covResult = await getDailyCoverage(date)
                      if (covResult.success && covResult.data) setCoverage(covResult.data as CoverageData)
                    }
                  }}
                  onAutoScrape={(key) => handleUpload(key)}
                  onManualLeads={source.key === "leads" ? () => setLeadsModalOpen(true) : undefined}
                />
              )
            })}
          </div>
        </div>

        {/* Right: Sync Calendar */}
        <div className="space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
              <CalendarDays className="w-4 h-4" />
            </div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">Sync Calendar</h2>
            <span className="text-xs text-slate-400 dark:text-slate-500">— click a date to fill gaps</span>
          </div>
          <SyncCalendar
            selectedDate={date}
            refreshTrigger={refreshTrigger}
            onDateSelect={(d) => setDate(d)}
            onGapClick={handleGapClick}
          />
        </div>
      </div>

      {/* ═══ Sticky Upload Action Bar ═══ */}
      {stagedFiles.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm border-t border-slate-200 dark:border-slate-800 shadow-lg">
          <div className="max-w-7xl mx-auto px-6 lg:px-8 py-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Upload className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {stagedFiles.length} file{stagedFiles.length !== 1 ? "s" : ""} staged
                </span>
              </div>
              {stagedFiles.filter(f => f.type === "unknown").length > 0 && (
                <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                  ({stagedFiles.filter(f => f.type === "unknown").length} unrecognized — won&apos;t process)
                </span>
              )}
              <button onClick={() => setStagedFiles([])} className="text-xs text-slate-400 hover:text-red-500 transition-colors ml-2">
                Clear all
              </button>
            </div>
            <Button
              onClick={() => handleUpload()}
              disabled={uploading || validFiles.length === 0}
              className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 shrink-0"
            >
              {uploading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Processing…
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Upload className="w-4 h-4" /> Process & Upload {validFiles.length} file{validFiles.length !== 1 ? "s" : ""}
                </span>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* ═══ Upload History ═══ */}
      <UploadHistory refreshTrigger={refreshTrigger} />

      {/* ═══ Data Dictionary (collapsible) ═══ */}
      <div className="border border-blue-200 dark:border-blue-900/50 rounded-xl bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
        <button
          onClick={() => setDictionaryOpen(!dictionaryOpen)}
          className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-blue-50/50 dark:hover:bg-blue-950/30 transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <Info className="w-4.5 h-4.5 text-blue-500" />
            <span className="text-sm font-semibold text-blue-700 dark:text-blue-400">Data Sources Dictionary</span>
            <span className="text-xs text-slate-400 dark:text-slate-500">— where every number comes from</span>
          </div>
          <ChevronDown className={`w-4 h-4 text-blue-400 transition-transform duration-200 ${dictionaryOpen ? "rotate-180" : ""}`} />
        </button>
        {dictionaryOpen && (
          <div className="px-5 pb-5 border-t border-blue-100 dark:border-blue-900/40 pt-4 space-y-3 max-h-[700px] overflow-auto">
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
        )}
      </div>
    </div>

    {/* ═══ Leads Manual Entry Modal ═══ */}
    <LeadsModal
      isOpen={leadsModalOpen}
      onClose={() => setLeadsModalOpen(false)}
      dateStr={date}
      onSuccess={() => setRefreshTrigger(prev => prev + 1)}
    />
  </>
  )
}

// ─── Source Card Component ────────────────────────────────────────────────────

function SourceCard({
  source,
  Icon,
  colors,
  isPresent,
  agentsWithData,
  isProcessing,
  coverageLoaded,
  date,
  subSources,
  isUnavailable,
  onToggleUnavailable,
  onAutoScrape,
  onManualLeads,
}: {
  source: DataSource
  Icon: React.ComponentType<{ className?: string }>
  colors: { bg: string; border: string; text: string; light: string; missing: string }
  isPresent: boolean
  agentsWithData: number
  isProcessing: boolean
  coverageLoaded: boolean
  date: string
  subSources?: Record<string, boolean>
  isUnavailable: boolean
  onToggleUnavailable: () => void
  onAutoScrape?: (key: string) => void
  onManualLeads?: () => void
}) {
  const canUpload = !source.isManualEntry && !source.isAutomatic && source.uploadTypes.length > 0
  const [toggling, setToggling] = useState(false)

  // Left border accent — three states
  const borderAccent = isPresent
    ? "border-l-4 border-l-emerald-500 dark:border-l-emerald-400"
    : isUnavailable && coverageLoaded
      ? "border-l-4 border-l-slate-400 dark:border-l-slate-500"
      : coverageLoaded
        ? "border-l-4 border-l-red-500 dark:border-l-red-400"
        : "border-l-4 border-l-slate-200 dark:border-l-slate-700"

  // Container styling — three states
  const containerClass = isPresent
    ? "bg-white dark:bg-slate-900"
    : isUnavailable && coverageLoaded
      ? "ring-1 ring-slate-200/60 dark:ring-slate-700/30 bg-slate-50/50 dark:bg-slate-800/30"
      : !isPresent && coverageLoaded
        ? "ring-1 ring-rose-200/60 dark:ring-red-900/30 bg-rose-50/30 dark:bg-red-950/20"
        : "bg-white dark:bg-slate-900"

  const borderClass = isPresent
    ? colors.border
    : isUnavailable && coverageLoaded
      ? "border-slate-200 dark:border-slate-700"
      : !isPresent && coverageLoaded
        ? "border-rose-200 dark:border-red-900/40"
        : colors.border

  // Header background
  const headerBg = isPresent
    ? "bg-gradient-to-r from-emerald-50 to-transparent dark:from-emerald-950/40 dark:to-transparent"
    : isUnavailable && coverageLoaded
      ? "bg-slate-50/50 dark:bg-slate-800/30"
      : !isPresent && coverageLoaded
        ? "bg-rose-50/50 dark:bg-red-950/30"
        : ""

  return (
    <div
      className={`rounded-lg border ${borderClass} shadow-sm overflow-hidden transition-all duration-300 ${borderAccent} ${containerClass}`}
    >
      <div className={`flex items-center gap-2.5 px-3 py-2 ${headerBg}`}>
        {/* Icon */}
        <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${
          isUnavailable && !isPresent && coverageLoaded
            ? "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500"
            : `${colors.bg} ${colors.text}`
        }`}>
          <Icon className="w-3.5 h-3.5" />
        </div>

        {/* Label + badge + subtitle */}
        <div className="flex-grow min-w-0">
          <div className="flex items-center gap-1.5">
            <h3 className={`text-xs font-bold ${
              isUnavailable && !isPresent && coverageLoaded
                ? "text-slate-400 dark:text-slate-500"
                : "text-slate-900 dark:text-slate-100"
            }`}>{source.label}</h3>
            <Badge variant="outline" className={`text-[9px] px-1 py-0 shrink-0 ${colors.bg} ${colors.text} ${colors.border}`}>
              {source.system}
            </Badge>
          </div>
          {/* How-to-get hint — only show when missing (not unavailable) */}
          {!isPresent && coverageLoaded && !isUnavailable && (
            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 leading-tight">{source.howToGet}</p>
          )}
          {/* Sub-source indicators for calls */}
          {source.uploadTypes.length > 1 && coverageLoaded && subSources && (
            <div className="flex items-center gap-1.5 mt-1">
              {source.filePatterns.map((fp) => {
                const uploaded = subSources[fp.type] ?? false
                return (
                  <span
                    key={fp.type}
                    className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-semibold border ${
                      uploaded
                        ? "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/60 dark:text-emerald-200 dark:border-emerald-700"
                        : "bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-900/60 dark:text-rose-200 dark:border-rose-700"
                    }`}
                  >
                    {uploaded ? "✓" : "✗"} {fp.label}
                  </span>
                )
              })}
            </div>
          )}
        </div>

        {/* Action buttons (inline) */}
        {source.isManualEntry && (
          <Link href={`/reports/daily?date=${date}`} className="shrink-0">
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-rose-600 dark:text-rose-400 hover:text-rose-500 transition-colors whitespace-nowrap">
              <ExternalLink className="w-3 h-3" /> Daily Report
            </span>
          </Link>
        )}

        {source.isAutomatic && (
          <div className="flex items-center gap-1.5 shrink-0">
            {onManualLeads && (
              <Button onClick={onManualLeads} size="sm" variant="outline" className="h-6 text-[10px] px-2 border-orange-200 dark:border-orange-900/60 text-orange-700 dark:text-orange-300 hover:bg-orange-50 dark:hover:bg-orange-950/40">
                <Pencil className="w-2.5 h-2.5 mr-1" /> Manual
              </Button>
            )}
            <Button onClick={() => {
              if (window.confirm(
                "⚡ Run Lead Pipeline Auto-Scraper?\n\n" +
                "This will launch a local browser automation to log in to DeerDama (Ricochet), download the latest LeadSwami snapshot, and sync to Supabase.\n\n" +
                "Do you want to proceed?"
              )) {
                onAutoScrape?.(source.key)
              }
            }} size="sm" variant="outline" className="h-6 text-[10px] px-2">
              <Zap className="w-2.5 h-2.5 mr-1" /> {isPresent ? "Re-sync" : "Run"}
            </Button>
          </div>
        )}

        {/* Mark Unavailable toggle — show when source is not present and not manual entry */}
        {!isPresent && coverageLoaded && !source.isManualEntry && (
          <button
            onClick={async () => {
              setToggling(true)
              try {
                await onToggleUnavailable()
              } finally {
                setToggling(false)
              }
            }}
            disabled={toggling}
            className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-semibold border transition-colors ${
              toggling
                ? "bg-slate-100 dark:bg-slate-800 text-slate-300 dark:text-slate-600 border-slate-200 dark:border-slate-700 cursor-wait"
                : isUnavailable
                  ? "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600 hover:bg-slate-300 dark:hover:bg-slate-600"
                  : "bg-white dark:bg-slate-800 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-700 hover:text-slate-600 dark:hover:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600"
            }`}
            title={isUnavailable ? "Remove unavailable mark" : "Mark this source as unavailable for this date"}
          >
            {toggling ? (
              <Loader2 className="w-2.5 h-2.5 animate-spin" />
            ) : (
              <Ban className="w-2.5 h-2.5" />
            )}
            {toggling ? "Updating..." : isUnavailable ? "Unavailable" : "Mark N/A"}
          </button>
        )}

        {/* Status indicator */}
        <div className="shrink-0 ml-auto pl-2">
          {isProcessing ? (
            <span className="flex items-center gap-1 text-[10px] font-medium text-blue-600 dark:text-blue-400 whitespace-nowrap">
              <Loader2 className="w-3 h-3 animate-spin" /> Processing
            </span>
          ) : isPresent ? (
            <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
              <CheckCircle2 className="w-3 h-3" />
              {source.key !== "eagent" ? `${agentsWithData}` : "✓"}
            </span>
          ) : isUnavailable && coverageLoaded ? (
            <span className="flex items-center gap-1 text-[10px] font-semibold text-slate-400 dark:text-slate-500 whitespace-nowrap">
              <Ban className="w-3 h-3" /> N/A
            </span>
          ) : coverageLoaded ? (
            <span className="flex items-center gap-1 text-[10px] font-bold text-red-600 dark:text-red-500 whitespace-nowrap">
              <AlertCircle className="w-3 h-3" /> Missing
            </span>
          ) : (
            <RefreshCw className="w-3 h-3 animate-spin text-slate-400" />
          )}
        </div>
      </div>

      {/* Localhost warning — only for Lead Pipeline, collapsed to a thin bar */}
      {source.isAutomatic && (
        <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-50 dark:bg-amber-950/40 border-t border-amber-100 dark:border-amber-900/50 text-[10px] text-amber-700 dark:text-amber-300">
          <Monitor className="w-3 h-3 shrink-0" />
          <span><span className="font-semibold">Localhost only</span> — Runs local browser scraper</span>
        </div>
      )}
    </div>
  )
}

// ─── Dictionary Item (preserved from original) ───────────────────────────────

function DictionaryItem({ metric, source, method, location, description, type }: {
  metric: string; source: string; method: string; location: string; description: string; type: string
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
