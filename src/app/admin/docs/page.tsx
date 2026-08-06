"use client"

import { useState, useMemo, useEffect, useCallback } from "react"
import {
  Database, BarChart2, CalendarDays, TrendingUp, Users, ShieldCheck,
  MessageSquare, BookOpen, Target, Code, Search, ChevronRight,
  ArrowLeft, X, ExternalLink, FileText, Tag, Lightbulb, AlertTriangle,
  HelpCircle, Table2, List, Hash, Terminal, Home, Info
} from "lucide-react"
import Link from "next/link"
import { DOCS_SECTIONS, type DocSection, type DocArticle, type DocContent } from "./docs-content"
import { createSupabaseBrowserClient } from "@/lib/supabaseBrowser"

// ─── Icon map ──────────────────────────────────────────────────────────────

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Database, BarChart2, CalendarDays, TrendingUp, Users, ShieldCheck,
  MessageSquare, BookOpen, Target, Code, FileText,
}

// ─── Color map ─────────────────────────────────────────────────────────────

const COLOR_MAP: Record<string, { bg: string; text: string; border: string; badge: string; pill: string }> = {
  emerald: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", badge: "bg-emerald-100 text-emerald-700", pill: "bg-emerald-500" },
  blue:    { bg: "bg-blue-50",    text: "text-blue-700",    border: "border-blue-200",    badge: "bg-blue-100 text-blue-700",    pill: "bg-blue-500"    },
  violet:  { bg: "bg-violet-50",  text: "text-violet-700",  border: "border-violet-200",  badge: "bg-violet-100 text-violet-700",  pill: "bg-violet-500"  },
  amber:   { bg: "bg-amber-50",   text: "text-amber-700",   border: "border-amber-200",   badge: "bg-amber-100 text-amber-700",   pill: "bg-amber-500"   },
  sky:     { bg: "bg-sky-50",     text: "text-sky-700",     border: "border-sky-200",     badge: "bg-sky-100 text-sky-700",     pill: "bg-sky-500"     },
  rose:    { bg: "bg-rose-50",    text: "text-rose-700",    border: "border-rose-200",    badge: "bg-rose-100 text-rose-700",    pill: "bg-rose-500"    },
  teal:    { bg: "bg-teal-50",    text: "text-teal-700",    border: "border-teal-200",    badge: "bg-teal-100 text-teal-700",    pill: "bg-teal-500"    },
  indigo:  { bg: "bg-indigo-50",  text: "text-indigo-700",  border: "border-indigo-200",  badge: "bg-indigo-100 text-indigo-700",  pill: "bg-indigo-500"  },
  orange:  { bg: "bg-orange-50",  text: "text-orange-700",  border: "border-orange-200",  badge: "bg-orange-100 text-orange-700",  pill: "bg-orange-500"  },
  slate:   { bg: "bg-slate-50",   text: "text-slate-700",   border: "border-slate-200",   badge: "bg-slate-100 text-slate-700",   pill: "bg-slate-500"   },
}

// ─── Content renderer ──────────────────────────────────────────────────────

function renderContent(block: DocContent, idx: number) {
  switch (block.type) {
    case "p":
      return <p key={idx} className="text-slate-600 leading-relaxed text-sm">{block.text}</p>

    case "heading":
      return <h3 key={idx} className="font-semibold text-slate-800 text-sm mt-4 mb-1">{block.text}</h3>

    case "steps":
      return (
        <ol key={idx} className="space-y-2 my-1">
          {block.items.map((step, i) => (
            <li key={i} className="flex gap-3 text-sm text-slate-600">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs font-bold mt-0.5">{i + 1}</span>
              <span className="leading-relaxed">{step}</span>
            </li>
          ))}
        </ol>
      )

    case "list":
      return (
        <ul key={idx} className="space-y-1 my-1">
          {block.items.map((item, i) => (
            <li key={i} className="flex gap-2 text-sm text-slate-600">
              <span className="text-slate-400 mt-1">•</span>
              <span className="leading-relaxed">{item}</span>
            </li>
          ))}
        </ul>
      )

    case "note":
      return (
        <div key={idx} className="flex gap-2.5 p-3 rounded-lg bg-blue-50 border border-blue-100 my-2">
          <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-blue-700 leading-relaxed">{block.text}</p>
        </div>
      )

    case "warning":
      return (
        <div key={idx} className="flex gap-2.5 p-3 rounded-lg bg-amber-50 border border-amber-100 my-2">
          <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-700 leading-relaxed">{block.text}</p>
        </div>
      )

    case "faq":
      return (
        <div key={idx} className="border border-slate-200 rounded-lg overflow-hidden my-2">
          <div className="flex gap-2 px-3 py-2.5 bg-slate-50 border-b border-slate-200">
            <HelpCircle className="w-4 h-4 text-slate-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm font-medium text-slate-700">{block.q}</p>
          </div>
          <div className="px-3 py-2.5">
            <p className="text-sm text-slate-600 leading-relaxed">{block.a}</p>
          </div>
        </div>
      )

    case "kpi":
      return (
        <div key={idx} className="border border-slate-200 rounded-lg overflow-hidden my-2">
          <div className="px-3 py-2 bg-slate-900 flex items-center gap-2">
            <Hash className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-sm font-semibold text-white">{block.name}</span>
          </div>
          <div className="p-3 space-y-1.5">
            <p className="text-sm text-slate-600 leading-relaxed">{block.sourceDetail}</p>
            <div className="flex flex-wrap gap-2 pt-1">
              <span className="inline-flex items-center gap-1 text-xs bg-indigo-50 text-indigo-700 border border-indigo-100 rounded px-2 py-0.5">
                <Tag className="w-3 h-3" /> Source: {block.source}
              </span>
              {block.column && (
                <span className="inline-flex items-center gap-1 text-xs bg-slate-100 text-slate-600 border border-slate-200 rounded px-2 py-0.5 font-mono">
                  {block.column}
                </span>
              )}
            </div>
          </div>
        </div>
      )

    case "kpis":
      return (
        <div key={idx} className="space-y-2 my-2">
          {block.items.map((kpi, i) => (
            <div key={i} className="border border-slate-200 rounded-lg overflow-hidden">
              <div className="px-3 py-2 bg-slate-900 flex items-center gap-2">
                <Hash className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-sm font-semibold text-white">{kpi.name}</span>
              </div>
              <div className="p-3 space-y-1.5">
                <p className="text-sm text-slate-600 leading-relaxed">{kpi.sourceDetail}</p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <span className="inline-flex items-center gap-1 text-xs bg-indigo-50 text-indigo-700 border border-indigo-100 rounded px-2 py-0.5">
                    <Tag className="w-3 h-3" /> Source: {kpi.source}
                  </span>
                  {kpi.column && (
                    <span className="inline-flex items-center gap-1 text-xs bg-slate-100 text-slate-600 border border-slate-200 rounded px-2 py-0.5 font-mono">
                      {kpi.column}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )

    case "table":
      return (
        <div key={idx} className="my-3 overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-900">
                {block.headers.map((h, i) => (
                  <th key={i} className="px-3 py-2 text-left text-xs font-semibold text-slate-300 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {block.rows.map((row, i) => (
                <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                  {row.map((cell, j) => (
                    <td key={j} className={`px-3 py-2 text-slate-600 leading-relaxed align-top ${j === 0 ? "font-medium text-slate-800 whitespace-nowrap" : ""}`}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )

    case "code":
      return (
        <pre key={idx} className="my-3 p-3 bg-slate-900 text-slate-200 rounded-lg text-xs overflow-x-auto font-mono leading-relaxed border border-slate-700">
          {block.text}
        </pre>
      )

    default:
      return null
  }
}

// ─── Search result types ────────────────────────────────────────────────────

interface SearchResult {
  type: "doc"
  section: DocSection
  article: DocArticle
  relevance: number
}

interface LiveResult {
  type: "agent"
  name: string
  office?: string
  team?: string
}

type AnyResult = SearchResult | LiveResult

// ─── Main page ─────────────────────────────────────────────────────────────

export default function AdminDocsPage() {
  const [activeSection, setActiveSection] = useState<string>(DOCS_SECTIONS[0].id)
  const [activeArticle, setActiveArticle] = useState<string>(DOCS_SECTIONS[0].articles[0].slug)
  const [searchQuery, setSearchQuery] = useState("")
  const [searchFocused, setSearchFocused] = useState(false)
  const [liveResults, setLiveResults] = useState<LiveResult[]>([])
  const [liveLoading, setLiveLoading] = useState(false)
  const supabase = createSupabaseBrowserClient()

  // Current section/article
  const currentSection = DOCS_SECTIONS.find(s => s.id === activeSection) ?? DOCS_SECTIONS[0]
  const currentArticle = currentSection.articles.find(a => a.slug === activeArticle) ?? currentSection.articles[0]

  // Doc search
  const docResults = useMemo<SearchResult[]>(() => {
    if (!searchQuery.trim() || searchQuery.length < 2) return []
    const q = searchQuery.toLowerCase()
    const results: SearchResult[] = []
    for (const section of DOCS_SECTIONS) {
      for (const article of section.articles) {
        let relevance = 0
        if (article.title.toLowerCase().includes(q)) relevance += 10
        if (article.tags.some(t => t.toLowerCase().includes(q))) relevance += 6
        // Check content text
        for (const block of article.content) {
          if ("text" in block && typeof block.text === "string" && block.text.toLowerCase().includes(q)) relevance += 2
          if (block.type === "kpi" && block.name.toLowerCase().includes(q)) relevance += 8
          if (block.type === "kpis") {
            for (const kpi of block.items) {
              if (kpi.name.toLowerCase().includes(q)) relevance += 8
            }
          }
          if (block.type === "faq") {
            if (block.q.toLowerCase().includes(q)) relevance += 5
            if (block.a.toLowerCase().includes(q)) relevance += 2
          }
          if (block.type === "table") {
            for (const row of block.rows) {
              if (row.some(c => c.toLowerCase().includes(q))) relevance += 1
            }
          }
        }
        if (relevance > 0) results.push({ type: "doc", section, article, relevance })
      }
    }
    return results.sort((a, b) => b.relevance - a.relevance).slice(0, 8)
  }, [searchQuery])

  // Live data search (agents)
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.length < 2) {
      setLiveResults([])
      return
    }
    const timeout = setTimeout(async () => {
      setLiveLoading(true)
      try {
        const { data } = await supabase
          .from("agents")
          .select("name, office, team")
          .ilike("name", `%${searchQuery}%`)
          .eq("active", true)
          .limit(3)
        setLiveResults(data?.map(a => ({ type: "agent" as const, name: a.name, office: a.office, team: a.team })) ?? [])
      } finally {
        setLiveLoading(false)
      }
    }, 300)
    return () => clearTimeout(timeout)
  }, [searchQuery, supabase])

  const hasResults = docResults.length > 0 || liveResults.length > 0

  const navigateTo = useCallback((sectionId: string, slug: string) => {
    setActiveSection(sectionId)
    setActiveArticle(slug)
    setSearchQuery("")
  }, [])

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">

      {/* ─── Sidebar ─────────────────────────────────────────────────────── */}
      <aside className="w-64 flex-shrink-0 bg-white border-r border-slate-200 flex flex-col overflow-hidden">

        {/* Header */}
        <div className="p-4 border-b border-slate-200">
          <Link
            href="/admin"
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors mb-3"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Admin Panel
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-slate-900 flex items-center justify-center flex-shrink-0">
              <BookOpen className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-slate-900 leading-none">Admin Docs</h1>
              <p className="text-xs text-slate-500 mt-0.5">Site guide & reference</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {DOCS_SECTIONS.map(section => {
            const Icon = ICON_MAP[section.icon] ?? FileText
            const colors = COLOR_MAP[section.color] ?? COLOR_MAP.slate
            const isActive = section.id === activeSection
            return (
              <div key={section.id}>
                <button
                  onClick={() => {
                    setActiveSection(section.id)
                    setActiveArticle(section.articles[0].slug)
                  }}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-all text-sm ${
                    isActive
                      ? `${colors.bg} ${colors.text} font-semibold`
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? colors.text : "text-slate-400"}`} />
                  <span className="truncate">{section.title}</span>
                  {isActive && <ChevronRight className={`w-3.5 h-3.5 ml-auto flex-shrink-0 ${colors.text}`} />}
                </button>

                {/* Articles under active section */}
                {isActive && (
                  <div className="ml-6 mt-0.5 space-y-0.5">
                    {section.articles.map(article => (
                      <button
                        key={article.slug}
                        onClick={() => setActiveArticle(article.slug)}
                        className={`w-full text-left px-2.5 py-1.5 rounded-md text-xs transition-all ${
                          article.slug === activeArticle
                            ? `${colors.text} font-semibold`
                            : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        {article.title}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        {/* Footer version note */}
        <div className="p-3 border-t border-slate-100">
          <p className="text-xs text-slate-400 text-center">
            Last updated by developer.<br />
            <span className="text-slate-300">See Developer Guide to add docs.</span>
          </p>
        </div>
      </aside>

      {/* ─── Main content ────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col overflow-hidden">

        {/* Top bar with search */}
        <div className="flex-shrink-0 bg-white border-b border-slate-200 px-6 py-3 flex items-center gap-4">
          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 text-xs text-slate-500 min-w-0 flex-shrink-0">
            <span className="font-medium text-slate-700 truncate">{currentSection.title}</span>
            <ChevronRight className="w-3 h-3 flex-shrink-0" />
            <span className="truncate text-slate-500">{currentArticle.title}</span>
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Search */}
          <div className="relative w-72">
            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all ${
              searchFocused ? "border-slate-400 ring-2 ring-slate-200" : "border-slate-200"
            } bg-white`}>
              <Search className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
              <input
                type="text"
                placeholder="Search docs, KPIs, agents..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
                className="flex-1 text-xs outline-none bg-transparent text-slate-700 placeholder-slate-400"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")} className="flex-shrink-0">
                  <X className="w-3.5 h-3.5 text-slate-400 hover:text-slate-600" />
                </button>
              )}
            </div>

            {/* Search dropdown */}
            {searchFocused && searchQuery.length >= 2 && (
              <div className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden z-50">
                {!hasResults && !liveLoading && (
                  <div className="px-4 py-5 text-center">
                    <p className="text-xs text-slate-500">No results for "{searchQuery}"</p>
                  </div>
                )}

                {/* Doc results */}
                {docResults.length > 0 && (
                  <div>
                    <div className="px-3 pt-2.5 pb-1 flex items-center gap-1.5">
                      <FileText className="w-3 h-3 text-slate-400" />
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Documentation</span>
                    </div>
                    {docResults.map((r, i) => {
                      const colors = COLOR_MAP[r.section.color] ?? COLOR_MAP.slate
                      return (
                        <button
                          key={i}
                          onMouseDown={() => navigateTo(r.section.id, r.article.slug)}
                          className="w-full flex items-start gap-3 px-3 py-2.5 hover:bg-slate-50 transition-colors text-left"
                        >
                          <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 mt-0.5 ${colors.bg}`}>
                            <Hash className={`w-3 h-3 ${colors.text}`} />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-slate-800 truncate">{r.article.title}</p>
                            <p className="text-xs text-slate-400 truncate">{r.section.title}</p>
                          </div>
                          <ChevronRight className="w-3.5 h-3.5 text-slate-300 flex-shrink-0 mt-1 ml-auto" />
                        </button>
                      )
                    })}
                  </div>
                )}

                {/* Live agent results */}
                {liveResults.length > 0 && (
                  <div className="border-t border-slate-100">
                    <div className="px-3 pt-2.5 pb-1 flex items-center gap-1.5">
                      <Users className="w-3 h-3 text-slate-400" />
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Agents (Live)</span>
                    </div>
                    {liveResults.map((r, i) => (
                      <button
                        key={i}
                        onMouseDown={() => navigateTo("agents", "agents-overview")}
                        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 transition-colors text-left"
                      >
                        <div className="w-5 h-5 rounded-full bg-sky-100 flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-bold text-sky-600">{r.name.charAt(0)}</span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-slate-800 truncate">{r.name}</p>
                          {(r.office || r.team) && (
                            <p className="text-xs text-slate-400 truncate">{[r.team, r.office].filter(Boolean).join(" · ")}</p>
                          )}
                        </div>
                        <ExternalLink className="w-3 h-3 text-slate-300 ml-auto flex-shrink-0" />
                      </button>
                    ))}
                  </div>
                )}

                {liveLoading && (
                  <div className="px-4 py-2 text-xs text-slate-400">Searching agents...</div>
                )}

                <div className="px-3 py-2 bg-slate-50 border-t border-slate-100">
                  <p className="text-xs text-slate-400">Press Enter or click a result</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Article content */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-8 py-8">

            {/* Section pill */}
            <div className="flex items-center gap-2 mb-4">
              {(() => {
                const Icon = ICON_MAP[currentSection.icon] ?? FileText
                const colors = COLOR_MAP[currentSection.color] ?? COLOR_MAP.slate
                return (
                  <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${colors.badge}`}>
                    <Icon className="w-3.5 h-3.5" />
                    {currentSection.title}
                  </span>
                )
              })()}
            </div>

            {/* Article title */}
            <h2 className="text-2xl font-bold text-slate-900 mb-1">{currentArticle.title}</h2>
            
            {/* Tags */}
            {currentArticle.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-6">
                {currentArticle.tags.slice(0, 6).map(tag => (
                  <span
                    key={tag}
                    onClick={() => setSearchQuery(tag)}
                    className="text-xs text-slate-500 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded px-2 py-0.5 cursor-pointer transition-colors"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Content */}
            <div className="space-y-3">
              {currentArticle.content.map((block, idx) => renderContent(block, idx))}
            </div>

            {/* Article navigation */}
            <div className="mt-10 pt-6 border-t border-slate-200 flex items-center justify-between">
              {/* Prev article */}
              {(() => {
                const idx = currentSection.articles.findIndex(a => a.slug === activeArticle)
                const prev = currentSection.articles[idx - 1]
                if (!prev) return <div />
                return (
                  <button
                    onClick={() => setActiveArticle(prev.slug)}
                    className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 transition-colors group"
                  >
                    <ChevronRight className="w-4 h-4 rotate-180 group-hover:-translate-x-0.5 transition-transform" />
                    <div className="text-left">
                      <p className="text-xs text-slate-400">Previous</p>
                      <p className="font-medium">{prev.title}</p>
                    </div>
                  </button>
                )
              })()}
              {/* Next article */}
              {(() => {
                const idx = currentSection.articles.findIndex(a => a.slug === activeArticle)
                const next = currentSection.articles[idx + 1]
                if (!next) return <div />
                return (
                  <button
                    onClick={() => setActiveArticle(next.slug)}
                    className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 transition-colors group ml-auto"
                  >
                    <div className="text-right">
                      <p className="text-xs text-slate-400">Next</p>
                      <p className="font-medium">{next.title}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                  </button>
                )
              })()}
            </div>

          </div>
        </div>
      </main>

    </div>
  )
}
