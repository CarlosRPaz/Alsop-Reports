"use client"

import { useState } from "react"
import { Card } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { Badge } from "@/components/ui/Badge"
import { MessageSquare, Hash, UserCircle, Send } from "lucide-react"

const ROOMS = ["All", "Managers", "Sales", "Service"]

// Mock Data for UI
const ONLINE_AGENTS = [
  { id: 1, name: "Carlos Paz", role: "Admin", presence: "online" },
  { id: 2, name: "Teyssy", role: "Agent", presence: "busy" },
  { id: 3, name: "Elizabeth", role: "Agent", presence: "away" },
]

export default function CommunicationHub() {
  const [activeTab, setActiveTab] = useState("All")
  const [message, setMessage] = useState("")
  
  // Real implementation would fetch messages from Supabase based on activeTab room
  const [messages, setMessages] = useState([
    { id: 1, sender: "System", content: "Welcome to the new Hub!", time: "09:00 AM" },
    { id: 2, sender: "Carlos Paz", content: "Great work everyone on the MTD numbers.", time: "10:15 AM" }
  ])

  const handleSend = () => {
    if (!message.trim()) return;
    setMessages(prev => [...prev, {
      id: Date.now(),
      sender: "You",
      content: message,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }])
    setMessage("")
  }

  const getPresenceColor = (status: string) => {
    switch (status) {
      case 'online': return 'bg-emerald-500';
      case 'away': return 'bg-amber-500';
      case 'busy': return 'bg-red-500';
      default: return 'bg-slate-500';
    }
  }

  return (
    <div className="p-8 max-w-[1400px] mx-auto h-[calc(100vh-2rem)] flex flex-col space-y-6">
      <div className="bg-amber-100 text-amber-800 p-3 text-center text-sm font-medium rounded-md shadow-sm border border-amber-200 shrink-0">
        🚧 Under Construction; message Charlie with requests
      </div>
      <header className="flex justify-between items-center shrink-0">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-100">Communication Hub</h1>
          <p className="text-slate-400 mt-1">Unified messaging and agency announcements.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-400">Your Status:</span>
          <select className="bg-slate-800 border border-slate-700 rounded-md text-sm p-1.5 text-slate-200 outline-none focus:border-blue-500">
            <option value="online">🟢 Online</option>
            <option value="away">🟡 Away</option>
            <option value="busy">🔴 Busy</option>
          </select>
        </div>
      </header>

      <div className="flex flex-1 gap-6 min-h-0">
        
        {/* Left Sidebar - Rooms & Direct Messages */}
        <Card className="w-64 flex flex-col shrink-0">
          <div className="p-4 border-b border-slate-800">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Channels</h3>
          </div>
          <div className="p-2 space-y-1">
            {ROOMS.map(room => (
              <button
                key={room}
                onClick={() => setActiveTab(room)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                  activeTab === room ? "bg-blue-600/20 text-blue-400 font-medium" : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                }`}
              >
                <Hash className="w-4 h-4" />
                {room}
              </button>
            ))}
          </div>

          <div className="p-4 border-b border-t border-slate-800 mt-4">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex justify-between">
              Direct Messages
              <Badge variant="outline" className="text-[10px] py-0 px-1">Beta</Badge>
            </h3>
          </div>
          <div className="p-2 space-y-1 overflow-y-auto custom-scrollbar flex-1">
            {ONLINE_AGENTS.map(agent => (
              <button
                key={agent.id}
                onClick={() => setActiveTab(agent.name)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors ${
                  activeTab === agent.name ? "bg-blue-600/20 text-blue-400 font-medium" : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                }`}
              >
                <div className="flex items-center gap-3">
                  <UserCircle className="w-4 h-4" />
                  {agent.name}
                </div>
                <div className={`w-2 h-2 rounded-full ${getPresenceColor(agent.presence)}`} />
              </button>
            ))}
          </div>
        </Card>

        {/* Main Chat Area */}
        <Card className="flex-1 flex flex-col bg-slate-900/50">
          <div className="p-4 border-b border-slate-800 flex items-center gap-2">
            {ROOMS.includes(activeTab) ? <Hash className="w-5 h-5 text-slate-400" /> : <UserCircle className="w-5 h-5 text-slate-400" />}
            <h2 className="text-lg font-semibold text-slate-200">{activeTab}</h2>
          </div>
          
          <div className="flex-1 p-6 overflow-y-auto flex flex-col gap-4 custom-scrollbar">
            {messages.map(msg => (
              <div key={msg.id} className={`flex flex-col max-w-[80%] ${msg.sender === "You" ? "self-end items-end" : "self-start items-start"}`}>
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-sm font-medium text-slate-300">{msg.sender}</span>
                  <span className="text-xs text-slate-500">{msg.time}</span>
                </div>
                <div className={`p-3 rounded-2xl text-sm ${
                  msg.sender === "You" ? "bg-blue-600 text-white rounded-br-sm" : "bg-slate-800 text-slate-200 rounded-bl-sm"
                }`}>
                  {msg.content}
                </div>
              </div>
            ))}
          </div>

          <div className="p-4 border-t border-slate-800">
            <div className="flex gap-2">
              <input 
                type="text" 
                value={message}
                onChange={e => setMessage(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSend()}
                placeholder={`Message ${activeTab}...`}
                className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-4 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
              />
              <Button onClick={handleSend} disabled={!message.trim()}>
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </Card>

      </div>
    </div>
  )
}
