"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabaseClient"
import { Card, CardContent } from "@/components/ui/Card"
import { Badge } from "@/components/ui/Badge"
import { Users, Mail, Phone, HardHat } from "lucide-react"

export default function StaffPage() {
  const [agents, setAgents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadAgents() {
      try {
        const { data } = await supabase
          .from("agents")
          .select("id, name, email, phone, office, team, role, active")
          .eq("active", true)
          .order("name", { ascending: true })
        setAgents(data || [])
      } catch (err) {
        console.error("Error loading staff:", err)
      } finally {
        setLoading(false)
      }
    }
    loadAgents()
  }, [])

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6 min-h-screen text-slate-800">
      
      {/* ── Friendly Cute Under Construction Banner ────────────────────────── */}
      <div className="bg-gradient-to-r from-amber-400 via-orange-400 to-amber-500 rounded-2xl p-6 md:p-8 text-slate-950 shadow-lg border border-amber-300 relative overflow-hidden flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="space-y-2 text-center md:text-left z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-950 text-amber-300 font-black text-xs shadow-sm">
            <HardHat className="w-4 h-4" /> Work in Progress!
          </div>
          <h1 className="text-2xl md:text-3xl font-black tracking-tight">
            Our Wonderful Agency Staff Directory
          </h1>
          <p className="text-sm font-semibold text-slate-900 max-w-xl leading-relaxed">
            We&apos;re currently polishing up this space with photos, extensions, direct lines, and office shortcuts! 🚧✨ In the meantime, here&apos;s our active team roster.
          </p>
        </div>

        <div className="text-6xl md:text-7xl shrink-0 select-none animate-bounce z-10">
          👷‍♀️🛠️
        </div>

        {/* Decorative background glow */}
        <div className="absolute -top-12 -right-12 w-48 h-48 bg-white/20 rounded-full blur-2xl pointer-events-none" />
      </div>

      {/* ── Active Staff Roster Preview ────────────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-600" />
            <h2 className="text-lg font-black text-slate-900">
              Active Team Members ({agents.length})
            </h2>
          </div>
          <Badge variant="outline" className="text-xs font-mono bg-white">
            Alsop & Associates Roster
          </Badge>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
              <div key={i} className="h-32 bg-slate-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {agents.map(agent => (
              <Card key={agent.id} className="border-slate-200 shadow-xs hover:shadow-md transition-shadow bg-white">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center font-black text-white text-sm shadow-xs shrink-0">
                      {agent.name.split(" ").map((n: string) => n[0]).join("").substring(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-sm text-slate-900 truncate">{agent.name}</h3>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {agent.team && (
                          <Badge variant={agent.team === "Sales" ? "default" : "success"} className="text-[9px] py-0 px-1.5">
                            {agent.team}
                          </Badge>
                        )}
                        {agent.office && (
                          <Badge variant="outline" className="text-[9px] font-mono py-0 px-1">
                            {agent.office}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1 text-xs text-slate-500 border-t border-slate-100 pt-2.5">
                    {agent.email && (
                      <div className="flex items-center gap-1.5 truncate">
                        <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">{agent.email}</span>
                      </div>
                    )}
                    {agent.phone && (
                      <div className="flex items-center gap-1.5 truncate">
                        <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{agent.phone}</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

    </div>
  )
}
