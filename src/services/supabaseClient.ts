import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()

export const supabaseClient = (() => {
  if (!url || !publishableKey) return null

  try {
    return createClient(url, publishableKey)
  } catch {
    // Invalid optional auth settings must not prevent local-only play.
    return null
  }
})()
