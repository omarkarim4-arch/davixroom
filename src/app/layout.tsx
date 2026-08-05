import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://davixroom.com'),
  title: {
    default: 'DavixRoom — Live Development Workspace',
    template: '%s — DavixRoom',
  },
  description:
    'A live workspace for the software development lifecycle. Projects, deliverables, recorded decisions and an immutable timeline. By Davix Tech.',
  applicationName: 'DavixRoom',
  openGraph: {
    type: 'website',
    siteName: 'DavixRoom',
    title: 'DavixRoom — Live Development Workspace',
    description:
      'A live workspace for the software development lifecycle. Projects, deliverables, recorded decisions and an immutable timeline.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'DavixRoom — Live Development Workspace',
    description: 'A live workspace for the software development lifecycle.',
  },
};

export const viewport: Viewport = {
  themeColor: '#000000',
  colorScheme: 'dark',
};

/**
 * Decides before first paint whether the landing intro should play.
 *
 * This runs as a blocking inline script rather than in an effect because the
 * alternative is a black overlay flashing on every navigation for anyone who
 * has already seen it. Stamping the decision on <html> lets CSS suppress the
 * overlay in the very first frame.
 */
const introDecisionScript = `
try {
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var seen = window.sessionStorage.getItem('dvx-intro') === 'seen';
  document.documentElement.dataset.intro = (reduce || seen) ? 'skip' : 'play';
  if (!reduce && !seen) window.sessionStorage.setItem('dvx-intro', 'seen');
} catch (e) {
  document.documentElement.dataset.intro = 'skip';
}
`.trim();

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      // The intro script stamps data-intro on this element before React
      // hydrates, which is the whole point of running it early — the attribute
      // is expected to differ from the server's markup.
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: introDecisionScript }} />
      </head>
      <body className="bg-void text-ink flex min-h-full flex-col">{children}</body>
    </html>
  );
}
