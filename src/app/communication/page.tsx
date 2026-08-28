"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useChat } from "@/lib/chat/chatContext"
import { supabase } from "@/lib/supabaseClient"
import {
  fetchConversationsForAgent,
  toggleConversationPin,
  autoJoinDefaultChannels,
  fetchMessages,
  sendMessage,
  editMessage,
  deleteMessage,
  pinMessage,
  unpinMessage,
  addReaction,
  removeReaction,
  markConversationRead,
  getConversationMembers,
  parseMentions,
  createMentionRecords,
  resolveMentionTargets,
  createNotification,
  subscribeToConversation,
  unsubscribeChannel,
  getOrCreateDirectDM,
} from "@/lib/chat"
import type { Conversation, Message, Agent, ConversationMember } from "@/lib/chat/types"
import type { RealtimeChannel } from "@supabase/supabase-js"

import ConversationSidebar from "@/components/chat/ConversationSidebar"
import ConversationHeader from "@/components/chat/ConversationHeader"
import MessageList from "@/components/chat/MessageList"
import MessageComposer from "@/components/chat/MessageComposer"
import CreateConversationModal from "@/components/chat/CreateConversationModal"
import PinnedMessagesPanel from "@/components/chat/PinnedMessagesPanel"
import ConversationSettingsModal from "@/components/chat/ConversationSettingsModal"
import AgentHudPanel from "@/components/chat/AgentHudPanel"
import { updatePresence } from "@/lib/chat/realtime"
import { MessageSquare, MonitorSmartphone } from "lucide-react"

export default function CommunicationHub() {
  const { currentAgent, hasPermission, unreadCounts, refreshUnreadCounts, signOut, setManualPresence } = useChat()

  // ── State ─────────────────────────────────────────────────────
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [members, setMembers] = useState<Agent[]>([])
  const [memberCount, setMemberCount] = useState(0)
  const [pinnedCount, setPinnedCount] = useState(0)
  const [isLoadingMessages, setIsLoadingMessages] = useState(false)
  const [isLoadingConversations, setIsLoadingConversations] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [createModalDefaultTab, setCreateModalDefaultTab] = useState<'dm' | 'group' | 'channel'>('dm')
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const [editingMessage, setEditingMessage] = useState<string | null>(null)
  const [showPinnedPanel, setShowPinnedPanel] = useState(false)
  const [showHudPanel, setShowHudPanel] = useState(false)

  // Realtime channel ref
  const conversationChannelRef = useRef<RealtimeChannel | null>(null)

  const selectedConversation = conversations.find(c => c.id === selectedId) || null

  // ── Load conversations ────────────────────────────────────────
  const loadConversations = useCallback(async () => {
    if (!currentAgent) return
    try {
      // Auto-join default channels on first load
      await autoJoinDefaultChannels(currentAgent.id, currentAgent.team, currentAgent.role)
      const convos = await fetchConversationsForAgent(currentAgent.id)
      setConversations(convos)

      // Check if a specific conversation was requested via ?id=... or ?channel=... query param
      let targetId: string | null = null
      if (typeof window !== "undefined") {
        const searchParams = new URLSearchParams(window.location.search)
        const paramId = searchParams.get("id")
        const paramChannel = searchParams.get("channel")

        if (paramId) {
          targetId = paramId
        } else if (paramChannel) {
          const match = convos.find((c) => c.name?.toLowerCase() === paramChannel.toLowerCase())
          if (match) {
            targetId = match.id
          }
        }
      }

      if (targetId) {
        setSelectedId(targetId)
      } else if (!selectedId && convos.length > 0) {
        // Prefer 'All' channel as the default landing channel
        const allChannel = convos.find((c) => c.name === "All")
        setSelectedId(allChannel ? allChannel.id : convos[0].id)
      }
    } catch (err) {
      console.error("[CommunicationHub] Failed to load conversations:", err)
    } finally {
      setIsLoadingConversations(false)
    }
  }, [currentAgent, selectedId])

  useEffect(() => {
    loadConversations()
  }, [loadConversations])

  // Listen to select-conversation event to switch active conversation from hover cards or HUD
  useEffect(() => {
    const handleSelectConvo = async (e: any) => {
      const convoId = e.detail?.conversationId
      if (convoId) {
        setSelectedId(convoId)
        setShowHudPanel(false)
        if (currentAgent) {
          const convos = await fetchConversationsForAgent(currentAgent.id)
          setConversations(convos)
        }
      }
    }
    window.addEventListener('select-conversation', handleSelectConvo)
    return () => window.removeEventListener('select-conversation', handleSelectConvo)
  }, [currentAgent])

  // ── Load messages for selected conversation ───────────────────
  useEffect(() => {
    if (!selectedId || !currentAgent) return

    const loadMessages = async () => {
      setIsLoadingMessages(true)
      try {
        const [msgs, memberData] = await Promise.all([
          fetchMessages(selectedId, 50),
          getConversationMembers(selectedId),
        ])
        setMessages(msgs.reverse())
        const agentMembers = memberData
          .filter((m: ConversationMember) => m.agent)
          .map((m: ConversationMember) => m.agent as Agent)
        setMembers(agentMembers)
        setMemberCount(memberData.length)
        setPinnedCount(msgs.filter(m => m.is_pinned).length)

        // Mark as read
        await markConversationRead(selectedId, currentAgent.id)
        await refreshUnreadCounts()
      } catch (err) {
        console.error("[CommunicationHub] Failed to load messages:", err)
      } finally {
        setIsLoadingMessages(false)
      }
    }

    loadMessages()

    // Clear reply state when switching conversations
    setReplyTo(null)
    setEditingMessage(null)
  }, [selectedId, currentAgent, refreshUnreadCounts])

  // ── Realtime subscriptions ────────────────────────────────────
  useEffect(() => {
    if (!selectedId || !currentAgent) return

    // Cleanup previous subscription
    if (conversationChannelRef.current) {
      unsubscribeChannel(conversationChannelRef.current)
    }

    const channel = subscribeToConversation(selectedId, {
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

        // Mark as read since we're viewing this conversation
        try {
          await markConversationRead(selectedId, currentAgent.id)
        } catch {}
        refreshUnreadCounts()
      },
      onMessageUpdate: (updated: Message) => {
        setMessages(prev =>
          prev.map(m => (m.id === updated.id ? { ...m, ...updated } : m))
        )
      },
      onMessageDelete: (deleted: Message) => {
        setMessages(prev =>
          prev.map(m =>
            m.id === deleted.id
              ? { ...m, is_deleted: true, content: "" }
              : m
          )
        )
      },
      onNewReaction: async () => {
        try {
          const msgs = await fetchMessages(selectedId, 50)
          setMessages(msgs.reverse())
        } catch {}
      },
    })

    conversationChannelRef.current = channel

    return () => {
      unsubscribeChannel(channel)
    }
  }, [selectedId, currentAgent, refreshUnreadCounts])

  // Global refresh: when unreadCounts change (triggered by chatContext's global
  // subscription), refresh the sidebar conversation list so the latest messages
  // and ordering stay up-to-date. We avoid a second realtime channel here —
  // chatContext already runs one for sound + desktop notifications.
  const prevUnreadRef = useRef(unreadCounts)
  useEffect(() => {
    // Skip the initial render
    if (prevUnreadRef.current === unreadCounts) return
    prevUnreadRef.current = unreadCounts

    if (!currentAgent) return

    const refreshConversations = async () => {
      try {
        const convos = await fetchConversationsForAgent(currentAgent.id)
        setConversations(convos)
      } catch (err) {
        console.error("[CommunicationHub] Failed to refresh conversations:", err)
      }
    }

    refreshConversations()
  }, [unreadCounts, currentAgent])

  // ── Message actions ───────────────────────────────────────────
  const handleSendMessage = useCallback(
    async (content: string, parentId?: string, priority?: string) => {
      if (!currentAgent || !selectedId) return

      const msg = await sendMessage({
        conversation_id: selectedId,
        sender_id: currentAgent.id,
        content,
        parent_message_id: parentId,
      })

      // Parse and create mentions
      const mentions = parseMentions(content, members)
      if (mentions.length > 0 && msg) {
        await createMentionRecords(msg.id, mentions)
        // Create notifications for mentioned users
        const targetIds = await resolveMentionTargets(mentions)
        for (const targetId of targetIds) {
          if (targetId !== currentAgent.id) {
            await createNotification({
              agent_id: targetId,
              type: "mention",
              title: `${currentAgent.name} mentioned you`,
              body: content.substring(0, 200),
              conversation_id: selectedId,
              message_id: msg.id,
            })
          }
        }
      }

      setReplyTo(null)
    },
    [currentAgent, selectedId, members]
  )

  const handleEditMessage = useCallback(
    async (messageId: string) => {
      // Find the message and let user edit inline
      const msg = messages.find(m => m.id === messageId)
      if (!msg || msg.sender_id !== currentAgent?.id) return
      setEditingMessage(messageId)
    },
    [messages, currentAgent]
  )

  const handleDeleteMessage = useCallback(
    async (messageId: string) => {
      if (!currentAgent) return
      await deleteMessage(messageId, currentAgent.id)
      setMessages(prev =>
        prev.map(m =>
          m.id === messageId ? { ...m, is_deleted: true, content: "" } : m
        )
      )
    },
    [currentAgent]
  )

  const handlePinMessage = useCallback(
    async (messageId: string) => {
      if (!currentAgent) return
      const msg = messages.find(m => m.id === messageId)
      const isCurrentlyPinned = msg ? msg.is_pinned : true

      if (isCurrentlyPinned) {
        await unpinMessage(messageId)
        setMessages(prev =>
          prev.map(m =>
            m.id === messageId ? { ...m, is_pinned: false } : m
          )
        )
        setPinnedCount(c => Math.max(0, c - 1))
      } else {
        await pinMessage(messageId, currentAgent.id)
        setMessages(prev =>
          prev.map(m =>
            m.id === messageId ? { ...m, is_pinned: true } : m
          )
        )
        setPinnedCount(c => c + 1)
      }
    },
    [currentAgent, messages]
  )

  const handleJumpToMessage = useCallback((messageId: string) => {
    const el = document.getElementById(`message-${messageId}`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.classList.add('bg-amber-50/80', 'transition-all', 'duration-500')
      setTimeout(() => {
        el.classList.remove('bg-amber-50/80')
      }, 2000)
    } else {
      console.warn(`Message with ID ${messageId} not found in loaded message history.`)
    }
  }, [])

  const handleReplyMessage = useCallback(
    (messageId: string) => {
      const msg = messages.find(m => m.id === messageId)
      if (msg) setReplyTo(msg)
    },
    [messages]
  )

  const handleReact = useCallback(
    async (messageId: string, emoji: string) => {
      if (!currentAgent) return
      const msg = messages.find(m => m.id === messageId)
      const existingReaction = msg?.reactions?.find(
        r => r.emoji === emoji && r.agent_ids.includes(currentAgent.id)
      )

      if (existingReaction) {
        await removeReaction(messageId, currentAgent.id, emoji)
      } else {
        await addReaction(messageId, currentAgent.id, emoji)
      }

      // Reload messages to get updated reactions
      if (selectedId) {
        const msgs = await fetchMessages(selectedId, 50)
        setMessages(msgs.reverse())
      }
    },
    [currentAgent, messages, selectedId]
  )

  const handleStatusChange = useCallback(
    async (status: 'online' | 'away' | 'busy' | 'offline') => {
      if (!currentAgent) return
      if (status === 'offline') {
        // Offline is handled via sign-out / tab close, but allow manual offline too
        await updatePresence(currentAgent.id, 'offline')
      } else {
        await setManualPresence(status)
      }
      window.dispatchEvent(new Event('agent-updated'))
    },
    [currentAgent, setManualPresence]
  )

  // ── Render ────────────────────────────────────────────────────
  if (!currentAgent) return null

  return (
    <div className="h-[calc(100vh-2rem)] flex flex-col p-4 md:p-6 lg:p-8 max-w-[1600px] mx-auto">
      <div className="flex flex-1 min-h-0 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {/* Left Sidebar */}
        <ConversationSidebar
          conversations={conversations}
          selectedId={selectedId}
          unreadCounts={unreadCounts}
          currentAgent={currentAgent}
          onSelect={(id) => setSelectedId(id)}
          onCreateNew={(tab) => {
            setCreateModalDefaultTab(tab || 'dm')
            setShowCreateModal(true)
          }}
          onStatusChange={handleStatusChange}
          onTogglePin={async (convId, currentlyPinned) => {
            // Optimistic update
            setConversations(prev => {
              const updated = prev.map(c => c.id === convId ? { ...c, is_pinned: !currentlyPinned } : c)
              // Re-sort: pinned first, then by last message time
              updated.sort((a, b) => {
                if (a.is_pinned && !b.is_pinned) return -1
                if (!a.is_pinned && b.is_pinned) return 1
                if (a.type === 'channel' && b.type === 'channel') {
                  const isAllA = a.name?.trim().toLowerCase() === 'all'
                  const isAllB = b.name?.trim().toLowerCase() === 'all'
                  if (isAllA && !isAllB) return -1
                  if (!isAllA && isAllB) return 1
                }
                const aTime = a.last_message?.created_at ?? a.updated_at
                const bTime = b.last_message?.created_at ?? b.updated_at
                return new Date(bTime).getTime() - new Date(aTime).getTime()
              })
              return updated
            })
            // Persist to DB
            await toggleConversationPin(convId, currentAgent.id, !currentlyPinned)
          }}
        />

        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Chat / HUD Tab Toggle */}
          <div className="flex items-center gap-1 px-3 py-2 border-b border-slate-200 bg-slate-50/80 shrink-0">
            <button
              onClick={() => setShowHudPanel(false)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                !showHudPanel
                  ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              Chat
            </button>
            <button
              onClick={() => setShowHudPanel(true)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                showHudPanel
                  ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
              }`}
            >
              <MonitorSmartphone className="w-3.5 h-3.5" />
              Agent HUD
            </button>
          </div>

          {showHudPanel ? (
            <AgentHudPanel />
          ) : selectedConversation ? (
            <>
              <ConversationHeader
                conversation={selectedConversation}
                currentAgentId={currentAgent.id}
                memberCount={memberCount}
                pinnedCount={pinnedCount}
                members={members}
                onSearchClick={() => {}}
                onPinnedClick={() => setShowPinnedPanel(prev => !prev)}
                onSettingsClick={() => setShowSettingsModal(true)}
              />

              <MessageList
                key={selectedConversation.id}
                messages={messages}
                currentAgentId={currentAgent.id}
                isLoading={isLoadingMessages}
                onReply={handleReplyMessage}
                onEdit={handleEditMessage}
                onDelete={handleDeleteMessage}
                onPin={handlePinMessage}
                onReact={handleReact}
                hasPermission={hasPermission}
              />

              <MessageComposer
                conversationId={selectedId!}
                currentAgentId={currentAgent.id}
                replyTo={replyTo}
                members={members}
                onSend={handleSendMessage}
                onCancelReply={() => setReplyTo(null)}
                hasPermission={hasPermission}
              />
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center bg-slate-50/50">
              <div className="text-center">
                <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                  <MessageSquare className="w-8 h-8 text-slate-400" />
                </div>
                <h3 className="text-lg font-semibold text-slate-700">
                  {isLoadingConversations ? "Loading conversations..." : "Select a conversation"}
                </h3>
                <p className="text-sm text-slate-500 mt-1">
                  Choose a channel or DM from the sidebar to start chatting.
                </p>
              </div>
            </div>
          )}
         </div>

        {showPinnedPanel && selectedConversation && (
          <PinnedMessagesPanel
            conversationId={selectedId!}
            onClose={() => setShowPinnedPanel(false)}
            onJumpToMessage={handleJumpToMessage}
            onUnpinMessage={handlePinMessage}
          />
        )}
      </div>

      {/* Create Conversation Modal */}
      <CreateConversationModal
        currentAgent={currentAgent}
        isOpen={showCreateModal}
        defaultTab={createModalDefaultTab}
        onClose={() => setShowCreateModal(false)}
        onCreateDM={async (agentId: string) => {
          try {
            const convo = await getOrCreateDirectDM(currentAgent.id, agentId)
            if (convo) {
              setShowCreateModal(false)
              await loadConversations()
              setSelectedId(convo.id)
            }
          } catch (err) {
            console.error('[CommunicationHub] Failed to create DM:', err)
            throw err // Re-throw so the modal can display the error
          }
        }}
        onCreateGroup={async (name: string, memberIds: string[]) => {
          const { createConversation } = await import('@/lib/chat')
          const convo = await createConversation({
            type: 'group_dm',
            name,
            created_by: currentAgent.id,
            member_ids: [currentAgent.id, ...memberIds],
          })
          if (convo) {
            setShowCreateModal(false)
            await loadConversations()
            setSelectedId(convo.id)
          }
        }}
        onCreateChannel={async (name: string, description: string, _icon: string, _teams: string[]) => {
          const { createConversation } = await import('@/lib/chat')
          const convo = await createConversation({
            type: 'channel',
            name,
            description,
            created_by: currentAgent.id,
            member_ids: [currentAgent.id],
          })
          if (convo) {
            setShowCreateModal(false)
            await loadConversations()
            setSelectedId(convo.id)
          }
        }}
      />

      {/* Conversation / Channel Settings Modal */}
      {showSettingsModal && selectedConversation && (
        <ConversationSettingsModal
          conversation={selectedConversation}
          currentAgent={currentAgent}
          isOpen={showSettingsModal}
          onClose={() => setShowSettingsModal(false)}
          onConversationUpdated={(updatedConv) => {
            setConversations((prev) =>
              prev.map((c) => (c.id === updatedConv.id ? { ...c, ...updatedConv } : c))
            )
          }}
          onMembersUpdated={async () => {
            if (selectedId) {
              const memberData = await getConversationMembers(selectedId)
              const agentMembers = memberData
                .filter((m) => m.agent)
                .map((m) => m.agent as Agent)
              setMembers(agentMembers)
              setMemberCount(memberData.length)
            }
          }}
        />
      )}
    </div>
  )
}
