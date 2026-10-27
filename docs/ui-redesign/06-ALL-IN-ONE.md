# Phase 6: the full suggestion list, built (27 Oct)

Directions chosen: Settings = S2 card hub landing + S1 searchable side list; Insights = one page with Overview, Questions, Team, Reports, Customers tabs.
Tests live in `docs/ui-redesign/tools/` (run each with `python <name>.py` against the local server; they use sample or seeded `.invalid` data only).

| Area | What changed | Test |
|---|---|---|
| Inbox clean-up | **Promotions and alerts** view: newsletters and system alerts that became tickets are kept out of counts, the working queue, Focus, the dashboard and auto-distribute. Admin: close all, or close all and block senders. Per ticket: "move to inbox". Server: `_ticketIsPromo`, `getTickets` `promo` filter and `counts.inbox`, `closePromoTickets`, `markNotPromo`. | promo_test (22) |
| Batch assign | "Assign to..." in the bulk bar (me or anyone); one summary email instead of one per ticket. `bulkAssignTickets`. | promo_test |
| Reply helpers | Type `/` in the reply box for saved replies; "customer has been waiting 5 hours" nudge; quick snooze (3 hours, tomorrow 9am, Monday 9am). | reply_helpers_test (10) |
| Settings | Landing page with real status per section and a "Needs your attention" strip (`getSettingsOverview`); side list with search and breadcrumb around every section; existing forms restyled as calm cards. All 36 sections still load. | settings_test (16) |
| Insights | One page: Overview (KPIs, compare, chart), Questions (six plain-language answers), Team (alerts, sortable table, busy-hours map). Reports and Customer health keep their pages under the same tab bar. `getInsights`. Sidebar has one Insights entry. | insights_test (23) |
| Dashboard | "Today" page: Needs you now (opens the ticket; Work through them opens Focus), numbers match the inbox, agents do not see team admin cards. | dashboard_test (9) |
| First run | Steps: connect email, see a conversation, first reply, invite, saved reply. Trial days left in the sidebar. | dashboard_test |
| Customers | Health badges (VIP, at risk, happy, active), last contact, At risk and VIP filters, duplicate review and merge (one customer can hold several emails and phones), promotions never become customers, WhatsApp numbers recognised. | customers_test (14) |
| Issues | Ticket and issue link to each other ("Raised from ticket ..." and "Issue ISS-... ->"). | nav_test |
| Navigation | Ctrl+K finds tickets and customers by name and lists support actions and Insights; sidebar no longer repeats Automation (it is in Settings). | nav_test (12) |
| Mobile | Installable app (manifest, icons, service worker, offline page); **alerts on devices** (assigned to you, close to or past target) via web push, switched on per device in Settings > My Notifications; swipe right to take, left to snooze on phones; `/?open=TICKET` links. | mobile_test (17) |
| Housekeeping | The nine older themes are retired: saved themes map to Resolvo Light or Dark, the picker offers two, a brand theme no longer overrides the person's choice. Older single-letter shortcuts (N, D, L, Q, K, ?) now work (they used to throw an error) and stay out of the inbox screens. | housekeeping_test (17) |

## Notes for deploy
- `npm install` runs in the deploy script, which installs the new `web-push` package. Push keys are created on first start in `data/vapid.json` (not in git). If the package is missing, device alerts stay off and nothing else is affected.
- Phones need the site over HTTPS for the service worker and alerts (the live site is). On iPhone, alerts need the app added to the Home Screen first.
- The "SLA past target" alert job runs every 10 minutes and only reads workspaces that have at least one device registered.
- `my-dashboard` in the route test is not a page (the sidebar entry is a link to `/dashboard.html`, now named Custom Dashboard); the earlier "blank page" finding was that test route name.

## Not done
- A calmer full ticket page (right panel) beyond the issue link.
- A "Resolve" swipe (needs the disposition step; left swipe snoozes instead).
- Agent-role walk-through of every new screen (tested as Admin).
