import type { ReactNode } from 'react';

type SectionProps = {
  readonly id?: string;
  readonly children: ReactNode;
  readonly className?: string;
};

/** Shared page rhythm: one measure, one set of gutters, one vertical cadence. */
export const Section = ({ id, children, className }: SectionProps) => (
  <section
    id={id}
    className={`mx-auto w-full max-w-6xl scroll-mt-24 px-6 py-24 sm:px-10 sm:py-32 ${className ?? ''}`}
  >
    {children}
  </section>
);

export const Eyebrow = ({ children }: { readonly children: ReactNode }) => (
  <p className="eyebrow">{children}</p>
);

export const SectionHeading = ({ children }: { readonly children: ReactNode }) => (
  <h2 className="mt-5 max-w-2xl text-3xl leading-[1.15] font-semibold tracking-tight text-balance sm:text-[2.5rem]">
    {children}
  </h2>
);
