# Google OAuth

Two distinct authorization layers — never conflated:

## Layer 1: App sign-in

- Firebase Auth, Google provider, `openid email profile` only.
- The `hd` custom parameter hints the Workspace domain in the popup;
  the server independently verifies the email domain and (when present)
  the `hd` claim in `lib/auth/session.ts`.
- Result: an HttpOnly session cookie. No Gmail access is granted here.

## Layer 2: Connect Gmail (incremental, per user)

Requested only when the user clicks **Connect Gmail**:

| Scope | Why |
|---|---|
| `gmail.compose` | Create drafts and send them as the connected user. Narrower than `gmail.modify` / `mail.google.com` — cannot read or delete mailbox content. |
| `gmail.readonly` | Read thread/message metadata + content for reply and bounce detection, which stop follow-ups (core safety feature). |

Not requested: `gmail.modify` (only needed if app-managed Gmail labels
ship later), Sheets/Drive scopes (requested incrementally only when the
user chooses a Sheet import or audit-mirror feature in later phases).

Flow details:

- `access_type=offline&prompt=consent` guarantees a refresh token.
- The `state` parameter is a signed 10-minute JWT bound to the signed-in
  user; the callback rejects a mismatch.
- The refresh token is KMS-encrypted before it touches Firestore.
- Disconnect revokes the grant with Google and overwrites the ciphertext.

## Consent screen: internal vs external

**Internal (current deployment target)**: the Cloud project must belong to
the company's Workspace organization. Consent screen type "Internal" —
no Google verification or security assessment needed, and only users in
the organization can authorize.

**External (future)**: Gmail scopes above are *restricted* scopes. An
external consent screen would require Google OAuth verification and a
CASA security assessment before non-Workspace accounts could connect.
Do not switch to external without planning for that process.
