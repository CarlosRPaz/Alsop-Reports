'use client'

import React, { useState, useEffect, useRef } from 'react'
import { ChevronLeft, MoreVertical, X, ExternalLink } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import { useChat } from '@/lib/chat/chatContext'
import { fetchMessages, sendMessage, deleteMessage } from '@/lib/chat/messages'
import { getConversationMembers } from '@/lib/chat/conversations'
import { markConversationRead, clearDesktopNotifications } from '@/lib/chat/notifications'
import { subscribeToConversation, unsubscribeChannel } from '@/lib/chat/realtime'
import type { Message, Agent, ConversationMember } from '@/components/chat/types'
import MessageList from '@/components/chat/MessageList'
import MessageComposer from '@/components/chat/MessageComposer'
import { useToast } from '@/components/ui/Toast'

interface MiniChatRoomProps {
  conversationId: string
  conversationName: string
  onBack: () => void
  onClose: () => void
  onPopOut?: () => void
  hideHeaderActions?: boolean
}

export function MiniChatRoom({ conversationId, conversationName, onBack, onClose, onPopOut, hideHeaderActions }: MiniChatRoomProps) {
  const { currentAgent, hasPermission, refreshUnreadCounts, setActiveConversationId } = useChat()
  const { dismissToasts } = useToast()
  const [messages, setMessages] = useState<Message[]>([])
  const [members, setMembers] = useState<Agent[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const channelRef = useRef<any>(null)

  useEffect(() => {
    setActiveConversationId(conversationId)
    if (conversationId) {
      dismissToasts(t => t.metadata?.conversationId === conversationId)
      clearDesktopNotifications(conversationId)
    }
    return () => setActiveConversationId(null)
  }, [conversationId, setActiveConversationId, dismissToasts])

  useEffect(() => {
    if (!currentAgent || !conversationId) return

    let isMounted = true
    setIsLoading(true)

    async function load() {
      try {
        const [msgs, memberData] = await Promise.all([
          fetchMessages(conversationId, 40),
          getConversationMembers(conversationId),
        ])
        if (!isMounted) return
        setMessages(msgs.reverse())
        const agentMembers = memberData
          .filter((m: ConversationMember) => m.agent)
          .map((m: ConversationMember) => m.agent as Agent)
        setMembers(agentMembers)

        // Mark read
        await markConversationRead(conversationId, currentAgent!.id)
        refreshUnreadCounts()
      } catch (err) {
        console.error("Failed to load mini chat:", err)
      } finally {
        if (isMounted) setIsLoading(false)
      }
    }

    load()

    // Realtime subscription
    channelRef.current = subscribeToConversation(conversationId, {
      onNewMessage: async (newMsg: Message) => {
        // Optimistically add to message list immediately
        setMessages(prev => {
          if (prev.some(m => m.id === newMsg.id)) return prev
          return [...prev, newMsg]
        })
        
        // Asynchronously enrich with sender and reply preview details in parallel
        const enriched = { ...newMsg }
        let needsUpdate = false

        try {
          const promises: PromiseLike<void>[] = []

          if (!enriched.sender) {
            promises.push(
              supabase
                .from('agents')
                .select('id, name, office, avatar_url, role, team, status_message, presence')
                .eq('id', enriched.sender_id)
                .single()
                .then(({ data: senderAgent }) => {
                  if (senderAgent) {
                    enriched.sender = senderAgent
                    needsUpdate = true
                  }
                })
            )
          }

          if (enriched.parent_message_id && !enriched.parent_preview) {
            promises.push(
              supabase
                .from('chat_messages')
                .select('id, content, is_deleted, created_at, sender_id, agents!chat_messages_sender_id_fkey(name)')
                .eq('id', enriched.parent_message_id)
                .single()
                .then((res: any) => {
                  const parentMsg = res.data
                  if (parentMsg) {
                    const agents = parentMsg.agents
                    const senderName = Array.isArray(agents)
                      ? (agents[0]?.name ?? 'Unknown')
                      : (agents?.name ?? 'Unknown')
                    enriched.parent_preview = {
                      id: parentMsg.id,
                      content: parentMsg.is_deleted ? 'Message deleted' : parentMsg.content,
                      sender_name: senderName,
                      created_at: parentMsg.created_at,
                    }
                    needsUpdate = true
                  }
                })
            )
          }

          if (promises.length > 0) {
            await Promise.all(promises)
          }
        } catch (err) {
          console.error('Failed to enrich realtime message:', err)
        }

        if (needsUpdate) {
          setMessages(prev =>
            prev.map(m => (m.id === enriched.id ? { ...m, ...enriched } : m))
          )
        }

        await markConversationRead(conversationId, currentAgent.id)
        refreshUnreadCounts()
      },
      onMessageUpdate: (updatedMsg: Message) => {
        setMessages(prev => prev.map(m => m.id === updatedMsg.id ? { ...m, ...updatedMsg } : m))
      },
      onMessageDelete: (deletedMsg: Message) => {
        setMessages(prev => prev.map(m => m.id === deletedMsg.id ? { ...m, is_deleted: true, content: 'This message was deleted' } : m))
      },
      onNewReaction: async () => {
        try {
          const msgs = await fetchMessages(conversationId, 40)
          if (!isMounted) return
          setMessages(msgs.reverse())
        } catch {}
      }
    })

    return () => {
      isMounted = false
      if (channelRef.current) {
        unsubscribeChannel(channelRef.current)
      }
    }
  }, [conversationId, currentAgent, refreshUnreadCounts])

  const handleSend = async (content: string, parentId?: string, priority?: string) => {
    if (!currentAgent) return
    try {
      await sendMessage({
        conversation_id: conversationId,
        sender_id: currentAgent.id,
        content,
        parent_message_id: parentId
      })
      setReplyTo(null)
    } catch (err) {
      console.error("Failed to send message:", err)
    }
  }

  const handleDelete = async (msgId: string) => {
    try {
      await deleteMessage(msgId, currentAgent!.id)
    } catch (err) {
      console.error("Failed to delete message:", err)
    }
  }

  if (!currentAgent) return null

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="shrink-0 h-14 border-b border-slate-100 flex items-center justify-between px-3 bg-white">
        <div className="flex items-center gap-2">
          {!hideHeaderActions && (
            <button onClick={onBack} className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer" title="Back">
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}
          <h3 className="font-semibold text-sm text-slate-800">
            {conversationName}
          </h3>
        </div>
        {/* Right Actions */}
        <div className="flex items-center gap-1">
          {!hideHeaderActions && onPopOut && (
            <button
              onClick={onPopOut}
              className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500 transition-colors"
              title="Pop out chat"
            >
              <ExternalLink className="w-4 h-4" />
            </button>
          )}
          {!hideHeaderActions && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 flex flex-col min-h-0 bg-slate-50/50">
        <MessageList
          messages={messages}
          currentAgentId={currentAgent.id}
          isLoading={isLoading}
          onReply={(msgId) => {
            const msg = messages.find(m => m.id === msgId)
            if (msg) setReplyTo(msg)
          }}
          onEdit={() => {}} // not supported in mini view for now
          onDelete={handleDelete}
          onPin={() => {}}
          onReact={async (msgId, emoji) => {
            const { addReaction } = await import('@/lib/chat/messages')
            addReaction(msgId, currentAgent.id, emoji)
          }}
          hasPermission={hasPermission}
          isCompact={true}
        />
      </div>

      {/* Composer */}
      <MessageComposer
        conversationId={conversationId}
        currentAgentId={currentAgent.id}
        replyTo={replyTo}
        members={members}
        onSend={handleSend}
        onCancelReply={() => setReplyTo(null)}
        hasPermission={hasPermission}
        isCompact={true}
      />
    </div>
  )
}
