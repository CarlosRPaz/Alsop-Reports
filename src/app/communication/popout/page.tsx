'use client'

import React, { useState, useEffect } from 'react'
import { useChat } from '@/lib/chat/chatContext'
import { fetchConversationsForAgent } from '@/lib/chat/conversations'
import type { Conversation } from '@/components/chat/types'
import { MiniChatRoom } from '@/components/chat/MiniChatRoom'
import { Plus, AtSign, PhoneMissed, FileEdit, MoreHorizontal, ChevronDown, Lock, Hash } from 'lucide-react'

export default function PopoutPage() {
  const { currentAgent } = useChat()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedConversation, setSelectedConversation] = useState<{ id: string, name: string } | null>(null)

  useEffect(() => {
    // Modify body to be strictly full height without overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = 'auto'
    }
  }, [])

  useEffect(() => {
    if (!currentAgent) return

    async function loadConversations() {
      try {
        const convos = await fetchConversationsForAgent(currentAgent!.id)
        setConversations(convos)
        
        // Select first convo by default if none selected
        if (convos.length > 0) {
           setSelectedConversation({ id: convos[0].id, name: convos[0].name || 'Chat' })
        }
      } catch (err) {
        console.error("Failed to load popout conversations:", err)
      }
    }

    loadConversations()
  }, [currentAgent])

  if (!currentAgent) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 text-sm text-slate-500 bg-[#1a1a1a]">
        Loading or not logged in...
      </div>
    )
  }

  return (
    <div className="w-full h-screen overflow-hidden flex bg-white font-sans text-[13px]">
      {/* Zoom-style Dark Sidebar */}
      <div className="w-[260px] bg-[#1c1c1e] text-slate-300 flex flex-col h-full border-r border-slate-800 shrink-0">
        
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 pb-2">
          <h1 className="text-[17px] font-bold text-white tracking-tight">Team Chat</h1>
          <button className="w-[26px] h-[26px] rounded bg-blue-600 text-white flex items-center justify-center hover:bg-blue-500 transition cursor-pointer">
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* Top Nav (Static for UI likeness) */}
        <div className="flex flex-col px-2 mt-2 space-y-0.5">
          <button className="flex items-center gap-3 px-3 py-1.5 rounded hover:bg-white/10 transition text-slate-300 cursor-pointer text-left">
            <div className="w-[22px] h-[22px] rounded-full bg-slate-700 flex items-center justify-center text-white shrink-0">
              <AtSign className="w-3.5 h-3.5" />
            </div>
            Mentions
          </button>
          <button className="flex items-center gap-3 px-3 py-1.5 rounded hover:bg-white/10 transition text-slate-300 cursor-pointer text-left">
            <div className="w-[22px] h-[22px] rounded flex items-center justify-center text-slate-400 shrink-0">
              <PhoneMissed className="w-4 h-4" />
            </div>
            Missed calls
          </button>
          <button className="flex items-center gap-3 px-3 py-1.5 rounded bg-white/5 hover:bg-white/10 transition text-slate-300 cursor-pointer text-left">
            <div className="w-[22px] h-[22px] rounded flex items-center justify-center text-slate-400 shrink-0">
              <FileEdit className="w-4 h-4" />
            </div>
            Drafts and sent
          </button>
          <button className="flex items-center gap-3 px-3 py-1.5 rounded hover:bg-white/10 transition text-slate-300 cursor-pointer text-left">
            <div className="w-[22px] h-[22px] rounded flex items-center justify-center text-slate-400 shrink-0">
              <MoreHorizontal className="w-4 h-4" />
            </div>
            More
          </button>
        </div>

        {/* Sections */}
        <div className="mt-4 flex-1 overflow-y-auto px-2 pb-4 flex flex-col no-scrollbar">
          <div className="flex items-center gap-1 px-2 py-1 font-semibold text-white cursor-pointer hover:bg-white/5 rounded text-[15px]">
            Messages <ChevronDown className="w-4 h-4 text-slate-400" />
          </div>
          
          <div className="mt-2 pl-2">
            <div className="flex items-center gap-2 px-2 py-1 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
               Recents
            </div>
            {conversations.map(convo => {
               const isActive = selectedConversation?.id === convo.id
               const isChannel = convo.type !== 'direct_dm'
               
               return (
                 <button 
                   key={convo.id}
                   onClick={() => setSelectedConversation({ id: convo.id, name: convo.name || 'Chat' })}
                   className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg transition cursor-pointer text-left ${
                     isActive ? 'bg-blue-600 text-white font-medium' : 'hover:bg-white/10 text-slate-300 hover:text-white'
                   }`}
                 >
                    {isChannel ? (
                      <div className={`w-[22px] h-[22px] rounded shrink-0 flex items-center justify-center ${isActive ? 'text-white/80' : 'text-slate-400'}`}>
                        <Lock className="w-3.5 h-3.5" />
                      </div>
                    ) : (
                      <div className="w-[22px] h-[22px] rounded-full shrink-0 flex items-center justify-center bg-emerald-600 text-white font-semibold text-[10px]">
                        {convo.name ? convo.name.charAt(0).toUpperCase() : '?'}
                      </div>
                    )}
                    <span className="truncate leading-tight">{convo.name}</span>
                 </button>
               )
            })}
          </div>
        </div>
      </div>
      
      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col h-full bg-white relative min-w-0">
         {selectedConversation ? (
           <MiniChatRoom 
             conversationId={selectedConversation.id} 
             conversationName={selectedConversation.name}
             onBack={() => {}}
             onClose={() => {}}
             hideHeaderActions={true}
           />
         ) : (
           <div className="flex-1 flex items-center justify-center text-slate-500 bg-slate-50">
             Select a conversation to start chatting
           </div>
         )}
      </div>
    </div>
  )
}

