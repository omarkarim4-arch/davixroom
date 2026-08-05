import { Section, Eyebrow, SectionHeading } from '@/components/ui/section';

const facts = [
  {
    label: 'Isolation',
    body: 'Tenant separation is enforced in the database, not in application code. Queries run as the signed-in caller under row-level security, so a forgotten filter returns nothing rather than everything.',
  },
  {
    label: 'Sessions',
    body: 'Every request validates the caller against the auth server. Identity is never taken from the contents of a cookie, because a cookie is whatever its holder says it is.',
  },
  {
    label: 'History',
    body: 'The event log is append-only. Records are written once; correcting the story means adding to it, never overwriting what it used to say.',
  },
] as const;

export const Security = () => (
  <Section id="security" className="dvx-rise">
    <Eyebrow>Security posture</Eyebrow>
    <SectionHeading>The boundary is in the database, not the UI.</SectionHeading>

    <dl className="mt-14 grid gap-px overflow-hidden rounded-xl bg-white/8">
      {facts.map((fact) => (
        <div
          key={fact.label}
          className="bg-surface grid gap-3 p-8 sm:grid-cols-[10rem_1fr] sm:gap-8 sm:p-10"
        >
          <dt className="text-brand font-mono text-xs tracking-widest uppercase">
            {fact.label}
          </dt>
          <dd className="text-muted max-w-2xl leading-relaxed">{fact.body}</dd>
        </div>
      ))}
    </dl>
  </Section>
);
