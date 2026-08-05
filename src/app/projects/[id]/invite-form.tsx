'use client';

import { useActionState } from 'react';
import { fieldClass, FormError } from '@/components/app/auth-shell';
import { inviteToReview, type InviteState } from './actions';

const initialState: InviteState = { error: null, inviteUrl: null };

const ROLES = [
  {
    value: 'client_approver',
    label: 'Approver',
    hint: 'Can approve or reject what they are shown. Only this role records a decision.',
  },
  {
    value: 'client_reviewer',
    label: 'Reviewer',
    hint: 'Joins the review and leaves feedback, but does not decide.',
  },
  {
    value: 'observer',
    label: 'Observer',
    hint: 'Watches only. Cannot post, decide, or influence the record.',
  },
] as const;

/**
 * The review role is the primary choice here, not an afterthought — approver is
 * the capability that turns work shown into work accepted.
 */
export const InviteForm = ({ projectId }: { readonly projectId: string }) => {
  const [state, formAction, pending] = useActionState(inviteToReview, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="projectId" value={projectId} />

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-muted font-medium">Their email</span>
        <input
          type="email"
          name="email"
          required
          placeholder="approver@client.test"
          className={fieldClass}
        />
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-muted mb-1 text-sm font-medium">Review role</legend>
        {ROLES.map((role, index) => (
          <label
            key={role.value}
            className="hover:border-brand/40 flex cursor-pointer gap-3 rounded-lg border border-white/8 p-3 transition-colors duration-200"
          >
            <input
              type="radio"
              name="role"
              value={role.value}
              defaultChecked={index === 0}
              className="accent-brand mt-1"
            />
            <span>
              <span className="block text-sm font-medium">{role.label}</span>
              <span className="text-muted block text-xs leading-relaxed">
                {role.hint}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      {state.error !== null && <FormError message={state.error} />}

      {state.inviteUrl !== null && (
        <div className="border-brand/30 bg-brand/5 rounded-md border p-3">
          <p className="text-sm font-medium">Invitation ready</p>
          <p className="text-muted mt-1 text-xs leading-relaxed">
            Send them this link. It works once, expires in seven days, and only
            opens for the address you entered.
          </p>
          <code className="text-brand mt-2 block overflow-x-auto rounded bg-black/50 p-2 font-mono text-xs">
            {state.inviteUrl}
          </code>
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-1 rounded-md px-4 py-2.5 text-sm font-medium text-white shadow-[0_0_24px_-6px_rgba(10,132,255,0.75)] transition-all duration-200 [background-image:var(--gradient-mark)] hover:brightness-110 disabled:opacity-55 disabled:shadow-none"
      >
        {pending ? 'Creating…' : 'Create invitation'}
      </button>
    </form>
  );
};
