import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { withCurrentUser } from '@/infra/auth/session';
import { findCurrentProfile } from '@/infra/db/onboarding';
import { findProjectView } from '@/infra/db/project-view';
import { PostgresProjectRepository } from '@/infra/db/postgres-project-repository';
import { can } from '@/core/auth/authorize';
import { asId } from '@/core/ids';
import { BrandLockupSmall } from '@/components/brand/logo';
import { InviteForm } from './invite-form';

const ROLE_LABELS: Record<string, string> = {
  vendor_owner: 'Owner',
  vendor_developer: 'Developer',
  client_approver: 'Approver',
  client_reviewer: 'Reviewer',
  observer: 'Observer',
};

/**
 * The room.
 *
 * Today it shows who is in it and lets the vendor side bring the client in.
 * The live review surface lands on top of this in a later stage — this page
 * exists to make sure that when it does, both parties are already here.
 */
/**
 * Loading lives outside the component so the authorization decision — which
 * needs the current instant — is not taken during render.
 */
const loadProjectPage = async (id: string) =>
  withCurrentUser(async (sql, caller) => {
    const profile = await findCurrentProfile(sql);
    if (profile === null) return { kind: 'no-profile' } as const;

    const project = await findProjectView(sql, id);
    if (project === null) return { kind: 'not-found' } as const;

    const repository = new PostgresProjectRepository(sql);
    const domainProject = await repository.findById(asId<'ProjectId'>(id));
    const userId = asId<'UserId'>(profile.userId);

    const mayInvite =
      domainProject !== null &&
      can({
        user: {
          id: userId,
          organizationId: asId<'OrganizationId'>(profile.organizationId),
          organizationRole: profile.organizationRole,
          displayName: profile.displayName,
          email: caller.email ?? '',
        },
        project: domainProject,
        membership: await repository.findMembership(domainProject.id, userId),
        grants: await repository.listGrants(domainProject.id, userId),
        capability: 'member.invite',
        now: Date.now(),
      });

    return { kind: 'ok', project, mayInvite } as const;
  });

export default async function ProjectPage({ params }: PageProps<'/projects/[id]'>) {
  const { id } = await params;
  const result = await loadProjectPage(id);

  if (result === null) redirect('/sign-in');
  if (result.kind === 'no-profile') redirect('/onboarding');

  // Row level security already returned nothing for a project the caller does
  // not belong to, so "not yours" and "does not exist" are indistinguishable
  // here — which is exactly what should be reported.
  if (result.kind === 'not-found') notFound();

  const { project, mayInvite } = result;
  const vendorSide = project.members.filter((member) => member.side === 'vendor');
  const clientSide = project.members.filter((member) => member.side === 'client');
  const openInvitations = project.invitations.filter(
    (invitation) => invitation.status === 'pending',
  );

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-4xl flex-col gap-10 p-6 sm:p-10">
      <header className="flex flex-col gap-6 border-b border-white/8 pb-8">
        <Link href="/dashboard" className="w-fit">
          <BrandLockupSmall />
        </Link>

        <div>
          <p className="eyebrow">
            {project.vendorName} · {project.clientName}
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">{project.name}</h1>
          <p className="text-faint mt-2 font-mono text-xs tracking-widest uppercase">
            {project.status}
          </p>
        </div>
      </header>

      <section className="grid gap-10 sm:grid-cols-2">
        <MemberColumn
          title="Building"
          organizationName={project.vendorName}
          members={vendorSide}
          emptyMessage="Nobody yet."
        />
        <MemberColumn
          title="Reviewing"
          organizationName={project.clientName}
          members={clientSide}
          emptyMessage="No one from the client side has joined yet. Invite them to start reviewing."
        />
      </section>

      {openInvitations.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="eyebrow">Waiting to join</h2>
          <ul className="flex flex-col gap-2">
            {openInvitations.map((invitation) => (
              <li
                key={invitation.id}
                className="bg-surface flex items-center justify-between gap-4 rounded-xl border border-white/8 px-5 py-3 text-sm"
              >
                <span>{invitation.email}</span>
                <span className="text-faint font-mono text-xs tracking-widest uppercase">
                  {ROLE_LABELS[invitation.role] ?? invitation.role}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {mayInvite && (
        <section className="flex flex-col gap-5 border-t border-white/8 pt-10">
          <div>
            <h2 className="eyebrow">Invite to review</h2>
            <p className="text-muted mt-3 max-w-lg text-sm leading-relaxed">
              Bring someone from {project.clientName} into this project. They join
              this room and nothing else.
            </p>
          </div>
          <div className="max-w-lg">
            <InviteForm projectId={project.id} />
          </div>
        </section>
      )}
    </main>
  );
}

const MemberColumn = ({
  title,
  organizationName,
  members,
  emptyMessage,
}: {
  readonly title: string;
  readonly organizationName: string;
  readonly members: readonly {
    userId: string;
    displayName: string;
    email: string;
    role: string;
  }[];
  readonly emptyMessage: string;
}) => (
  <div className="flex flex-col gap-4">
    <div>
      <h2 className="eyebrow">{title}</h2>
      <p className="mt-2 text-sm font-medium">{organizationName}</p>
    </div>

    {members.length === 0 ? (
      <p className="text-muted rounded-xl border border-dashed border-white/12 p-5 text-sm leading-relaxed">
        {emptyMessage}
      </p>
    ) : (
      <ul className="flex flex-col gap-2">
        {members.map((member) => (
          <li
            key={member.userId}
            className="bg-surface flex items-center justify-between gap-4 rounded-xl border border-white/8 px-5 py-3"
          >
            <span className="flex flex-col">
              <span className="text-sm font-medium">{member.displayName}</span>
              <span className="text-faint text-xs">{member.email}</span>
            </span>
            <span className="text-brand/80 font-mono text-xs tracking-widest uppercase">
              {ROLE_LABELS[member.role] ?? member.role}
            </span>
          </li>
        ))}
      </ul>
    )}
  </div>
);
