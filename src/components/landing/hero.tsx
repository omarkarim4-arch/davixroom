import { Lockup } from '@/components/brand/logo';
import { ActionLink } from '@/components/ui/action-link';

/**
 * The lockup is the headline.
 *
 * It already carries the product's name, tagline and byline as artwork, so the
 * h1 wraps the image and inherits its alt text rather than repeating the same
 * words in a second typeface underneath it.
 */
export const Hero = () => (
  <section className="relative flex min-h-[calc(100dvh-73px)] flex-col items-center justify-center overflow-hidden px-6 py-20 text-center">
    {/* The glow the artwork sits in — the light the logo appears to emit. */}
    <div
      aria-hidden
      className="pointer-events-none absolute top-1/2 left-1/2 h-[80vh] w-[110vw] -translate-x-1/2 -translate-y-[60%]"
      style={{
        background:
          'radial-gradient(ellipse at center, rgba(10,132,255,0.16), rgba(10,132,255,0.05) 42%, transparent 70%)',
      }}
    />

    {/* The artwork carries its own margin, which is why the box is wider than
        the logo looks and the copy sits closer beneath it than it reads here.
        The 69dvh term caps the lockup on short or landscape viewports, where
        width alone would push the tagline off the bottom. It constrains width
        rather than height because the edge feather is a mask on the element
        box — letterboxing the image inside that box would leave the mask ramp
        sitting in empty space and the artwork's own hard edge visible. */}
    <h1 className="relative w-[min(88vw,760px,69dvh)]">
      <Lockup priority className="h-auto w-full" />
    </h1>

    <p className="text-muted relative -mt-2 max-w-xl text-base leading-relaxed text-balance sm:text-lg">
      The room where software actually gets built. Projects, deliverables,
      decisions and the record of how you got there — held in one place, for the
      whole lifecycle.
    </p>

    <div className="relative mt-10 flex flex-wrap items-center justify-center gap-3">
      <ActionLink href="/sign-in">Enter your room</ActionLink>
      <ActionLink href="#how" variant="ghost">
        See how it works
      </ActionLink>
    </div>

    <div aria-hidden className="rule-glow absolute bottom-0 left-0 w-full opacity-60" />
  </section>
);
