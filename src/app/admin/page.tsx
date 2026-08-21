"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { Users, Settings, Database, ArrowRight, CalendarDays, ShieldCheck, BookOpen } from "lucide-react"
import Link from "next/link"

export default function AdminHub() {
  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto space-y-6 sm:space-y-8 min-h-screen">
      <header>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 flex items-center gap-3">
          <Settings className="w-7 h-7 sm:w-8 sm:h-8 text-slate-500 shrink-0" />
          Admin Control Panel
        </h1>
        <p className="text-slate-500 text-sm sm:text-base mt-1.5">Manage agency data, users, and system integrations.</p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        
        {/* Agent Management Card */}
        <Card className="group hover:border-blue-500/50 transition-colors flex flex-col justify-between">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <Users className="w-5 h-5 text-blue-500 shrink-0" /> Agent Management
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col justify-between">
            <p className="text-slate-500 text-xs sm:text-sm mb-6">
              Manage agency roster, office/team assignments, meeting times, and multi-system name aliases.
            </p>
            <Link href="/admin/agents" className="mt-auto">
              <button className="w-full inline-flex items-center justify-center rounded-lg font-semibold text-xs sm:text-sm transition-all focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 border border-slate-200 bg-white text-slate-700 shadow-xs h-10 py-2 px-4 group-hover:text-blue-600 group-hover:border-blue-600 hover:bg-blue-600 hover:text-white hover:border-blue-600">
                Manage Agents <ArrowRight className="w-4 h-4 ml-2" />
              </button>
            </Link>
          </CardContent>
        </Card>

        {/* User Access Management Card */}
        <Card className="group hover:border-violet-500/50 transition-colors flex flex-col justify-between">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <ShieldCheck className="w-5 h-5 text-violet-500 shrink-0" /> User Access
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col justify-between">
            <p className="text-slate-500 text-xs sm:text-sm mb-6">
              Invite team members, manage login credentials and roles, and configure granular page permissions.
            </p>
            <Link href="/admin/users" className="mt-auto">
              <button className="w-full inline-flex items-center justify-center rounded-lg font-semibold text-xs sm:text-sm transition-all focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 border border-slate-200 bg-white text-slate-700 shadow-xs h-10 py-2 px-4 group-hover:text-violet-600 group-hover:border-violet-600 hover:bg-violet-600 hover:text-white hover:border-violet-600">
                Manage Access <ArrowRight className="w-4 h-4 ml-2" />
              </button>
            </Link>
          </CardContent>
        </Card>

        {/* Goal Management Card */}
        <Card className="group hover:border-amber-500/50 transition-colors flex flex-col justify-between">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <Database className="w-5 h-5 text-amber-500 shrink-0" /> KPI Goals & Targets
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col justify-between">
            <p className="text-slate-500 text-xs sm:text-sm mb-6">
              High-density Target Matrix to set baseline and custom override targets by team or office.
            </p>
            <Link href="/admin/goals" className="mt-auto">
              <button className="w-full inline-flex items-center justify-center rounded-lg font-semibold text-xs sm:text-sm transition-all focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 border border-slate-200 bg-white text-slate-700 shadow-xs h-10 py-2 px-4 group-hover:text-amber-600 group-hover:border-amber-600 hover:bg-amber-600 hover:text-white hover:border-amber-600">
                Manage Goals <ArrowRight className="w-4 h-4 ml-2" />
              </button>
            </Link>
          </CardContent>
        </Card>

        {/* Holiday Calendar Card */}
        <Card className="group hover:border-red-500/50 transition-colors flex flex-col justify-between">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <CalendarDays className="w-5 h-5 text-red-500 shrink-0" /> Holiday Calendar
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col justify-between">
            <p className="text-slate-500 text-xs sm:text-sm mb-6">
              Manage observed holidays and view business day counts for pacing calculations.
            </p>
            <Link href="/admin/holidays" className="mt-auto">
              <button className="w-full inline-flex items-center justify-center rounded-lg font-semibold text-xs sm:text-sm transition-all focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 border border-slate-200 bg-white text-slate-700 shadow-xs h-10 py-2 px-4 group-hover:text-red-600 group-hover:border-red-600 hover:bg-red-600 hover:text-white hover:border-red-600">
                Manage Holidays <ArrowRight className="w-4 h-4 ml-2" />
              </button>
            </Link>
          </CardContent>
        </Card>

        {/* Data Synchronization Card */}
        <Card className="group hover:border-emerald-500/50 transition-colors flex flex-col justify-between">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <Database className="w-5 h-5 text-emerald-500 shrink-0" /> Data Synchronization
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col justify-between">
            <p className="text-slate-500 text-xs sm:text-sm mb-6">
              Upload raw report files, sync data to Supabase, monitor Sync Calendar coverage, and manage manual entries.
            </p>
            <Link href="/admin/sync" className="mt-auto">
              <button className="w-full inline-flex items-center justify-center rounded-lg font-semibold text-xs sm:text-sm transition-all focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 border border-slate-200 bg-white text-slate-700 shadow-xs h-10 py-2 px-4 group-hover:text-emerald-600 group-hover:border-emerald-600 hover:bg-emerald-600 hover:text-white hover:border-emerald-600">
                Manage Data <ArrowRight className="w-4 h-4 ml-2" />
              </button>
            </Link>
          </CardContent>
        </Card>

        {/* Documentation Card */}
        <Card className="group hover:border-slate-500/50 transition-colors flex flex-col justify-between">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <BookOpen className="w-5 h-5 text-slate-500 shrink-0" /> Admin Documentation
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col justify-between">
            <p className="text-slate-500 text-xs sm:text-sm mb-6">
              Site guide, KPI definitions, upload instructions, and troubleshooting for all admins.
            </p>
            <Link href="/admin/docs" className="mt-auto">
              <button className="w-full inline-flex items-center justify-center rounded-lg font-semibold text-xs sm:text-sm transition-all focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 border border-slate-200 bg-white text-slate-700 shadow-xs h-10 py-2 px-4 group-hover:text-slate-800 group-hover:border-slate-800 hover:bg-slate-800 hover:text-white hover:border-slate-800">
                View Docs <ArrowRight className="w-4 h-4 ml-2" />
              </button>
            </Link>
          </CardContent>
        </Card>

      </div>
    </div>
  )
}
