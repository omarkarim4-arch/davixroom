import Link from 'next/link';
import { BrandLockupSmall } from '@/components/brand/logo';
import { ActionLink } from '@/components/ui/action-link';

const links = [
  { href: '#what', label: 'What it is' },
  { href: '#capabilities', label: 'Capabilities' },
  { href: '#how', label: 'How it works' },
  { href: '#security', label: 'Security' },
] as const;

/**
 * Deliberately no backdrop blur.
 *
 * A blur buys almost nothing over a near-black page, and `backdrop-filter`
 * forces everything beneath it into its own compositing layer — which, with a
 * full-bleed alpha image in the hero, made the logo drop out of rendered
 * frames entirely. Plain opacity gets the same look with none of that.
 */
export const SiteHeader = () => (
  <header className="bg-void sticky top-0 z-40 border-b border-white/8">
    <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-6 px-6 py-4 sm:px-10">
      <Link href="/" aria-label="DavixRoom home">
        <BrandLockupSmall />
      </Link>

      <nav className="hidden items-center gap-8 md:flex">
        {links.map((link) => (
          <a
            key={link.href}
            href={link.href}
            className="text-muted hover:text-ink text-sm transition-colors duration-200"
          >
            {link.label}
          </a>
        ))}
      </nav>

      <ActionLink href="/sign-in" variant="ghost" className="shrink-0">
        Sign in
      </ActionLink>
    </div>
  </header>
);
