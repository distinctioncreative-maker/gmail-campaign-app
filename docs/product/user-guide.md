# User Guide

Welcome! This app lets you send email campaigns through **your own
Gmail**, with your leads and campaigns kept private to you.

## Signing in

Open the app link and click **Sign in with Google**. During the private
pilot, use an account on a domain that an administrator has approved.
Consumer Gmail accounts remain blocked until public OAuth verification is
complete and production signup is deliberately switched to open mode.

## Switching accounts and signing out

On a computer, use the account control at the bottom of the left sidebar. On
a phone, open **More** and use the account control at the bottom of the sheet.
The control is labeled **Switch or sign out** so the actions are visible
without guessing that the profile card is clickable.

**Switch account** opens the Google account chooser and creates a fresh
Cadence session for the selected approved account. **Sign out** ends the
server session and the browser's Firebase session, then returns to the public
homepage. Disconnecting Gmail in Settings is separate: it revokes Cadence's
campaign access but does not sign you out of the app.

## Connecting your Gmail

1. Go to **Settings**.
2. Click **Connect Gmail** and approve the Google screen.

What the app can do once connected: create and send email drafts as you,
and read replies to your campaign threads (so follow-ups stop when
someone answers). What it cannot do: delete your email or change your
account settings. You can click **Disconnect Gmail** at any time.

## Importing leads

1. Go to **Leads**.
2. In Salesforce, select your list rows and copy them.
3. Paste into the big box and click **Preview leads**.
4. Check the badges:
   - **Ready** — will be imported
   - **Missing email** — can't be imported (no valid email found)
   - **Opted out** — excluded automatically for safety
   - **Used before** — you've contacted them; tick the box only if you
     really want to include them again
5. Untick anyone you don't want, then click **Continue with selected
   leads**.

Don't worry about formatting — extra spaces, tabs, or a missing amount
are handled for you, and anything unusual shows a note on that row.

## Preparing a campaign

1. Create or choose a reusable template.
2. Include both `{{physical_address}}` and `{{unsubscribe_text}}` in the
   message body. Cadence blocks launch if the initial or any A/B template
   omits either field.
3. Choose a contact list and review exclusions. Opt-outs, unsubscribes,
   hard bounces, and active suppressions cannot be overridden.
4. Choose a send window and daily pace. Cadence warns on aggressive
   settings and rejects anything above the current plan cap.
5. Review the final recipient count. Campaigns over 100 recipients require
   typing `SEND` before launch.

## Test mode and going live

New workspaces start in test mode. In test mode, every campaign destination
is replaced at the final Gmail boundary with the configured test address.
An administrator must review setup and deliberately switch the workspace to
live sending. If the deployment-level test lock is enabled, the in-app
switch cannot bypass it.

## Replies, follow-ups, and do-not-email

Cadence checks the original Gmail thread for replies and bounces. A reply,
unsubscribe request, or hard bounce stops follow-ups. Unsubscribes and
bounces are added to Do Not Email so later campaigns cannot contact the same
address accidentally. If an unsubscribe was classified incorrectly, an
authorized user can review and undo it from the campaign recipient view.

## Reports and tracking

Reports include sends, replies, bounces, unsubscribes, and sequence results.
Open and click tracking is optional and off by default because tracking can
reduce deliverability and automated security scanners can distort the
numbers. Reply rate remains the most trustworthy engagement signal.

## Team workspaces

Team plans add roles, invites, shared oversight, member-level reporting, and
collision checks that help prevent two people in one workspace from
contacting the same person independently. Only admins can control billing,
workspace policy, and live sending.

## Before asking for help

Open **Help** for task-based guides and **Test Center** for safe checks of
sender details, Gmail connectivity, template rendering, import parsing, and
reply classification. Administrators can use **System health** for worker,
cron, Gmail connection, and environment readiness.

For a production incident, follow `docs/operations/incident-response.md`. For deployment
and service setup, follow `docs/operations/setup.md` and `docs/operations/deployment.md`.
