import Link from 'next/link';
import type { ReactNode } from 'react';

type Variant = 'primary' | 'ghost';

type ActionLinkProps = {
  readonly href: string;
  readonly children: ReactNode;
  readonly variant?: Variant;
  readonly className?: string;
};

const base =
  'inline-flex items-center justify-center gap-2 rounded-md px-5 py-2.5 text-sm font-medium transition-all duration-200 focus-visible:outline-2';

/**
 * The primary action carries the mark's own gradient — bright on the left,
 * deep on the right — so a call to action reads as the same light source as
 * the logo rather than a generic blue button.
 */
const variants: Record<Variant, string> = {
  primary:
    'text-white shadow-[0_0_24px_-6px_rgba(10,132,255,0.75)] hover:shadow-[0_0_34px_-4px_rgba(10,132,255,0.95)] hover:brightness-110 [background-image:var(--gradient-mark)]',
  ghost:
    'text-ink/85 hairline border hover:border-brand/50 hover:text-ink hover:bg-brand/5',
};

export const ActionLink = ({
  href,
  children,
  variant = 'primary',
  className,
}: ActionLinkProps) => (
  <Link href={href} className={`${base} ${variants[variant]} ${className ?? ''}`}>
    {children}
  </Link>
);
