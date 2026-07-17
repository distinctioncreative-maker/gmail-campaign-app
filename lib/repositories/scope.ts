/**
 * Minimal owner/organization scope for repository access. Satisfied by the
 * session-derived AuthContext (interactive routes) AND by the OwnerRef a
 * verified Cloud Tasks payload provides (worker routes). Either way, the
 * owner lands in the Firestore document path, so scoping cannot be
 * bypassed by widening this type.
 */
export interface Scope {
  userId: string;
  organizationId: string;
}
