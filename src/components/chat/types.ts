// Re-export all types from the canonical service layer types
// Components should import from here: import { Agent, Message, ... } from './types'
export type {
  Agent,
  Conversation,
  ConversationType,
  Message,
  MessagePreview,
  ReactionGroup,
  MessageReaction,
  ConversationMember,
  ParsedMention,
  ChatNotification,
} from '@/lib/chat/types'

// Aliases for component convenience
export type { ReactionGroup as Reaction } from '@/lib/chat/types'
export type PresenceStatus = 'online' | 'away' | 'busy' | 'offline'
