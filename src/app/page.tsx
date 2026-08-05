import { redirect } from 'next/navigation';
import { getAuthenticatedCaller } from '@/infra/auth/session';
import { IntroSequence } from '@/components/landing/intro-sequence';
import { SiteHeader } from '@/components/landing/site-header';
import { Hero } from '@/components/landing/hero';
import { Positioning } from '@/components/landing/positioning';
import { Capabilities } from '@/components/landing/capabilities';
import { HowItWorks } from '@/components/landing/how-it-works';
import { Security } from '@/components/landing/security';
import { CtaBand } from '@/components/landing/cta-band';
import { SiteFooter } from '@/components/landing/site-footer';

/**
 * The public face of DavixRoom.
 *
 * Signed-in callers never see it: this route is where `signIn` lands, so it
 * forwards them on to the workspace. Deciding with `getAuthenticatedCaller`
 * rather than `withCurrentUser` keeps an anonymous visit off the database
 * entirely — the landing page is the most-hit route and owes nobody a query.
 */
export default async function Home() {
  const caller = await getAuthenticatedCaller();

  if (caller !== null) {
    redirect('/dashboard');
  }

  return (
    <>
      <IntroSequence />
      <SiteHeader />
      <main className="flex flex-col">
        <Hero />
        <Positioning />
        <Capabilities />
        <HowItWorks />
        <Security />
        <CtaBand />
      </main>
      <SiteFooter />
    </>
  );
}
