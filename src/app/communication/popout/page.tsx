'use client'

import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useChat } from '@/lib/chat/chatContext'
import { fetchConversationsForAgent, getOrCreateDirectDM, createConversation } from '@/lib/chat/conversations'
import { markNotificationRead } from '@/lib/chat/notifications'
import { supabase } from '@/lib/supabaseClient'
import type { Conversation, Agent } from '@/components/chat/types'
import { MiniChatRoom } from '@/components/chat/MiniChatRoom'
import CreateConversationModal from '@/components/chat/CreateConversationModal'
import { Plus, AtSign, ChevronDown, Hash, ChevronLeft } from 'lucide-react'

// Basic avatar color generator based on name
const AVATAR_COLORS = [
  'bg-blue-500', 'bg-emerald-500', 'bg-violet-500', 'bg-amber-500', 
  'bg-rose-500', 'bg-cyan-500', 'bg-indigo-500', 'bg-teal-500'
]
function getAvatarColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

function UserAvatar({ agent, sizeClass = "w-[22px] h-[22px] text-[10px]" }: { agent: any, sizeClass?: string }) {
  if (agent?.avatar_url) {
    return <img src={agent.avatar_url} alt={agent.name} className={`rounded-full object-cover shrink-0 ${sizeClass}`} />
  }
  const initials = agent?.name?.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase() || '?'
  const color = agent?.name ? getAvatarColor(agent.name) : 'bg-slate-500'
  return (
    <div className={`rounded-full shrink-0 flex items-center justify-center font-semibold text-white ${color} ${sizeClass}`}>
      {initials}
    </div>
  )
}

export default function PopoutPage() {
  const { currentAgent, unreadCounts } = useChat()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedConversation, setSelectedConversation] = useState<{ id: string, name: string } | null>(null)
  
  const [sidebarWidth, setSidebarWidth] = useState(260)
  const isDragging = useRef(false)
  const [activeTab, setActiveTab] = useState<'recents' | 'mentions'>('recents')
  const [mentions, setMentions] = useState<any[]>([])
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = 'auto' }
  }, [])

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768)
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    if (!currentAgent) return
    async function loadConversations() {
      try {
        const convos = await fetchConversationsForAgent(currentAgent!.id)
        setConversations(convos)
        if (convos.length > 0 && !isMobile) {
           setSelectedConversation({ id: convos[0].id, name: convos[0].name || 'Chat' })
        }
      } catch (err) {
        console.error("Failed to load popout conversations:", err)
      }
    }
    loadConversations()
  }, [currentAgent, isMobile])

  useEffect(() => {
    if (activeTab === 'mentions' && currentAgent) {
      supabase
        .from('chat_notifications')
        .select('*')
        .eq('agent_id', currentAgent.id)
        .in('type', ['mention'])
        .order('created_at', { ascending: false })
        .limit(20)
        .then(({ data }) => setMentions(data || []))
    }
  }, [activeTab, currentAgent])

  const handleMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true
    document.body.style.cursor = 'col-resize'
  }

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return
      let newWidth = e.clientX
      if (newWidth < 200) newWidth = 200
      if (newWidth > 500) newWidth = 500
      setSidebarWidth(newWidth)
    }
    const handleMouseUp = () => {
      isDragging.current = false
      document.body.style.cursor = 'default'
    }
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  const handleMentionClick = async (notif: any) => {
    if (!notif.is_read) {
      await markNotificationRead(notif.id)
      setMentions(prev => prev.map(m => m.id === notif.id ? { ...m, is_read: true } : m))
    }
    setSelectedConversation({ id: notif.conversation_id, name: notif.title || 'Chat' })
  }

  if (!currentAgent) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 text-sm text-slate-500 bg-[#1a1a1a]">
        Loading or not logged in...
      </div>
    )
  }

  const showSidebar = !isMobile || !selectedConversation

  return (
    <div className="w-full h-screen overflow-hidden flex bg-white font-sans text-[13px] relative">
      <style dangerouslySetInnerHTML={{__html: `
        .popout-sidebar { width: ${sidebarWidth}px; }
        @media (max-width: 768px) {
          .popout-sidebar { width: 100% !important; }
        }
      `}} />

      {/* Sidebar */}
      {showSidebar && (
        <div className="popout-sidebar bg-[#1c1c1e] text-slate-300 flex flex-col h-full shrink-0 relative">
          
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 pb-2">
            <h1 className="text-[17px] font-bold text-white tracking-tight">Team Chat</h1>
            <button 
              onClick={() => setShowCreateModal(true)}
              className="w-[26px] h-[26px] rounded bg-blue-600 text-white flex items-center justify-center hover:bg-blue-500 transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {/* Top Nav */}
          <div className="flex flex-col px-2 mt-2 space-y-0.5">
            <button 
              onClick={() => setActiveTab(activeTab === 'mentions' ? 'recents' : 'mentions')}
              className={`flex items-center gap-3 px-3 py-1.5 rounded transition cursor-pointer text-left ${activeTab === 'mentions' ? 'bg-white/10 text-white' : 'hover:bg-white/10 text-slate-300'}`}
            >
              <div className={`w-[22px] h-[22px] rounded-full flex items-center justify-center shrink-0 ${activeTab === 'mentions' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-white'}`}>
                <AtSign className="w-3.5 h-3.5" />
              </div>
              Mentions
            </button>
          </div>

          {/* Sections */}
          <div className="mt-4 flex-1 overflow-y-auto px-2 pb-4 flex flex-col no-scrollbar">
            {activeTab === 'recents' ? (
              <>
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
                    const otherMember = convo.members?.find((m: any) => m.agent_id !== currentAgent.id)?.agent
                    
                    const dmName = otherMember?.name || convo.name || 'Chat'
                    const unread = unreadCounts?.[convo.id] || 0

                    return (
                      <button 
                        key={convo.id}
                        onClick={() => setSelectedConversation({ id: convo.id, name: (isChannel ? convo.name : dmName) || 'Chat' })}
                        className={`w-full flex items-center justify-between gap-2.5 px-2 py-1.5 rounded-lg transition cursor-pointer text-left ${
                          isActive ? 'bg-blue-600 text-white font-medium' : 'hover:bg-white/10 text-slate-300 hover:text-white'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {isChannel ? (
                            <div className={`w-[22px] h-[22px] rounded shrink-0 flex items-center justify-center ${isActive ? 'text-white/80' : 'text-slate-400'}`}>
                              <Hash className="w-4 h-4" />
                            </div>
                          ) : (
                            <UserAvatar agent={otherMember || { name: convo.name || '?' }} />
                          )}
                          <span className="truncate leading-tight">
                            {isChannel ? convo.name : dmName}
                          </span>
                        </div>
                        {unread > 0 && (
                          <div className={`${isActive ? 'bg-white text-blue-600' : 'bg-blue-600 text-white'} text-[10px] font-bold min-w-[18px] h-[18px] flex items-center justify-center rounded-full px-1 shrink-0 ml-1`}>
                            {unread > 99 ? '99+' : unread}
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
              </>
            ) : (
              <div className="flex flex-col gap-2 px-2">
                <div className="text-sm font-semibold text-white mb-2">Recent Mentions</div>
                {mentions.length > 0 ? mentions.map(notif => (
                  <div 
                    key={notif.id}
                    onClick={() => handleMentionClick(notif)}
                    className={`p-2 rounded-lg cursor-pointer transition ${notif.is_read ? 'bg-white/5 opacity-70' : 'bg-white/10 shadow-sm border border-white/10'}`}
                  >
                    <div className="text-[13px] text-white font-medium mb-1 truncate">{notif.title}</div>
                    <div className="text-xs text-slate-400 line-clamp-2">{notif.body?.replace(/<[^>]*>/g, '')}</div>
                  </div>
                )) : (
                  <div className="text-sm text-slate-500 italic mt-4 text-center">No mentions yet.</div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Resize Handle */}
      {!isMobile && (
        <div 
          onMouseDown={handleMouseDown}
          className="w-1 cursor-col-resize hover:bg-blue-500 bg-slate-800 shrink-0 z-10 transition-colors"
        />
      )}
      
      {/* Main Chat Area */}
      {(!isMobile || selectedConversation) && (
        <div className="flex-1 flex flex-col h-full bg-white relative min-w-0">
           {isMobile && selectedConversation && (
             <div className="shrink-0 h-12 border-b border-slate-100 flex items-center px-2">
               <button 
                 onClick={() => setSelectedConversation(null)}
                 className="flex items-center text-slate-500 hover:text-slate-800"
               >
                 <ChevronLeft className="w-5 h-5 mr-1" />
                 Back
               </button>
             </div>
           )}

           {selectedConversation ? (
             <MiniChatRoom 
               conversationId={selectedConversation.id} 
               conversationName={selectedConversation.name}
               onBack={() => setSelectedConversation(null)}
               onClose={() => {}}
               hideHeaderActions={true}
             />
           ) : (
             <div className="flex-1 flex items-center justify-center text-slate-500 bg-slate-50">
               Select a conversation to start chatting
             </div>
           )}
        </div>
      )}

      {showCreateModal && (
        <CreateConversationModal
          currentAgent={currentAgent}
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          defaultTab="dm"
          onCreateDM={async (agentId: string) => {
            try {
              const convo = await getOrCreateDirectDM(currentAgent.id, agentId)
              if (convo) {
                setShowCreateModal(false)
                const convos = await fetchConversationsForAgent(currentAgent.id)
                setConversations(convos)
                const match = convos.find(c => c.id === convo.id)
                if (match) {
                  const otherMember = match.members?.find((m: any) => m.agent_id !== currentAgent.id)?.agent
                  const name = match.type !== 'direct_dm' ? match.name : (otherMember?.name || match.name || 'Chat')
                  setSelectedConversation({ id: match.id, name: name || 'Chat' })
                }
              }
            } catch (err) {
              console.error('Failed to create DM:', err)
              throw err
            }
          }}
          onCreateGroup={async (name: string, memberIds: string[]) => {
            const convo = await createConversation({
              type: 'group_dm',
              name,
              created_by: currentAgent.id,
              member_ids: [currentAgent.id, ...memberIds],
            })
            if (convo) {
              setShowCreateModal(false)
              const convos = await fetchConversationsForAgent(currentAgent.id)
              setConversations(convos)
              const match = convos.find(c => c.id === convo.id)
              if (match) setSelectedConversation({ id: match.id, name: match.name || 'Chat' })
            }
          }}
          onCreateChannel={async (name: string, description: string, icon: string, teams: string[]) => {
            const convo = await createConversation({
              type: 'channel',
              name,
              description,
              created_by: currentAgent.id,
              member_ids: [currentAgent.id],
            })
            if (convo) {
              setShowCreateModal(false)
              const convos = await fetchConversationsForAgent(currentAgent.id)
              setConversations(convos)
              const match = convos.find(c => c.id === convo.id)
              if (match) setSelectedConversation({ id: match.id, name: match.name || 'Chat' })
            }
          }}
        />
      )}
    </div>
  )
}

