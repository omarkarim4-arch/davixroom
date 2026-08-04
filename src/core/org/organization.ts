import type { OrganizationId } from '../ids';

/**
 * DavixRoom is two-sided: a vendor organization builds software for a client
 * organization. Both are first-class tenants, and a project always spans
 * exactly one of each. Capabilities differ by side — a client approves work,
 * a vendor produces it.
 */
export type OrganizationKind = 'vendor' | 'client';

export type Organization = {
  readonly id: OrganizationId;
  readonly kind: OrganizationKind;
  readonly name: string;
};
