import { Section, Eyebrow, SectionHeading } from '@/components/ui/section';

const capabilities = [
  {
    index: '01',
    title: 'Organizations and projects',
    body: 'Every organization is a sealed tenant. Membership decides what exists for you, not merely what is shown — a project you do not belong to is absent, not hidden behind a filter.',
  },
  {
    index: '02',
    title: 'Review and decisions',
    body: 'Deliverables go up, feedback comes back against the thing itself, and the outcome is recorded as a decision. An approval becomes a fact you can point at, not a message you have to go find.',
  },
  {
    index: '03',
    title: 'An immutable timeline',
    body: 'Events are appended, never edited. The order in which things happened survives contact with hindsight, so a project can always answer how it arrived where it is.',
  },
  {
    index: '04',
    title: 'Capability-based access',
    body: 'Access is a grant with a scope, checked on the server every time. Not a role that quietly expands to mean everything once somebody needs one more thing.',
  },
] as const;

export const Capabilities = () => (
  <Section id="capabilities" className="dvx-rise">
    <Eyebrow>Capabilities</Eyebrow>
    <SectionHeading>Four things the room is built to hold.</SectionHeading>

    <ul className="mt-14 grid gap-px overflow-hidden rounded-xl bg-white/8 sm:grid-cols-2">
      {capabilities.map((capability) => (
        <li
          key={capability.index}
          className="bg-surface hover:bg-raised group relative p-8 transition-colors duration-300 sm:p-10"
        >
          <span className="text-brand/70 group-hover:text-brand font-mono text-xs tracking-widest transition-colors duration-300">
            {capability.index}
          </span>
          <h3 className="mt-5 text-lg font-medium tracking-tight">
            {capability.title}
          </h3>
          <p className="text-muted mt-3 leading-relaxed">{capability.body}</p>
        </li>
      ))}
    </ul>
  </Section>
);
