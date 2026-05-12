"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { Users, Settings, Database, ArrowRight, CalendarDays } from "lucide-react"
import Link from "next/link"

export default function AdminHub() {
  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 min-h-screen">
      <header>
        <h1 className="text-3xl font-extrabold text-slate-900 flex items-center gap-3">
          <Settings className="w-8 h-8 text-slate-500" />
          Admin Control Panel
        </h1>
        <p className="text-slate-500 mt-2">Manage agency data, users, and system integrations.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        
        {/* Agent Management Card */}
        <Card className="group hover:border-blue-500/50 transition-colors">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-400" /> Agent Management
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-slate-500 text-sm mb-6">
              Create, edit, archive, and manage office/team assignments for your agency roster.
            </p>
            <Link href="/admin/agents">
              <Button variant="outline" className="w-full group-hover:bg-blue-600 group-hover:text-white group-hover:border-blue-600">
                Manage Agents <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* Goal Management Card */}
        <Card className="group hover:border-amber-500/50 transition-colors">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="w-5 h-5 text-amber-400" /> KPI Goals & Targets
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-slate-500 text-sm mb-6">
              Set Daily, Weekly, Monthly, and YTD performance goals. Target specific offices and teams.
            </p>
            <Link href="/admin/goals">
              <Button variant="outline" className="w-full group-hover:bg-amber-600 group-hover:text-white group-hover:border-amber-600">
                Manage Goals <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* Holiday Calendar Card */}
        <Card className="group hover:border-red-500/50 transition-colors">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-red-400" /> Holiday Calendar
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-slate-500 text-sm mb-6">
              Manage observed holidays and view business day counts for pacing calculations.
            </p>
            <Link href="/admin/holidays">
              <Button variant="outline" className="w-full group-hover:bg-red-600 group-hover:text-white group-hover:border-red-600">
                Manage Holidays <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* Data Synchronization Card */}
        <Card className="group hover:border-emerald-500/50 transition-colors">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="w-5 h-5 text-emerald-400" /> Data Synchronization
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-slate-500 text-sm mb-6">
              Manually trigger the Python DSR pipeline and view the data sources dictionary.
            </p>
            <Link href="/admin/sync">
              <Button variant="outline" className="w-full group-hover:bg-emerald-600 group-hover:text-white group-hover:border-emerald-600">
                Manage Data <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </CardContent>
        </Card>

      </div>
    </div>
  )
}
