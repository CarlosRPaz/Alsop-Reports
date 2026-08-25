// ============================================================================
// Chat System — Shared Types
// ============================================================================

/** Agent row from the `agents` table */
export interface Agent {
  id: string
  name: string
  team: 'Sales' | 'CSR' | 'EA' | 'Managers'
  office: 'MCM' | 'MB' | 'RC' | 'CH'
  role: 'admin' | 'agent'
  active: boolean
  presence: 'online' | 'away' | 'busy' | 'offline'
  avatar_url: string | null
  status_message: string | null
  last_seen_at: string | null
}

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

export interface ChatPermission {
  id: string
  permission_key: string
  description: string | null
  allowed_roles: string[]
  allowed_teams: string[]
  created_at: string
  updated_at: string
}

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------

export type ConversationType = 'channel' | 'group_dm' | 'direct_dm'
export type MemberRole = 'owner' | 'admin' | 'member'

export interface Conversation {
  id: string
  type: ConversationType
  name: string | null
  description: string | null
  is_private: boolean
  is_archived: boolean
  created_by: string
  created_at: string
  updated_at: string
  // Enriched fields (not raw DB columns)
  last_message?: MessagePreview | null
  unread_count?: number
  members?: ConversationMember[]
  is_pinned?: boolean
}

export interface ConversationMember {
  conversation_id: string
  agent_id: string
  role: MemberRole
  joined_at: string
  last_read_at: string | null
  is_muted: boolean
  is_pinned: boolean
  agent?: Agent
}

export interface CreateConversationInput {
  type: ConversationType
  name?: string
  description?: string
  is_private?: boolean
  created_by: string
  member_ids: string[]
}

export interface MessagePreview {
  id: string
  content: string
  sender_name: string
  created_at: string
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export interface Message {
  id: string
  conversation_id: string
  sender_id: string
  content: string
  parent_message_id: string | null
  is_edited: boolean
  is_deleted: boolean
  deleted_by: string | null
  deleted_at: string | null
  is_system: boolean
  is_pinned: boolean
  pinned_by: string | null
  pinned_at: string | null
  priority: 'normal' | 'important' | 'urgent'
  created_at: string
  updated_at: string
  // Enriched
  sender?: Pick<Agent, 'id' | 'name' | 'avatar_url' | 'role' | 'team' | 'status_message' | 'presence'>
  reactions?: ReactionGroup[]
  parent_preview?: MessagePreview | null
}

export interface ReactionGroup {
  emoji: string
  count: number
  agent_ids: string[]
  agent_names?: string[]
}

export interface MessageReaction {
  id: string
  message_id: string
  agent_id: string
  emoji: string
  created_at: string
}

export interface SendMessageInput {
  conversation_id: string
  sender_id: string
  content: string
  parent_message_id?: string
}

// ---------------------------------------------------------------------------
// Mentions
// ---------------------------------------------------------------------------

export type MentionType = 'agent' | 'team' | 'office' | 'role' | 'everyone'

export interface ParsedMention {
  type: MentionType
  target: string          // e.g. "AgentName", "Sales", "Admin", "Everyone"
  agent_id?: string       // Populated for agent-level mentions
}

export interface MessageMention {
  id: string
  message_id: string
  mentioned_agent_id: string | null
  mention_type: MentionType
  mention_target: string
  created_at: string
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export type NotificationType = 'mention' | 'dm' | 'reply' | 'reaction' | 'system'

export interface ChatNotification {
  id: string
  agent_id: string
  type: NotificationType
  title: string
  body: string
  conversation_id: string | null
  message_id: string | null
  is_read: boolean
  created_at: string
}

export interface CreateNotificationInput {
  agent_id: string
  type: NotificationType
  title: string
  body: string
  conversation_id?: string
  message_id?: string
}

// ---------------------------------------------------------------------------
// Realtime
// ---------------------------------------------------------------------------

export interface ConversationCallbacks {
  onNewMessage: (message: Message) => void
  onMessageUpdate: (message: Message) => void
  onMessageDelete: (message: Message) => void
  onNewReaction: (reaction: MessageReaction) => void
}

export interface GlobalCallbacks {
  onNewMessage: (message: Message) => void
}
