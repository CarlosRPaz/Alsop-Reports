"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabaseClient"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { DataTable } from "@/components/ui/DataTable"
import { Button } from "@/components/ui/Button"
import { Badge } from "@/components/ui/Badge"
import { Plus, Edit2, Archive, Check, X, UserMinus } from "lucide-react"

const MEETING_TIMES = ["9:00 AM", "9:10 AM", "9:20 AM", "9:30 AM", "9:40 AM", "9:50 AM"]

export default function AgentManagement() {
  const [agents, setAgents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  
  // Edit State
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<any>({})

  const fetchAgents = async () => {
    setLoading(true)
    const { data } = await supabase.from("agents").select("*").order("name")
    setAgents(data || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchAgents()
  }, [])

  const startEdit = (agent: any) => {
    setEditingId(agent.id)
    setEditForm(agent)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditForm({})
  }

  const saveEdit = async () => {
    try {
      await supabase
        .from("agents")
        .update({
          name: editForm.name,
          team: editForm.team,
          office: editForm.office,
          active: editForm.active,
          meeting_time: editForm.meeting_time || null
        })
        .eq("id", editingId)
      
      setEditingId(null)
      fetchAgents()
    } catch (e) {
      console.error(e)
    }
  }

  const toggleArchive = async (id: string, currentActive: boolean) => {
    try {
      await supabase.from("agents").update({ active: !currentActive }).eq("id", id)
      fetchAgents()
    } catch (e) {
      console.error(e)
    }
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <header className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900">Agent Management</h1>
          <p className="text-slate-500 mt-1">Manage names, offices, teams, meeting times, and archive inactive agents.</p>
        </div>
        <Button className="bg-blue-600 hover:bg-blue-500 text-white">
          <Plus className="w-4 h-4 mr-2" /> New Agent
        </Button>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Agency Roster</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div></div>
          ) : (
            <DataTable 
              columns={["Name", "Office", "Team", "Meeting Time", "Status", "Actions"]}
              data={agents}
              keyExtractor={(item) => item.id}
              renderRow={(item) => {
                const isEditing = editingId === item.id;
                
                return (
                  <>
                    <td className="py-2 px-3">
                      {isEditing ? (
                        <input 
                          type="text" 
                          className="bg-white border border-slate-300 rounded px-2 py-1 text-sm text-slate-900 w-full shadow-sm focus:ring-2 focus:ring-blue-500 outline-none"
                          value={editForm.name}
                          onChange={(e) => setEditForm({...editForm, name: e.target.value})}
                        />
                      ) : (
                        <span className={`font-semibold ${item.active ? 'text-slate-900' : 'text-slate-400'}`}>{item.name}</span>
                      )}
                    </td>

                    <td className="py-2 px-3">
                      {isEditing ? (
                        <select 
                          className="bg-white border border-slate-300 rounded px-2 py-1 text-sm text-slate-900 w-full shadow-sm focus:ring-2 focus:ring-blue-500 outline-none"
                          value={editForm.office || ''}
                          onChange={(e) => setEditForm({...editForm, office: e.target.value})}
                        >
                          <option value="">None</option>
                          <option value="MCM">MCM</option>
                          <option value="MB">MB</option>
                          <option value="RC">RC</option>
                          <option value="CH">CH</option>
                        </select>
                      ) : (
                        <span className={item.active ? 'text-slate-600' : 'text-slate-400'}>{item.office || '-'}</span>
                      )}
                    </td>

                    <td className="py-2 px-3">
                      {isEditing ? (
                        <select 
                          className="bg-white border border-slate-300 rounded px-2 py-1 text-sm text-slate-900 w-full shadow-sm focus:ring-2 focus:ring-blue-500 outline-none"
                          value={editForm.team || ''}
                          onChange={(e) => setEditForm({...editForm, team: e.target.value})}
                        >
                          <option value="">None</option>
                          <option value="Sales">Sales</option>
                          <option value="Service">Service</option>
                          <option value="Managers">Managers</option>
                        </select>
                      ) : (
                        item.team ? <Badge variant={item.active ? "outline" : "default"} className={!item.active ? 'bg-slate-100 text-slate-400 border-none' : ''}>{item.team}</Badge> : '-'
                      )}
                    </td>

                    <td className="py-2 px-3">
                      {isEditing ? (
                        <select 
                          className="bg-white border border-slate-300 rounded px-2 py-1 text-sm text-slate-900 w-full shadow-sm focus:ring-2 focus:ring-blue-500 outline-none"
                          value={editForm.meeting_time || ''}
                          onChange={(e) => setEditForm({...editForm, meeting_time: e.target.value})}
                        >
                          <option value="">None</option>
                          {MEETING_TIMES.map(t => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                      ) : (
                        <span className={`font-mono text-sm ${item.active ? 'text-slate-700' : 'text-slate-400'}`}>
                          {item.meeting_time || <span className="text-slate-300">—</span>}
                        </span>
                      )}
                    </td>

                    <td className="py-2 px-3">
                      {item.active ? (
                        <Badge variant="success">Active</Badge>
                      ) : (
                        <Badge variant="default" className="bg-slate-100 text-slate-500 border border-slate-200">Archived</Badge>
                      )}
                    </td>

                    <td className="py-2 px-3">
                      {isEditing ? (
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={saveEdit} className="text-emerald-600 border-emerald-300 hover:bg-emerald-50">
                            <Check className="w-3 h-3 mr-1" /> Save
                          </Button>
                          <Button variant="ghost" size="sm" onClick={cancelEdit} className="text-slate-500 hover:text-slate-900">
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <Button variant="ghost" size="sm" onClick={() => startEdit(item)} className="text-blue-600 hover:text-blue-700 hover:bg-blue-50">
                            <Edit2 className="w-3 h-3" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => toggleArchive(item.id, item.active)} className={item.active ? "text-amber-600 hover:text-amber-700 hover:bg-amber-50" : "text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"} title={item.active ? "Archive Agent" : "Restore Agent"}>
                            {item.active ? <UserMinus className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                          </Button>
                        </div>
                      )}
                    </td>
                  </>
                )
              }}
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
