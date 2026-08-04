/**
 * Capabilities are the atomic units of permission. Every guarded action in
 * DavixRoom names one, and `authorize` is the only place they are evaluated.
 *
 * Roles are *bundles* of capabilities rather than checks in their own right.
 * Nothing in the codebase should ever ask "is this user an admin?" — it asks
 * whether a specific capability holds, which is what makes one-off, time-boxed
 * grants (notably `session.control`) possible without special-casing.
 */

export const CAPABILITIES = [
  // Project surface
  'project.view',
  'project.manage',
  'member.invite',
  'history.view',

  // Deliverables and review — the commercial core
  'deliverable.view',
  'deliverable.submit',
  'feedback.create',
  'decision.record',

  // Communication
  'chat.post',

  // Live collaboration
  'session.start',
  'session.join',
  'session.share_screen',

  // Remote control: requesting is a standing capability, being granted control
  // is a separate, session-scoped, expiring grant.
  'session.control.request',
  'session.control.grant',
  'session.control',

  // Artifacts produced by sessions
  'recording.view',
  'recording.publish',

  // AI
  'summary.view',
  'summary.generate',
] as const;

export type Capability = (typeof CAPABILITIES)[number];

/**
 * Project roles. Vendor roles produce work; client roles review and decide.
 * `observer` is deliberately read-only — useful for stakeholders who should
 * see progress without being able to influence the record.
 */
export type Role =
  | 'vendor_owner'
  | 'vendor_developer'
  | 'client_approver'
  | 'client_reviewer'
  | 'observer';

const OBSERVER_CAPABILITIES = [
  'project.view',
  'history.view',
  'deliverable.view',
  'recording.view',
  'summary.view',
] as const satisfies readonly Capability[];

const CLIENT_REVIEWER_CAPABILITIES = [
  ...OBSERVER_CAPABILITIES,
  'feedback.create',
  'chat.post',
  'session.join',
  'session.control.request',
] as const satisfies readonly Capability[];

/**
 * Only the client approver can record a decision. This is the single most
 * commercially significant capability in the product: it is what turns
 * "work shown" into "work accepted".
 */
const CLIENT_APPROVER_CAPABILITIES = [
  ...CLIENT_REVIEWER_CAPABILITIES,
  'decision.record',
] as const satisfies readonly Capability[];

const VENDOR_DEVELOPER_CAPABILITIES = [
  'project.view',
  'history.view',
  'deliverable.view',
  'deliverable.submit',
  'feedback.create',
  'chat.post',
  'session.start',
  'session.join',
  'session.share_screen',
  'session.control.grant',
  'recording.view',
  'recording.publish',
  'summary.view',
  'summary.generate',
] as const satisfies readonly Capability[];

const VENDOR_OWNER_CAPABILITIES = [
  ...VENDOR_DEVELOPER_CAPABILITIES,
  'project.manage',
  'member.invite',
] as const satisfies readonly Capability[];

const ROLE_CAPABILITIES: Readonly<Record<Role, readonly Capability[]>> = {
  observer: OBSERVER_CAPABILITIES,
  client_reviewer: CLIENT_REVIEWER_CAPABILITIES,
  client_approver: CLIENT_APPROVER_CAPABILITIES,
  vendor_developer: VENDOR_DEVELOPER_CAPABILITIES,
  vendor_owner: VENDOR_OWNER_CAPABILITIES,
};

export const capabilitiesForRole = (role: Role): ReadonlySet<Capability> =>
  new Set(ROLE_CAPABILITIES[role]);

export const roleHasCapability = (role: Role, capability: Capability): boolean =>
  ROLE_CAPABILITIES[role].includes(capability);

/**
 * Which organization side a role belongs to. Used to reject impossible
 * memberships, e.g. a client-org user holding a vendor role.
 */
export const roleSide = (role: Role): 'vendor' | 'client' | 'either' => {
  switch (role) {
    case 'vendor_owner':
    case 'vendor_developer':
      return 'vendor';
    case 'client_approver':
    case 'client_reviewer':
      return 'client';
    case 'observer':
      return 'either';
  }
};
