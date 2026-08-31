'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { useChat } from '@/lib/chat/chatContext'
import { supabase } from '@/lib/supabaseClient'
import type { Conversation } from '@/components/chat/types'
import { MiniChatHub } from '@/components/chat/MiniChatHub'
import { MiniChatRoom } from '@/components/chat/MiniChatRoom'

export default function PopoutPage() {
  const { currentAgent, unreadCounts, setManualPresence, getLivePresence } = useChat()
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
        console.error("Failed to load popout conversations:", err)
      }
    }

    loadConversations()
  }, [currentAgent])

  if (!currentAgent) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 text-sm text-slate-500">
        Loading or not logged in...
      </div>
    )
  }

  return (
    <div className="w-full h-screen overflow-hidden flex flex-col bg-white">
      {selectedConversation ? (
        <MiniChatRoom 
          conversationId={selectedConversation.id} 
          conversationName={selectedConversation.name}
          onBack={() => setSelectedConversation(null)}
          onClose={() => window.close()}
        />
      ) : (
        <MiniChatHub
          conversations={conversations}
          currentAgent={currentAgent}
          unreadCounts={unreadCounts}
          onSelect={(id, name) => setSelectedConversation({ id, name })}
          onClose={() => window.close()}
          onPopOut={() => {}} // Already popped out
          onStatusChange={setManualPresence}
          getLivePresence={getLivePresence}
        />
      )}
    </div>
  )
}
