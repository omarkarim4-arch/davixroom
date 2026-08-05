'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import {
  AuthShell,
  FormError,
  fieldClass,
  submitClass,
} from '@/components/app/auth-shell';
import { startProject, type NewProjectState } from './actions';

const initialState: NewProjectState = { error: null };

export default function NewProjectPage() {
  const [state, formAction, pending] = useActionState(startProject, initialState);

  return (
    <AuthShell
      title="Start a project"
      subtitle="A project is the room you review in. Name the client now — you will invite the people who watch and approve next."
      footer={
        <Link href="/dashboard" className="hover:text-ink">
          Back to your rooms
        </Link>
      }
    >
      <form action={formAction} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-muted font-medium">Project</span>
          <input
            type="text"
            name="name"
            placeholder="Checkout rebuild"
            required
            className={fieldClass}
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-muted font-medium">Client organization</span>
          <input
            type="text"
            name="clientOrganizationName"
            placeholder="Acme"
            required
            className={fieldClass}
          />
          <span className="text-faint text-xs">
            Created for you. Nobody can sign in to it until you invite them.
          </span>
        </label>

        {state.error !== null && <FormError message={state.error} />}

        <button type="submit" disabled={pending} className={submitClass}>
          {pending ? 'Creating…' : 'Create project'}
        </button>
      </form>
    </AuthShell>
  );
}
