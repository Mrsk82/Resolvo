# Resolvo Inbox 2.0: what was built, how to test it, how to roll it out and back

Branch: `inbox-2` (rollback point: tag `inbox2-rollback-point` = commit 8b8e709, the state before any inbox work).
Status: built and tested locally. **Not deployed.** AI features (phase 4 of the plan) were set aside on request.

## 1. Summary

| Phase | What | State |
|---|---|---|
| 0 | Audit and plan | Done (`phase0-audit-and-plan.md`) |
| 1 | Reliable sending and saving | Done. On for everyone (bug fixes). |
| 2 | Inbox gaps: grouped views, filters, search, archive, bulk | Done. Behind the pilot switch. |
| 3 | Conversation polish: timeline, folding, history, customer card | Done. Behind the pilot switch (delivery state is on for everyone). |
| 4 | AI features | **Set aside by request.** Nothing changed in the AI code. |
| 5 | Pilot release and rollback | Pilot switch built and tested. Deployment is yours to call. |

### The pilot switch
`INBOX_PLUS_ENABLED` (Owner Portal, per workspace, under Support). **Off for every plan.** Only the owner turns it on, per workspace.
Off = the inbox looks and works exactly as before (verified by test). On = the Phase 2 and 3 screens below.
The sending fixes (phase 1) are bug fixes and are on for everyone whatever the switch says.

## 2. Phase 1: reliable sending (on for everyone)

Problems found and fixed:
1. A failed email was shown as sent. Now a reply is saved as `pending`, and becomes `sent` only when the provider accepts it, or `failed` with the reason.
2. A reply could go out twice (double click, replayed offline message). Every send now carries a key; the same key returns the existing message and sends nothing.
3. Reply text was put into the email as raw HTML. It is now escaped (the plain-text part keeps exactly what the agent typed).
4. A slow WhatsApp/SMS/social send could overwrite newer changes. The ticket is now re-read just before saving.
5. First-response time now counts from delivery, not from pressing Send. "Send and resolve" no longer resolves a ticket whose email failed.

On screen: the message shows **Delivered / Sending / Not delivered** and a **Retry sending** button; the list shows a "Reply not delivered" badge.

Audit items checked and found fine (no change needed): incoming email de-duplication is atomic (the whole ingest path is synchronous), and no read-only user role exists, so there was nothing to restrict on ticket changes.

## 3. Phase 2 and 3 (pilot switch on)

- **Views list** grouped as in the brief: Workspace (All inbox, My conversations, Unassigned, Following), Priority (Urgent, High priority, SLA at risk, SLA breached), Status (New, Open, Pending, Waiting for customer, Resolved, Closed, Archived), Other (Snoozed, Promotions and alerts, Listening), Custom views. Real counts. Docked beside the ticket list on wide screens (inbox 1100px or wider), slides over on narrower ones, can be hidden and the choice is remembered.
- **Search** now also reads the text of messages (customer and team).
- **Filters:** customer mood, read/unread, VIP. **Sorts:** latest activity, waiting longest for us.
- **Bulk:** mark read, mark unread, archive and move back (with a confirmation that explains what happens).
- **Archive:** finished (resolved or closed) tickets only. They leave every view and count, stay searchable under Archived, and come back by themselves when the customer writes again.
- **Follow / unfollow** a ticket from its menu; Following view.
- **Saved views** now remember every filter (before: four).
- **Timeline:** assignment and priority changes are now recorded ("Assigned to Sam", "Priority High to Critical"); recent system events (latest six) appear between messages on desktop and tablet; long conversations show the first message and the latest three, with one click for the rest.
- **Customer card:** shows the date of their first ticket (real data only).
- An unhappy customer's row gets an "Unhappy" marker.

## 4. API (all additive, same `POST /api/call` style)

| Call | Arguments | Result |
|---|---|---|
| `replyToTicket` | `ticketId, text, isNote, clientKey?` | `{success, msgId, deliveryStatus?, warning?, duplicate?}`. Email replies: `deliveryStatus` is `sent` or `failed`. |
| `retryReply` (new) | `ticketId, msgId` | `{success, deliveryStatus, warning?}`. Re-sends the same message; a message already sent is not sent again. |
| `archiveTickets` (new) | `ids[], archive` | `{updated, skipped}`. Archive only accepts resolved/closed tickets. Up to 500 ids. |
| `markTicketsRead` (new) | `ids[], read` | `{updated}`. Per person. |
| `getTickets` | new filters `sentiment`, `read`, `vip`, `following`, `status:'waiting'|'archived'`; new sorts `activity`, `waiting`; search covers message text | Rows add `deliveryFailed`, `archived`. `counts.inbox` adds `waiting, high, following, archived, byStatus`. |
| Feature flags | `INBOX_PLUS_ENABLED` | Resolved per workspace; never granted by a plan. |

Ticket data additions (all optional, old tickets unaffected): message `deliveryStatus, deliveryError, deliveryAttempts, deliveredVia, clientKey`; ticket `archived, archivedAt, archivedBy`; history events `assigned, priority_changed, email_sent, email_failed, archived, unarchived`.

## 5. Files changed

| File | Change |
|---|---|
| `server.js` | reply delivery (`replyToTicket`, `retryReply`, `_deliverEmailReply`, `_recordDelivery`, `_sendReplyCCs`), `getTickets` filters/sorts/counts/search, `archiveTickets`, `markTicketsRead`, history entries in `assignTicket` / `updateTicketPriority`, `INBOX_PLUS_ENABLED`, mail-capture now records html for tests |
| `public/js/rv-inbox.js` | delivery state and Retry, grouped views, new filters, bulk actions, archive/follow, timeline and folding, dock/collapse, pilot gating |
| `public/js/app-core.js` | saved views keep all filters, legacy reply screens report failed delivery, customer card first-ticket date |
| `public/js/rv-mobile-plus.js` | every queued offline reply gets a key |
| `public/css/rv-inbox.css`, `public/index.html` | styles, docked layout (pilot only), cache-busting versions |
| `docs/ui-redesign/tools/` | new tests (below) and `run_against_copy.js` |

## 6. Tests

| Suite | Checks | Covers |
|---|---|---|
| `reply_reliability_test.js` | 25 | failed send, retry, no double send (including three simultaneous clicks), escaping, notes, sample tickets |
| `inbox_phase2_test.js` | 41 | search, filters, read/unread, sorts, archive and auto-return, counts, history, pilot switch on/off, rollback brings archived tickets back |
| `inbox_phase2_ui_test.py` | 45 | grouped views, docked/collapse/remembered, narrow and phone, filters, saved views, bulk and archive dialog, follow, folded thread, pilot-off unchanged |
| `inbox_perf_test.js` | 10 | 5,000 tickets: about 70 ms per list call. 25,000 tickets: 0.3 to 1.2 s. No database change needed. |
| existing, run on a throwaway copy | inbox_focus 72, first_customers 30, reply_helpers 10, mobile 17, nav 12, phone_features 23, housekeeping 17, topics 74 + 34 | no regressions |

Run `node docs/ui-redesign/tools/run_against_copy.js <test files>` to run the older suites against a throwaway copy instead of the local server.

## 7. Known limitations

- **Attachments are only partly supported.** Agents can add a photo or file to a reply with the Photo and File buttons (added in the phone work): the file is uploaded to the server and a link to it is put in the reply text. Still missing: real email attachments on outgoing mail, and storing and showing the files customers send us on incoming email. That needs its own design (storage, size limits, safe viewing). (An earlier version of this note wrongly said attachments were not supported anywhere.)
- **AI features** of the brief (reply assistant tones, structured summary, mood with confidence, assignment recommendations, duplicate reasons, Copilot) were not started. Existing AI buttons are unchanged. Two existing AI calls still include internal notes in their prompt, and the platform's AI key is still used when a brand has none; both should be fixed before AI is extended.
- Saved views live in the browser (per person, per device), as before.
- "Newest first" keeps unread tickets on top (as before); there is no separate "unread first" sort.
- System events in the timeline are not shown on phones (the phone reply bar is pinned under the thread).
- "Waiting more than 24 hours" is not a filter yet.
- Hiding the views list is remembered per browser.
- Older tests `customers_test.py` and `promo_test.py` write test rows straight into the local demo database and cannot run on a copy.
- Older suites that sign in as the local demo admin (architecture, dashboard trends, owner console, site audit, phone plus) could not be re-run at the end: the local demo admin password is no longer `demo1234`. They passed earlier in this work.

## 8. Deployment

Nothing is deployed. When you decide:
1. Merge `inbox-2` into `main` (or deploy the branch), then run the usual deploy: `ssh ... "cd /opt/resolvo && git pull origin main && npm install --omit=dev && pm2 restart resolvo"`.
2. The sending fixes are live immediately for everyone.
3. The new inbox stays hidden until you switch it on: Owner Portal, the workspace, Features, "Inbox 2.0", on. Start with the demo workspace, then showcase, then one real workspace.
4. Watch for a day: failed-delivery badges (real problems finally visible), and the Architecture page / `pm2 logs resolvo`.

## 9. Rollback

- **Per workspace (instant):** switch `INBOX_PLUS_ENABLED` off. The inbox is as before, and any tickets that were archived show in the normal views again (archive only exists while the switch is on; tested).
- **Whole release:** deploy the tag `inbox2-rollback-point` (`git checkout inbox2-rollback-point`, deploy, `pm2 restart resolvo`). No database migration was made, so nothing needs undoing; the new optional fields on tickets are ignored by the old code.
