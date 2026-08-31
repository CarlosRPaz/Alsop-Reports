'use client'

import React, { useState, useEffect, useMemo, useRef } from 'react'
import { MessageSquare, Maximize2, Minimize2, X, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useChat } from '@/lib/chat/chatContext'
import { supabase } from '@/lib/supabaseClient'
import type { Conversation, PresenceStatus } from '@/components/chat/types'
import { MiniChatRoom } from './MiniChatRoom'
import { MiniChatHub } from './MiniChatHub'

export function FloatingChatWidget() {
  const { currentAgent, unreadCounts, setManualPresence, getLivePresence } = useChat()
  const [isOpen, setIsOpen] = useState(false)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedConversation, setSelectedConversation] = useState<{ id: string, name: string } | null>(null)
  const [hasUnread, setHasUnread] = useState(false)
  
  const totalUnread = useMemo(() => 
    Object.values(unreadCounts).reduce((sum, count) => sum + count, 0),
  [unreadCounts])

  useEffect(() => {
    setHasUnread(totalUnread > 0)
  }, [totalUnread])

  useEffect(() => {
    if (!currentAgent) return

    async function loadConversations() {
      try {
        const { data, error } = await supabase
          .from('chat_conversation_members')
          .select(`
            is_pinned,
            conversations:conversation_id (
              id,
              name,
              type,
              created_at,
              last_message:chat_messages (
                content,
                created_at,
                sender_id
              ),
              members:chat_conversation_members (
                agent_id,
                agent:agents (
                  id,
                  name,
                  avatar_url,
                  presence,
                  last_seen_at
                )
              )
            )
          `)
          .eq('agent_id', currentAgent?.id || '')
          .order('joined_at', { ascending: false })

        if (error) throw error

        const convos = data
          .map((row: any) => ({
            ...row.conversations,
            is_pinned: row.is_pinned,
            last_message: row.conversations.last_message?.[0] || null,
          }))
          .sort((a, b) => {
            const dateA = a.last_message ? new Date(a.last_message.created_at).getTime() : new Date(a.created_at).getTime()
            const dateB = b.last_message ? new Date(b.last_message.created_at).getTime() : new Date(b.created_at).getTime()
            return dateB - dateA
          }) as Conversation[]

        setConversations(convos)
      } catch (err) {
        console.error("Failed to load conversations for widget:", err)
      }
    }

    if (isOpen) {
      loadConversations()
    }
  }, [currentAgent, isOpen])

  const handlePopOut = () => {
    setIsOpen(false)
    window.open('/communication/popout', 'DSR_Chat', 'width=400,height=650,resizable=yes,scrollbars=yes')
  }

  if (!currentAgent) return null

  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col items-end pointer-events-none">
      
      {/* Expanded Widget Panel */}
      <div 
        className={cn(
          "bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col transition-all duration-300 pointer-events-auto origin-bottom-right mb-4",
          isOpen ? "w-[360px] h-[550px] opacity-100 scale-100" : "w-0 h-0 opacity-0 scale-95"
        )}
      >
        {isOpen && (
          selectedConversation ? (
            <MiniChatRoom 
              conversationId={selectedConversation.id} 
              conversationName={selectedConversation.name}
              onBack={() => setSelectedConversation(null)}
              onClose={() => setIsOpen(false)}
            />
          ) : (
            <MiniChatHub
              conversations={conversations}
              currentAgent={currentAgent}
              unreadCounts={unreadCounts}
              onSelect={(id, name) => setSelectedConversation({ id, name })}
              onClose={() => setIsOpen(false)}
              onPopOut={handlePopOut}
              onStatusChange={setManualPresence}
              getLivePresence={getLivePresence}
            />
          )
        )}
      </div>

      {/* Floating Action Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "h-14 w-14 rounded-full shadow-xl flex items-center justify-center transition-all duration-300 pointer-events-auto cursor-pointer",
          isOpen ? "bg-slate-800 text-white hover:bg-slate-700" : "bg-blue-600 text-white hover:bg-blue-700 hover:scale-105 active:scale-95"
        )}
      >
        {isOpen ? (
          <ChevronRight className="w-6 h-6 rotate-90" />
        ) : (
          <MessageSquare className="w-6 h-6" />
        )}
        
        {/* Unread Badge */}
        {!isOpen && totalUnread > 0 && (
          <div className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full border-2 border-white shadow-sm">
            {totalUnread > 99 ? '99+' : totalUnread}
          </div>
        )}
      </button>

    </div>
  )
}
