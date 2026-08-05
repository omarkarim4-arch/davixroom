import { Section, Eyebrow, SectionHeading } from '@/components/ui/section';

const steps = [
  {
    step: 'Step one',
    title: 'Open the room',
    body: 'Create the organization, then the projects inside it. Invite the people who belong there and nobody else.',
  },
  {
    step: 'Step two',
    title: 'Do the work',
    body: 'Submit deliverables against a project. Feedback attaches to the artifact, so the discussion and the thing being discussed never drift apart.',
  },
  {
    step: 'Step three',
    title: 'Decide, and keep the record',
    body: 'Approve or send back. The decision and everything that led to it land on the timeline, in order, permanently.',
  },
] as const;

export const HowItWorks = () => (
  <Section id="how" className="dvx-rise">
    <Eyebrow>How it works</Eyebrow>
    <SectionHeading>Three moves, and the record writes itself.</SectionHeading>

    <ol className="relative mt-14 grid gap-10 sm:grid-cols-3 sm:gap-8">
      {/* The connecting light between steps, echoing the logo's tagline rules. */}
      <li
        aria-hidden
        className="rule-glow absolute -top-6 left-0 hidden w-full opacity-50 sm:block"
      />

      {steps.map((step) => (
        <li key={step.step} className="relative">
          <p className="eyebrow">{step.step}</p>
          <h3 className="mt-4 text-xl font-medium tracking-tight">{step.title}</h3>
          <p className="text-muted mt-3 leading-relaxed">{step.body}</p>
        </li>
      ))}
    </ol>
  </Section>
);
