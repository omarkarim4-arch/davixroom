import type { Metadata } from 'next';

/**
 * Exists solely to give the sign-in route a title.
 *
 * The page itself is a client component, which cannot export metadata, so the
 * title has to live in a server component wrapping it. This layout adds no
 * markup and no behaviour — it renders its children untouched.
 *
 * The root layout's `%s — DavixRoom` template turns this into
 * "Sign in — DavixRoom".
 */
export const metadata: Metadata = {
  title: 'Sign in',
};

export default function SignInLayout({ children }: LayoutProps<'/sign-in'>) {
  return children;
}
