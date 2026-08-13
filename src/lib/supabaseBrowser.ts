import { createBrowserClient } from '@supabase/ssr'

/**
 * Create a Supabase client for use in Client Components (browser).
 * This replaces the old supabaseClient.ts for auth-aware operations.
 */
export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key'
  return createBrowserClient(url, key)
}
