import { Section, Eyebrow, SectionHeading } from '@/components/ui/section';

export const Positioning = () => (
  <Section id="what" className="dvx-rise">
    <Eyebrow>What it is</Eyebrow>
    <SectionHeading>
      Not another meeting tool. A workspace that remembers what was decided.
    </SectionHeading>

    <div className="text-muted mt-8 grid max-w-4xl gap-6 text-base leading-relaxed sm:grid-cols-2 sm:text-lg">
      <p>
        Software teams do not lose time to a shortage of calls. They lose it to
        context that lives everywhere except next to the work — a decision made
        in a thread, an approval that nobody can find, a deliverable whose
        history evaporated when the channel scrolled.
      </p>
      <p>
        DavixRoom puts the lifecycle in one place. Work is submitted, reviewed
        and decided inside the project it belongs to, and every step is written
        to a record that cannot be quietly rewritten later.
      </p>
    </div>
  </Section>
);
