'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { useChat } from '@/lib/chat/chatContext'
import { fetchConversationsForAgent } from '@/lib/chat/conversations'
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
        const convos = await fetchConversationsForAgent(currentAgent!.id)
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
          onStatusChange={setManualPresence}
          getLivePresence={getLivePresence}
        />
      )}
    </div>
  )
}
