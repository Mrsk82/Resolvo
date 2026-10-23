# Phase 4: ticket inbox (done 2026-10-23)

## What the inbox is now
A three-panel inbox that follows the width of the inbox itself (container queries), so it behaves correctly with the sidebar open or collapsed.

| Inbox width | Layout |
|---|---|
| 1240px and up | Views, ticket list, conversation, customer card |
| 1000 to 1239px | Views, list, conversation; the customer card opens as a panel from a "Customer" button |
| 720 to 999px | List and conversation; views become a pill row above the list |
| under 720px (phones) | One pane at a time: the list, then the conversation with a Back button |

**Views (left):** My tickets, Unassigned, All tickets, Critical, SLA at risk, SLA breached, Snoozed, plus saved views and the queue/capacity panel. Counts come from the server.
**List:** search (debounced, keeps your place), a Filters panel (status, priority, channel, assignee, team, tag, created from/to, sort), removable filter chips, select-all and bulk actions, load more. Rows show customer, subject, preview, status, priority, SLA, assignee, channel, unread dot, VIP, snoozed, new.
**Conversation:** header with subject, id, customer and channel; status / priority / assignee selects; Resolve; SLA chip; chat-style thread; composer with Reply to customer and Internal note (visually different, with a hint saying who will see it); AI suggestion (the existing feature, nothing is sent until you press send); saved replies; Ctrl+Enter to send. A ticket menu holds Open full page, Snooze/escalate/more (existing menu), and Mark as spam.
**Customer card:** the existing customer card (counts, deals, earlier tickets), tags and classification. Collapsible on narrower screens.

## Behaviour you asked for
- Filters survive switching tickets and survive a reload (stored in the browser).
- The list refreshes in place; the open conversation and its draft are not reset. Drafts are kept per ticket and per mode (reply or note) while you switch.
- Nothing is reported as done until the server confirms. A refused reply leaves the thread unchanged, keeps your text and shows the reason; a refused status, priority or assignee change puts the control back.
- Resolving or closing still honours the "disposition required" rule (a dialog asks for it).
- The old layout is one click away ("Use the classic inbox layout" in the inbox menu) and is used automatically if the new one ever fails to load. Other themes keep the classic inbox.

## Server changes (additive, optional filters; existing callers unchanged)
`getTickets` now also accepts: `assignedTo` (`none` or an email), `team`, `tag`, `dateFrom`, `dateTo` (IST calendar days), `sla` (`breached` or `atrisk`), `active` (not resolved/closed). It returns extra counts (`slaBreached`, `slaDue`, `critical`) and `facets` (assignees, teams, tags with counts).
The dashboard's attention strip now uses the same SLA counts, so "7 breached" on the dashboard opens a list of 7.

## Where each old inbox control went
| Old inbox | New inbox |
|---|---|
| + New Ticket | Header "New ticket" (the single primary action) |
| Check Inbox, Close N New, Spam Settings, WhatsApp Settings, queue settings | Inbox menu (the three dots) |
| Connect Inbox / disabled / disconnected banners | Banner at the top, shown only when something needs attention |
| Close Selected, Mark Resolved, Delete | Bulk bar (appears when tickets are ticked) |
| Mark as spam (hover button on rows) | Ticket menu in the conversation |
| Status, channel, priority accordions | Filters panel and view list |
| Switch to full-page view | "Open full page" in the ticket menu; phones use the one-pane flow |
| Saved views | Saved views list in the left panel |

## Verification
- Automated UI test at 1920, 1440, 1280, 1024, 768 and 390: layout per width, views and counts, filters and chips, search, draft kept when switching tickets, filters kept, note vs reply mode, phone List/Conversation/Back flow. No script errors, no overflow.
- End-to-end on sample tickets (which never send email): priority, assignee, status, reply and internal note all saved and confirmed from the server; refused reply and refused status change both fail safely; bulk bar appears; classic layout switch works both ways.
- Full regression: 30 routes x 5 widths, no console errors, no overflow; control inventory shows no unexpected change on any other screen.

## Known limitations
- Saved views store the original four filters only (status/view, channel, priority, search); the new assignee/team/tag/date filters are not saved inside a view yet.
- The thread shows the plain-text part of an email; for HTML-only emails use "Open full page".
- Not covered by an automated test: real email delivery of a reply (verified only that the server accepts it), and Agent-role permissions (tested as Admin).
