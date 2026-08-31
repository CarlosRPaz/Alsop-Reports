// ============================================================================
// Chat System — Barrel Export
// ============================================================================

// Types
export type * from './types'

// Permissions
export {
  checkPermission,
  hasPermission,
  getAllPermissions,
  updatePermission,
  getPermissionsForAgent,
} from './permissions'

// Conversations
export {
  fetchConversationsForAgent,
  toggleConversationPin,
  createConversation,
  getOrCreateDirectDM,
  updateConversation,
  addMembers,
  removeMember,
  archiveConversation,
  autoJoinDefaultChannels,
  getConversationMembers,
} from './conversations'

// Messages
export {
  fetchMessages,
  sendMessage,
  editMessage,
  deleteMessage,
  pinMessage,
  unpinMessage,
  getPinnedMessages,
  addReaction,
  removeReaction,
} from './messages'

// Mentions
export {
  parseMentions,
  createMentionRecords,
  resolveMentionTargets,
} from './mentions'

// Notifications
export {
  getUnreadCounts,
  markConversationRead,
  createNotification,
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  requestDesktopPermission,
  sendDesktopNotification,
  clearDesktopNotifications,
} from './notifications'
export { playNotificationSound } from './sound'

// Realtime
export {
  subscribeToConversation,
  subscribeToAllConversations,
  updatePresence,
  unsubscribeChannel,
  unsubscribeChannels,
} from './realtime'

// Context
export { ChatProvider, useChat } from './chatContext'
export type { ChatContextValue } from './chatContext'
