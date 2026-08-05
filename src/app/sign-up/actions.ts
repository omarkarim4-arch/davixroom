'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/infra/auth/supabase-server';

export type SignUpState = { readonly error: string | null; readonly sent: boolean };

/**
 * Self-service registration, for vendors only.
 *
 * Creating an account creates nothing in the domain — no organization, no user
 * row. The account is inert until it either bootstraps a vendor organization at
 * /onboarding or accepts an invitation. That is what keeps "clients never
 * create organizations" true: there is no path from here to a client tenant.
 *
 * Whether a confirmation email is required is a Supabase project setting. When
 * it is on, `session` comes back null and the invitee must confirm first —
 * which `app.accept_invitation` independently insists on anyway.
 */
export const signUp = async (
  _previous: SignUpState,
  formData: FormData,
): Promise<SignUpState> => {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  if (email === '' || password === '') {
    return { error: 'Enter your email and a password.', sent: false };
  }

  if (password.length < 8) {
    return { error: 'Use at least 8 characters for your password.', sent: false };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error !== null) {
    return { error: 'That account could not be created.', sent: false };
  }

  if (data.session === null) {
    return { error: null, sent: true };
  }

  redirect('/onboarding');
};
