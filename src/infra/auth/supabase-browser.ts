'use client';

import { createBrowserClient } from '@supabase/ssr';
import { publicEnv } from '@/config/public-env';

/**
 * Supabase client for the browser. Carries only the publishable key, which
 * grants nothing beyond what row level security already permits.
 */
export const createSupabaseBrowserClient = () =>
  createBrowserClient(publicEnv.supabaseUrl, publicEnv.supabasePublishableKey);
