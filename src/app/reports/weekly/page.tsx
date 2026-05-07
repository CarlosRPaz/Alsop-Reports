"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { Badge } from "@/components/ui/Badge"

export default function WeeklyReport() {
  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="bg-amber-100 text-amber-800 p-3 text-center text-sm font-medium rounded-md shadow-sm border border-amber-200">
        🚧 Under Construction; message Charlie with requests
      </div>
      <header>
        <h1 className="text-3xl font-extrabold text-slate-100">Weekly Report</h1>
        <p className="text-slate-400">Aggregated performance for the current week.</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex justify-between items-center">
            Weekly Targets
            <Badge variant="warning">Under Construction</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-slate-400">
            This module will be populated with aggregated weekly metrics once the daily ingestion cron is fully operational.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
