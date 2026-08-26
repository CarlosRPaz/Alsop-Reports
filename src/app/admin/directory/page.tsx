"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabaseClient"
import { ArrowLeft, Plus, Search, Building2, Users, Save, Trash2, Edit2, X } from "lucide-react"
import Link from "next/link"
import { DirectoryGroup, DirectoryEntry } from "@/types/directory"

export default function AdminDirectoryPage() {
  const [groups, setGroups] = useState<DirectoryGroup[]>([])
  const [entries, setEntries] = useState<DirectoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [dbMissing, setDbMissing] = useState(false)
  const [message, setMessage] = useState("")

  const [activeTab, setActiveTab] = useState<"groups"|"entries">("groups")

  // Modals / Forms state
  const [showGroupForm, setShowGroupForm] = useState(false)
  const [showEntryForm, setShowEntryForm] = useState(false)
  const [editGroup, setEditGroup] = useState<Partial<DirectoryGroup> | null>(null)
  const [editEntry, setEditEntry] = useState<Partial<DirectoryEntry> | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const { data: gData, error: gErr } = await supabase.from("directory_groups").select("*").order("display_order")
      if (gErr) {
        if (gErr.code === '42P01') {
          setDbMissing(true)
          setLoading(false)
          return
        }
        throw gErr
      }
      setGroups(gData || [])
      
      const { data: eData, error: eErr } = await supabase.from("directory_entries").select("*").order("display_order")
      if (eErr) throw eErr
      setEntries(eData || [])
      
    } catch (err: any) {
      console.error(err)
      setMessage(err.message || "Failed to load data")
    } finally {
      setLoading(false)
    }
  }

  async function saveGroup(e: React.FormEvent) {
    e.preventDefault()
    try {
      const isNew = !editGroup?.id
      const payload = {
        name: editGroup?.name,
        slug: editGroup?.slug || editGroup?.name?.toLowerCase().replace(/\s+/g, '-'),
        group_type: editGroup?.group_type || 'custom',
        address: editGroup?.address || null,
        office_phone: editGroup?.office_phone || null,
        fax: editGroup?.fax || null,
        toll_free_phone: editGroup?.toll_free_phone || null,
        email: editGroup?.email || null,
        office_identifiers: editGroup?.office_identifiers || null,
        display_order: editGroup?.display_order || 0,
        is_active: editGroup?.is_active ?? true,
      }

      if (isNew) {
        const { error } = await supabase.from("directory_groups").insert(payload)
        if (error) throw error
      } else {
        const { error } = await supabase.from("directory_groups").update(payload).eq('id', editGroup.id)
        if (error) throw error
      }
      setMessage("Group saved successfully!")
      setShowGroupForm(false)
      loadData()
    } catch (err: any) {
      setMessage("Error: " + err.message)
    }
  }

  async function saveEntry(e: React.FormEvent) {
    e.preventDefault()
    try {
      const isNew = !editEntry?.id
      const payload = {
        group_id: editEntry?.group_id,
        name: editEntry?.name,
        position: editEntry?.position || null,
        role: editEntry?.role || null,
        sca_code: editEntry?.sca_code || null,
        sub_code: editEntry?.sub_code || null,
        email: editEntry?.email || null,
        ricochet_phone: editEntry?.ricochet_phone || null,
        ring_central_phone: editEntry?.ring_central_phone || null,
        primary_phone: editEntry?.primary_phone || null,
        secondary_phone: editEntry?.secondary_phone || null,
        notes: editEntry?.notes || null,
        display_order: editEntry?.display_order || 0,
        is_active: editEntry?.is_active ?? true,
      }

      if (isNew) {
        const { error } = await supabase.from("directory_entries").insert(payload)
        if (error) throw error
      } else {
        const { error } = await supabase.from("directory_entries").update(payload).eq('id', editEntry.id)
        if (error) throw error
      }
      setMessage("Contact saved successfully!")
      setShowEntryForm(false)
      loadData()
    } catch (err: any) {
      setMessage("Error: " + err.message)
    }
  }

  async function deleteGroup(id: string) {
    if (!confirm("Are you sure? This will delete all contacts in this group!")) return
    try {
      const { error } = await supabase.from("directory_groups").delete().eq('id', id)
      if (error) throw error
      loadData()
    } catch (err: any) {
      setMessage("Error: " + err.message)
    }
  }

  async function deleteEntry(id: string) {
    if (!confirm("Are you sure you want to delete this contact?")) return
    try {
      const { error } = await supabase.from("directory_entries").delete().eq('id', id)
      if (error) throw error
      loadData()
    } catch (err: any) {
      setMessage("Error: " + err.message)
    }
  }

  if (dbMissing) {
    return (
      <div className="p-8 max-w-7xl mx-auto space-y-4">
        <Link href="/admin" className="text-blue-600 flex items-center gap-2 mb-4 hover:underline">
          <ArrowLeft className="w-4 h-4" /> Back to Admin Panel
        </Link>
        <h1 className="text-2xl font-bold text-red-600">Database Setup Required</h1>
        <p>Please run the migration script and seed the directory database tables.</p>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6 min-h-screen text-slate-800">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/admin" className="text-blue-600 flex items-center gap-2 mb-4 hover:underline text-sm font-medium">
            <ArrowLeft className="w-4 h-4" /> Back to Admin Panel
          </Link>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 flex items-center gap-3">
            Directory Management
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Manage groups and contacts for the Office Directory.
          </p>
        </div>
        <div>
          <button 
            onClick={() => {
              if (activeTab === "groups") { setEditGroup({ is_active: true, display_order: 0 }); setShowGroupForm(true) }
              else { setEditEntry({ is_active: true, display_order: 0, group_id: groups[0]?.id }); setShowEntryForm(true) }
            }}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" /> Add {activeTab === "groups" ? "Group" : "Contact"}
          </button>
        </div>
      </div>

      {message && (
        <div className="bg-blue-50 text-blue-800 p-4 rounded-xl text-sm border border-blue-200 flex justify-between">
          <span>{message}</span>
          <button onClick={() => setMessage("")}><X className="w-4 h-4"/></button>
        </div>
      )}

      <div className="flex gap-4 border-b border-slate-200">
        <button 
          onClick={() => setActiveTab("groups")} 
          className={`pb-2 px-2 text-sm font-semibold border-b-2 transition-colors ${activeTab === "groups" ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-800"}`}
        >
          Groups ({groups.length})
        </button>
        <button 
          onClick={() => setActiveTab("entries")} 
          className={`pb-2 px-2 text-sm font-semibold border-b-2 transition-colors ${activeTab === "entries" ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-800"}`}
        >
          Contacts ({entries.length})
        </button>
      </div>

      {loading ? (
        <div className="animate-pulse space-y-4">
          <div className="h-12 bg-slate-100 rounded-xl" />
          <div className="h-12 bg-slate-100 rounded-xl" />
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          {activeTab === "groups" ? (
             <div className="space-y-2">
               {groups.map(g => (
                 <div key={g.id} className="p-4 border rounded-lg flex justify-between items-center hover:bg-slate-50 transition-colors">
                    <div>
                      <div className="font-bold flex items-center gap-2">
                        {g.name} 
                        {!g.is_active && <span className="bg-slate-200 text-slate-600 text-[10px] px-1.5 py-0.5 rounded">Inactive</span>}
                      </div>
                      <div className="text-xs text-slate-500 mt-1">Type: {g.group_type} • Order: {g.display_order}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => { setEditGroup(g); setShowGroupForm(true) }} className="p-2 text-slate-400 hover:text-blue-600"><Edit2 className="w-4 h-4"/></button>
                      <button onClick={() => deleteGroup(g.id)} className="p-2 text-slate-400 hover:text-red-600"><Trash2 className="w-4 h-4"/></button>
                    </div>
                 </div>
               ))}
             </div>
          ) : (
            <div className="space-y-2">
               {entries.map(e => {
                 const g = groups.find(x => x.id === e.group_id)
                 return (
                   <div key={e.id} className="p-4 border rounded-lg flex justify-between items-center hover:bg-slate-50 transition-colors">
                      <div>
                        <div className="font-bold flex items-center gap-2">
                          {e.name}
                          {!e.is_active && <span className="bg-slate-200 text-slate-600 text-[10px] px-1.5 py-0.5 rounded">Inactive</span>}
                        </div>
                        <div className="text-xs text-slate-500 mt-1">
                          {e.position || 'No Position'} • Group: {g?.name || 'Unknown'} • Order: {e.display_order}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => { setEditEntry(e); setShowEntryForm(true) }} className="p-2 text-slate-400 hover:text-blue-600"><Edit2 className="w-4 h-4"/></button>
                        <button onClick={() => deleteEntry(e.id)} className="p-2 text-slate-400 hover:text-red-600"><Trash2 className="w-4 h-4"/></button>
                      </div>
                   </div>
                 )
               })}
             </div>
          )}
        </div>
      )}

      {/* Group Form Modal */}
      {showGroupForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">{editGroup?.id ? 'Edit Group' : 'Add Group'}</h2>
            <form onSubmit={saveGroup} className="space-y-4">
              <div><label className="block text-sm font-medium mb-1">Name</label><input required type="text" className="w-full border rounded-lg p-2" value={editGroup?.name || ''} onChange={e => setEditGroup({...editGroup, name: e.target.value})} /></div>
              <div><label className="block text-sm font-medium mb-1">Type</label>
                <select className="w-full border rounded-lg p-2" value={editGroup?.group_type || 'custom'} onChange={e => setEditGroup({...editGroup, group_type: e.target.value as any})}>
                  <option value="office">Office</option>
                  <option value="custom">HQ (Custom Group)</option>
                  <option value="helpful_numbers">Helpful Numbers</option>
                  <option value="carriers">Carriers</option>
                </select>
              </div>
              <div><label className="block text-sm font-medium mb-1">Address</label><input type="text" className="w-full border rounded-lg p-2" value={editGroup?.address || ''} onChange={e => setEditGroup({...editGroup, address: e.target.value})} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="block text-sm font-medium mb-1">Phone</label><input type="text" className="w-full border rounded-lg p-2" value={editGroup?.office_phone || ''} onChange={e => setEditGroup({...editGroup, office_phone: e.target.value})} /></div>
                <div><label className="block text-sm font-medium mb-1">Fax</label><input type="text" className="w-full border rounded-lg p-2" value={editGroup?.fax || ''} onChange={e => setEditGroup({...editGroup, fax: e.target.value})} /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="block text-sm font-medium mb-1">Toll Free Phone</label><input type="text" className="w-full border rounded-lg p-2" value={editGroup?.toll_free_phone || ''} onChange={e => setEditGroup({...editGroup, toll_free_phone: e.target.value})} /></div>
                <div><label className="block text-sm font-medium mb-1">Email</label><input type="email" className="w-full border rounded-lg p-2" value={editGroup?.email || ''} onChange={e => setEditGroup({...editGroup, email: e.target.value})} /></div>
              </div>
              <div><label className="block text-sm font-medium mb-1">Identifiers (Space Separated)</label><input type="text" className="w-full border rounded-lg p-2" value={editGroup?.office_identifiers || ''} onChange={e => setEditGroup({...editGroup, office_identifiers: e.target.value})} /></div>
              <div><label className="block text-sm font-medium mb-1">Display Order</label><input type="number" className="w-full border rounded-lg p-2" value={editGroup?.display_order || 0} onChange={e => setEditGroup({...editGroup, display_order: parseInt(e.target.value)})} /></div>
              <div className="flex items-center gap-2"><input type="checkbox" checked={editGroup?.is_active ?? true} onChange={e => setEditGroup({...editGroup, is_active: e.target.checked})} /> <label>Active</label></div>
              
              <div className="flex gap-2 pt-4">
                <button type="submit" className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700">Save</button>
                <button type="button" onClick={() => setShowGroupForm(false)} className="flex-1 bg-slate-100 text-slate-700 py-2 rounded-lg font-medium hover:bg-slate-200">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Entry Form Modal */}
      {showEntryForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">{editEntry?.id ? 'Edit Contact' : 'Add Contact'}</h2>
            <form onSubmit={saveEntry} className="space-y-4">
              <div><label className="block text-sm font-medium mb-1">Group</label>
                <select required className="w-full border rounded-lg p-2" value={editEntry?.group_id || ''} onChange={e => setEditEntry({...editEntry, group_id: e.target.value})}>
                  <option value="">Select Group...</option>
                  {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>
              <div><label className="block text-sm font-medium mb-1">Name / Carrier</label><input required type="text" className="w-full border rounded-lg p-2" value={editEntry?.name || ''} onChange={e => setEditEntry({...editEntry, name: e.target.value})} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="block text-sm font-medium mb-1">Position / Team</label><input type="text" className="w-full border rounded-lg p-2" value={editEntry?.position || ''} onChange={e => setEditEntry({...editEntry, position: e.target.value})} /></div>
                <div><label className="block text-sm font-medium mb-1">Role / Department</label><input type="text" className="w-full border rounded-lg p-2" value={editEntry?.role || ''} onChange={e => setEditEntry({...editEntry, role: e.target.value})} /></div>
              </div>
              <div><label className="block text-sm font-medium mb-1">Email</label><input type="email" className="w-full border rounded-lg p-2" value={editEntry?.email || ''} onChange={e => setEditEntry({...editEntry, email: e.target.value})} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="block text-sm font-medium mb-1">Primary Phone</label><input type="text" className="w-full border rounded-lg p-2" value={editEntry?.primary_phone || ''} onChange={e => setEditEntry({...editEntry, primary_phone: e.target.value})} /></div>
                <div><label className="block text-sm font-medium mb-1">Secondary Phone</label><input type="text" className="w-full border rounded-lg p-2" value={editEntry?.secondary_phone || ''} onChange={e => setEditEntry({...editEntry, secondary_phone: e.target.value})} /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="block text-sm font-medium mb-1">SCA Code</label><input type="text" className="w-full border rounded-lg p-2" value={editEntry?.sca_code || ''} onChange={e => setEditEntry({...editEntry, sca_code: e.target.value})} /></div>
                <div><label className="block text-sm font-medium mb-1">Sub Code</label><input type="text" className="w-full border rounded-lg p-2" value={editEntry?.sub_code || ''} onChange={e => setEditEntry({...editEntry, sub_code: e.target.value})} /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="block text-sm font-medium mb-1">Ricochet</label><input type="text" className="w-full border rounded-lg p-2" value={editEntry?.ricochet_phone || ''} onChange={e => setEditEntry({...editEntry, ricochet_phone: e.target.value})} /></div>
                <div><label className="block text-sm font-medium mb-1">RingCentral</label><input type="text" className="w-full border rounded-lg p-2" value={editEntry?.ring_central_phone || ''} onChange={e => setEditEntry({...editEntry, ring_central_phone: e.target.value})} /></div>
              </div>
              <div><label className="block text-sm font-medium mb-1">Notes</label><textarea className="w-full border rounded-lg p-2" value={editEntry?.notes || ''} onChange={e => setEditEntry({...editEntry, notes: e.target.value})} /></div>
              <div><label className="block text-sm font-medium mb-1">Display Order</label><input type="number" className="w-full border rounded-lg p-2" value={editEntry?.display_order || 0} onChange={e => setEditEntry({...editEntry, display_order: parseInt(e.target.value)})} /></div>
              <div className="flex items-center gap-2"><input type="checkbox" checked={editEntry?.is_active ?? true} onChange={e => setEditEntry({...editEntry, is_active: e.target.checked})} /> <label>Active</label></div>
              
              <div className="flex gap-2 pt-4">
                <button type="submit" className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700">Save</button>
                <button type="button" onClick={() => setShowEntryForm(false)} className="flex-1 bg-slate-100 text-slate-700 py-2 rounded-lg font-medium hover:bg-slate-200">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}
