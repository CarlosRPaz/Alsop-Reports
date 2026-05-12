"use client"

import { useState } from "react"
import { Card } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { Badge } from "@/components/ui/Badge"
import { MessageSquare, Hash, UserCircle, Send, Trash2, CheckCircle2 } from "lucide-react"

const ROOMS = ["All", "Managers", "Sales", "Service"]

// Mock Data for UI
const ONLINE_AGENTS = [
  { id: 1, name: "Carlos Paz", role: "Admin", presence: "online" },
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

  const handleDelete = (id: number) => {
    setMessages(prev => prev.filter(msg => msg.id !== id))
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
      <div className="bg-amber-50 text-amber-800 p-3 text-center text-sm font-medium rounded-md shadow-sm border border-amber-200 shrink-0 flex items-center justify-center gap-2">
        <span className="text-amber-500">🚧</span> Under Construction; message Charlie with requests
      </div>
      <header className="flex justify-between items-center shrink-0">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 flex items-center gap-2">
            Communication Hub
          </h1>
          <p className="text-slate-500 mt-1">Unified messaging and agency announcements.</p>
        </div>
        <div className="flex items-center gap-3 bg-white border border-slate-200 shadow-sm rounded-lg p-1.5 px-3">
          <span className="text-sm font-medium text-slate-500">Status:</span>
          <select className="bg-transparent text-sm font-semibold text-slate-700 outline-none cursor-pointer">
            <option value="online">🟢 Online</option>
            <option value="away">🟡 Away</option>
            <option value="busy">🔴 Busy</option>
          </select>
        </div>
      </header>

      <div className="flex flex-1 gap-6 min-h-0">
        
        {/* Left Sidebar - Rooms & Direct Messages */}
        <Card className="w-64 flex flex-col shrink-0 bg-white border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50/50">
            <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Channels</h3>
          </div>
          <div className="p-2 space-y-0.5">
            {ROOMS.map(room => (
              <button
                key={room}
                onClick={() => setActiveTab(room)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-all duration-200 ${
                  activeTab === room 
                    ? "bg-blue-50 text-blue-700 font-semibold shadow-sm ring-1 ring-blue-600/10" 
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-medium"
                }`}
              >
                <Hash className={`w-4 h-4 ${activeTab === room ? "text-blue-500" : "text-slate-400"}`} />
                {room}
              </button>
            ))}
          </div>

          <div className="p-4 border-b border-t border-slate-100 bg-slate-50/50 mt-2">
            <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest flex justify-between items-center">
              Direct Messages
              <Badge variant="outline" className="text-[9px] py-0 px-1.5 bg-white border-slate-200 text-slate-500">BETA</Badge>
            </h3>
          </div>
          <div className="p-2 space-y-0.5 overflow-y-auto custom-scrollbar flex-1">
            {ONLINE_AGENTS.map(agent => (
              <button
                key={agent.id}
                onClick={() => setActiveTab(agent.name)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-all duration-200 ${
                  activeTab === agent.name 
                    ? "bg-blue-50 text-blue-700 font-semibold shadow-sm ring-1 ring-blue-600/10" 
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-medium"
                }`}
              >
                <div className="flex items-center gap-3">
                  <UserCircle className={`w-4 h-4 ${activeTab === agent.name ? "text-blue-500" : "text-slate-400"}`} />
                  {agent.name}
                </div>
                <div className={`w-2 h-2 rounded-full shadow-sm ring-1 ring-white ${getPresenceColor(agent.presence)}`} />
              </button>
            ))}
          </div>
        </Card>

        {/* Main Chat Area */}
        <Card className="flex-1 flex flex-col bg-white border-slate-200 shadow-sm overflow-hidden">
          {/* Chat Header */}
          <div className="p-4 border-b border-slate-100 bg-white flex items-center gap-3 shadow-sm z-10">
            <div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500">
              {ROOMS.includes(activeTab) ? <Hash className="w-5 h-5" /> : <UserCircle className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 leading-tight">{activeTab}</h2>
              <p className="text-xs font-medium text-slate-400">
                {ROOMS.includes(activeTab) ? "Channel • Agency wide communication" : "Direct Message • End-to-end encrypted"}
              </p>
            </div>
          </div>
          
          {/* Messages */}
          <div className="flex-1 p-6 overflow-y-auto flex flex-col gap-6 custom-scrollbar bg-slate-50/30">
            {messages.map(msg => {
              const isMe = msg.sender === "You";
              return (
                <div key={msg.id} className={`flex flex-col w-full group ${isMe ? "items-end" : "items-start"}`}>
                  <div className="flex items-baseline gap-2 mb-1.5 px-1">
                    <span className="text-[13px] font-bold text-slate-700">{msg.sender}</span>
                    <span className="text-[11px] font-semibold text-slate-400">{msg.time}</span>
                  </div>
                  <div className={`relative flex items-center gap-2 max-w-[75%]`}>
                    {/* Delete button (only shows on hover for your own messages) */}
                    {isMe && (
                      <button 
                        onClick={() => handleDelete(msg.id)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full"
                        title="Delete Message"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                    
                    <div className={`px-4 py-2.5 text-[15px] leading-relaxed shadow-sm ${
                      isMe 
                        ? "bg-blue-600 text-white rounded-2xl rounded-tr-sm" 
                        : msg.sender === "System"
                        ? "bg-slate-100 text-slate-700 rounded-2xl border border-slate-200 font-medium italic"
                        : "bg-white text-slate-800 rounded-2xl rounded-tl-sm border border-slate-200"
                    }`}>
                      {msg.content}
                    </div>
                    
                    {/* Read receipt mock for your own messages */}
                    {isMe && (
                      <div className="absolute -right-5 bottom-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Input Area */}
          <div className="p-4 border-t border-slate-100 bg-white">
            <div className="flex items-end gap-3 bg-slate-50 border border-slate-200 rounded-xl p-2 focus-within:ring-2 focus-within:ring-blue-100 focus-within:border-blue-400 transition-all">
              <textarea 
                value={message}
                onChange={e => setMessage(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder={`Message ${activeTab}...`}
                className="flex-1 bg-transparent border-none px-3 py-2 text-sm text-slate-900 focus:outline-none resize-none min-h-[40px] max-h-[120px]"
                rows={1}
              />
              <Button 
                onClick={handleSend} 
                disabled={!message.trim()}
                className={`rounded-lg px-4 h-10 ${
                  message.trim() ? "bg-blue-600 hover:bg-blue-700 text-white shadow-sm" : "bg-slate-200 text-slate-400"
                }`}
              >
                <Send className="w-4 h-4 mr-2" />
                Send
              </Button>
            </div>
            <div className="flex justify-between items-center mt-2 px-2">
              <p className="text-[11px] font-medium text-slate-400">
                Press <kbd className="font-mono bg-slate-100 border border-slate-200 rounded px-1">Enter</kbd> to send
              </p>
              <p className="text-[11px] font-medium text-slate-400">
                End-to-end encrypted
              </p>
            </div>
          </div>
        </Card>

      </div>
    </div>
  )
}
