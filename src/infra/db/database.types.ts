/**
 * Generated from the live schema of the DavixRoom Supabase project.
 *
 * Do not edit by hand. Regenerate after applying a migration so this file keeps
 * describing what is actually deployed — it is the version-controlled record of
 * the live schema shape, and a cross-check against the hand-written row types
 * in `mappers.ts`.
 *
 * The repositories query over direct SQL rather than PostgREST, so nothing
 * imports this at runtime today. It exists so a drift between the migrations
 * and the deployed database shows up as a diff.
 */

export type Json =
  string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      organizations: {
        Row: {
          created_at: string;
          id: string;
          kind: string;
          name: string;
        };
      };
      users: {
        Row: {
          auth_user_id: string | null;
          created_at: string;
          display_name: string;
          email: string;
          id: string;
          organization_id: string;
        };
      };
      projects: {
        Row: {
          client_organization_id: string;
          created_at: string;
          id: string;
          name: string;
          status: string;
          vendor_organization_id: string;
        };
      };
      memberships: {
        Row: {
          id: string;
          joined_at: string;
          project_id: string;
          removed_at: string | null;
          role: string;
          user_id: string;
        };
      };
      grants: {
        Row: {
          capability: string;
          expires_at: string | null;
          granted_at: string;
          granted_by: string;
          id: string;
          project_id: string;
          revoked_at: string | null;
          scope_kind: string;
          scope_session_id: string | null;
          subject_user_id: string;
        };
      };
      timeline_events: {
        Row: {
          actor_id: string;
          id: string;
          occurred_at: string;
          payload: Json;
          project_id: string;
          seq: number;
          type: string;
        };
      };
      deliverables: {
        Row: {
          created_at: string;
          created_by: string;
          id: string;
          project_id: string;
          title: string;
        };
      };
      deliverable_versions: {
        Row: {
          artifact_ids: string[];
          deliverable_id: string;
          id: string;
          number: number;
          published_at: string;
          published_by: string;
          summary: string;
        };
      };
      decisions: {
        Row: {
          decided_at: string;
          decided_by: string;
          deliverable_version_id: string;
          id: string;
          rationale: string | null;
          verdict: string;
        };
      };
      feedback: {
        Row: {
          anchor: Json | null;
          author_id: string;
          body: string;
          created_at: string;
          deliverable_version_id: string;
          id: string;
          resolved_at: string | null;
        };
      };
    };
  };
};

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];
