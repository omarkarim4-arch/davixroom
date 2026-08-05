'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/infra/auth/supabase-server';

export type SignInState = { readonly error: string | null };

/**
 * Email and password sign-in.
 *
 * Failures return a single generic message on purpose. Distinguishing "no such
 * account" from "wrong password" tells an attacker which addresses are
 * registered, which is a free account-enumeration oracle.
 */
export const signIn = async (
  _previous: SignInState,
  formData: FormData,
): Promise<SignInState> => {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  if (email === '' || password === '') {
    return { error: 'Enter your email and password.' };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error !== null) {
    return { error: 'Those credentials did not match an account.' };
  }

  redirect('/');
};

export const signOut = async (): Promise<void> => {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect('/sign-in');
};
