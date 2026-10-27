# Phase 4b: Inbox A + B (three-panel refinements and Focus mode)

Approved direction: **A (three panel) as the main inbox, B (Focus queue) as a mode.** C (board), D (chat) and E (table) are not built.
Reference samples: `Resolvo-UI-files/inbox-samples/` (A-three-panel.html, B-focus-queue.html).

## A: the main inbox, quieter
| Area | Change |
|---|---|
| Ticket rows | Name + channel chip on one line, subject, one-line preview. Badges only when they need a decision: SLA (breached / hours left), High or Critical priority, a status other than Open, VIP, Snoozed, and a red "Unassigned". Ticket id and the always-on channel text moved out of the row. |
| Selected row | 4px accent bar, tinted background, inset outline, accent-coloured name. |
| List header | "Tickets", "n of N", and the **Focus mode** button. The count moved up from the bottom. |
| Conversation header | Avatar, subject, then **customer name** (bold) + email, channel, ticket id, "opened 2h ago". |
| Composer | Reply / Internal note tabs with the recipient on the same line, textarea, AI suggestion, Saved replies, a `Ctrl Enter` hint, Send. The long explanatory sentence is gone. |
| Hover card | The floating preview card (legacy) no longer opens over the new rows; it covered the conversation. |
| Unchanged | Views with counts, saved views, filters and chips, bulk actions, customer card, status / priority / assignee, disposition rule. |

## B: Focus mode
Switch on from **Focus mode** in the list header; switch off with **Full inbox**. The choice is remembered (`tt_inbox_focus`). **On phones (under 720px) Focus is the default** until the person chooses otherwise. A dashboard link that names a view (for example "SLA breached") opens the full inbox for that visit.

**Queue page.** "Good morning, {first name}", three cards, then one list.
- *Needs you now*: open tickets assigned to you or unassigned where the customer spoke last.
- *Waiting on customer*: open tickets where the team spoke last (notes ignored) or the status is Pending. Counted by the server (`counts.waiting`).
- *Resolved today*: resolved or closed today, India time (`counts.resolvedToday`).
- Tabs: Needs you, All open, Mine, Unassigned, Waiting, Resolved today.
- Order: **SLA breached, then SLA at risk, then priority (Critical to Low), then unread first, then oldest first.** The 200 most urgent tickets are loaded; a note says when there are more.

**Reading page.** Full width. `← Queue`, "3 of 8", previous / next. Ticket card with status, priority, SLA and owner badges; two folds: *Status, priority and owner* (selects) and *Customer details* (the same customer card, loaded when opened). Thread, then a composer that sticks to the bottom (on phones it follows the thread so it never covers the message).

**Send & resolve, then next.**
1. Needs a reply (empty reply is refused with a message; Internal note mode is refused).
2. If a disposition is required it is asked for **first**, before anything is sent.
3. Sends the reply. If that fails: nothing is resolved, the text stays, an error says why.
4. Marks the ticket Resolved. If that fails after a successful send: the reply is shown in the thread, the ticket stays open, and the message says exactly that.
5. Only then: toast, ticket removed from the queue, next ticket opened (or back to the queue with "You are all caught up").
Both buttons are disabled while a request runs, so nothing is sent twice.

**Keys** (only on the Focus screens; ignored while typing or while a dialog is open): `J` / `K` next / previous (in the queue the arrow keys also move), `Enter` open, `R` reply box, `E` resolve and next without a reply (refused if there is an unsent reply), `Esc` back (first `Esc` leaves the reply box), `Ctrl+Enter` send, `Ctrl+Shift+Enter` send and resolve. These match the full ticket page, where `R` and `E` already existed. The handler runs before the app's older single-letter shortcuts and stops the keys it uses.

## Server
`getTickets` adds `counts.waiting`, `counts.resolvedToday` and `awaitingCustomer` on each ticket (`_awaitingCustomer` in server.js). Nothing else changed.

## Files
`public/js/rv-inbox.js` (v6), `public/css/rv-inbox.css` (v3), `public/index.html` (script versions, hover-card exclusion, dashboard view link), `server.js`, `docs/ui-redesign/tools/inbox_focus_test.py`.

## Checks
`python docs\ui-redesign\tools\inbox_focus_test.py` runs 72 checks on the local server (sample tickets only; the Focus queue is filtered to them in the browser, so other tickets are never touched): row and header content, queue order against an independent computation, counts, every key, the empty-reply and unsent-draft refusals, a failed send, a send that works but a resolve that fails, the full Send & resolve flow and its counters, the disposition dialog, the end of the queue, remembered choice, dashboard link, and the phone layout (no sideways scroll, composer reachable). Result: **72 passed**.
Route and width run (30 routes x 5 widths): same 5 findings as before this phase (the `my-dashboard` page is blank for the demo admin; it was blank before the redesign started). Control inventory: unchanged except one new button (Focus mode) on the inbox.

## Known and left alone
- The app's older global shortcuts (`n`, `k`, `d`, `l`, `q`) call `self.navigate`, which is not a function, so they throw a console error and do nothing. Pre-existing; not touched because fixing it would make `K` jump to the Kanban board on other screens.
- HTML-only emails still show plain text in the thread.
- Saved views do not store the newer filters.
- Agent-role permissions have not been tested in Focus mode (tested as Admin).

## Update 27 Oct: calmer default
After live review ("too much on the same screen") the inbox opens as **two panels: list and conversation**. The views list (saved views, queue tools) slides in from the left with the **Views** button; the customer card slides in from the right with **Customer**. Clicking the list or conversation closes either. The view pills with counts stay above the list. Phones are unchanged.
