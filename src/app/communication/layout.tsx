"use client"

import { useChat, ChatProvider } from "@/lib/chat/chatContext"
import AgentPicker from "@/components/chat/AgentPicker"

function ChatGate({ children }: { children: React.ReactNode }) {
  const { currentAgent, isLoading, signIn } = useChat()

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin h-8 w-8 border-3 border-slate-200 border-t-blue-500 rounded-full" />
          <p className="text-sm text-slate-500 font-medium">Loading Communication Hub...</p>
        </div>
      </div>
    )
  }

  if (!currentAgent) {
    return <AgentPicker onSelect={(agent) => signIn(agent.id)} />
  }

  return <>{children}</>
}

export default function CommunicationLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ChatProvider>
      <ChatGate>
        {children}
      </ChatGate>
    </ChatProvider>
  )
}
