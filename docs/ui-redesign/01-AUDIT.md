# Resolvo UI/UX redesign: Phase 1 audit and baseline

Date: 2026-10-23. Code baseline: commit `4b79eb1`. Everything below was measured from the source and from an automated run of the app, not assumed.

## 1. Architecture (what we are redesigning)
| Item | Finding |
|---|---|
| Frontend | One hand-written single-page app: `public/index.html`, 31,352 lines, about 2 MB. No framework, no build step, no component library. |
| Routing | `App.navigate(page, params)` with one large `switch` (65 cases). No URL routing; deep links are limited to the page the server serves (`/`, `/crm`, `/portal/<brand>`). |
| State | One global `App` object plus `localStorage` (`tt_session_token`, `tt_theme`, filters, view mode). |
| Rendering | Each screen is a JavaScript function that builds an HTML string and writes it to `#contentArea`. |
| Data | `App.callAsync('<rpc>', ...)` into `POST /api/call` (305 distinct RPC names used) plus 88 REST endpoints (`/api/crm/*`, `/api/onboarding-status`, ...). Per-brand SQLite behind it. |
| Auth and tenancy | `x-session-token` header; every API reads the brand from the session, never from the request. Unchanged by this redesign. |
| Other HTML | 78 more static pages in `public/` (marketing, blog, `crm.html`, `portal.html`, `signup.html`). They are separate from the app. |

## 2. Navigation inventory (sidebar, 27 items)
- **Home:** Dashboard (`dashboard`), My Dashboard (custom handler, not a router page).
- **Inbox:** Ticket Inbox (`ticket-inbox`), Customers (`customers`).
- **Issues:** New Issue (`create-issue`), All Issues (`issue-list`), My Issues (`my-issues`), Kanban Board (`kanban`), Sprints (`sprints`).
- **Knowledge:** Knowledge Base (`settings` tab).
- **Automation:** Automation Rules, Escalation Rules (both `settings` tabs).
- **Analytics:** Reports, Analytics, Workload, Customer Health, Export.
- **Integrations:** Integrations (`integration-marketplace`).
- **Admin (visible to admins):** Users, Teams, AI Hub, Announcements, Platform Data, Settings, API Integration, Release Notes, Audit Trail.
- 38 router routes have no sidebar item and are reached from buttons and links (ticket detail, customer profile, SLA settings, email ticketing, escalations, leaderboard, forecast, and so on). All must stay reachable.

## 3. Baseline results (automated, 30 routes x 5 widths = 150 checks, theme Resolvo Light)
- **Console and page errors:** none.
- **Horizontal overflow or content outside the screen:** none at 1440, 1280, 1024, 768 and 390.
- **Empty or blocked screens:** none (the one "empty" result was the My Dashboard sidebar link, which uses its own handler and is not a router page).
- **Functionality inventory:** 29 screens, 190 buttons, 6 links, 71 inputs, 27 dropdowns, 23 checkboxes in content areas, plus 27 sidebar items and 16 topbar controls. Saved as `baseline/inventory_before.json`. The same script is re-run after each phase and diffed, so a removed control shows up immediately.
- **Baseline screenshots:** `Resolvo-UI-files/baseline/before_<route>_<1440|390>.png` (60 images).

## 4. CSS and design-system health
| Measure | Value | Problem |
|---|---|---|
| Theme blocks | 11 themes (midnight, arctic, forest, sunset, ocean, slate, uiux, neon, rosegold, nova, clarity) + the 2 new Resolvo themes | Each redefines colours, some also layout. Nova and Clarity inject their own dashboards. |
| `!important` | 534 | Layers of overrides fighting each other. |
| Base CSS | 337 KB inline | `.sidebar` is defined 12 times, `.topbar` 11, `.nav-item` 13, `.content-area` 10, `.btn-primary` 9, `.card` 7. |
| Inline `style=""` in the templates | 4,492 | Spacing, colours and borders are repeated by hand in JavaScript strings. |
| Hard-coded hex colours | 1,237 | Not on tokens, so they ignore the theme. |
| Breakpoints | 768, 900, 1100, 1200, 480, 600, 1400, 1024, 769 | Nine different values, no system. |
| Accessibility attributes | 21 `aria-label`, 14 `role=`, 3 `alt` in 31k lines | Weak: icon buttons without names, little keyboard support in custom widgets. |
| Fonts | Inter via the inline CSS; monospace used heavily for labels | Fine, but the mono labels hurt readability in tables. |

## 5. Gap analysis against the brief
| Brief requirement | Today | Gap |
|---|---|---|
| Design tokens only | Resolvo v3 tokens exist (`resolvo-v3.css`); the older code still uses hex values and 11 themes | Medium: migrate templates off hard-coded colours |
| Collapsible sidebar, tooltips, drawer on mobile | Collapse toggle and `data-tooltip` exist (27/27); phones use a bottom bar | Small |
| Sidebar footer not oversized | Compacted in stage 2 | Small |
| Header: workspace/page context, search, AI entry, notifications, profile | Title and breadcrumb, AI bar, notification bell are there. Profile lives in the sidebar. | Medium |
| One contextual primary action | The topbar button is always "+ New Issue" (creates an issue, though its tooltip says "Create ticket"). The dashboard has a second "+ New ticket". | Real UX defect: two buttons, different meanings |
| Dashboard date-range selector | The "Last 14 days" pill added in stage 1 was decorative. **Fixed 2026-10-23:** removed, and a working 7 / 14 / 30-day control now sits on the Ticket volume chart (backend `getSummaryStats({days})`, default unchanged). | Done for the chart; KPI cards, channel donut and team panel are all-time and are labelled as such in Phase 4 |
| KPI: SLA compliance | Not shown | Small: computable from existing ticket data |
| KPI trends | Only total tickets, only when valid | Correct as is |
| Attention panel clickable | Opens the inbox, not a filtered view | Small |
| Escalation watchlist on the dashboard | Missing | Medium |
| Inbox: three panels with collapsible customer panel | Three panels on wide screens only; customer panel not collapsible | Medium |
| Inbox filters: assignee, team, tags, date | Status, channel, priority and saved views exist; assignee/team/tags/date are not in the UI | Medium (need to confirm the data model has them) |
| Inbox: keep filters when moving between tickets | Filters persist in memory; the list reloads on actions | To verify and tighten |
| Mobile inbox as list OR conversation | Not implemented as a focused flow | Medium |
| Reusable components | No component layer; markup is repeated | Large |
| Tables usable on small screens | Pass in baseline (no overflow) | Keep |
| AI integrated where relevant | AI Hub, AI bar, "AI Assistant: Suggest a reply" exist | Audit before touching (section 6) |

## 6. Existing AI (audit result, nothing duplicated)
Present: AI command bar in the topbar, AI Hub page, "Suggest a reply" in the ticket composer, triage, summary stats. The redesign will re-skin and reposition these; it will not add duplicate AI features.

## 7. Backend dependencies identified (none required for visual work)
1. Dashboard date range: `getSummaryStats` returns a fixed 14-day series. A working range selector needs a `days` argument (small change).
2. SLA compliance %, at-risk counts and an escalation watchlist: derivable from existing ticket and escalation data; may need one new read-only RPC.
3. Inbox filters by assignee, team and tag: need confirming against the ticket model and the `getTickets` filter arguments.
4. Per-customer "health": exists as the Customer Health screen; a per-customer score on the profile would need an endpoint.
No schema changes are needed for the visual redesign.

## 8. Risks and decisions for you
1. **No rewrite.** A framework rewrite of a 31k-line app would break behaviour (the brief forbids that). Plan: keep the SPA, build a proper design layer, and migrate screen by screen.
2. **The 11 old themes.** The brief asks for one consistent system. Keeping all of them multiplies the testing and conflicts. Recommendation: keep Resolvo Light and Resolvo Dark as the supported themes and retire the other nine after a deprecation notice. Your decision.
3. **My earlier stages** (dashboard, inbox columns, customer profile) are real improvements but were built as overrides on top of the old CSS, which the brief says to avoid. They will be folded into the design layer in Phase 2.
4. **Verification limits:** my test workspace is a demo brand. Role-based checks (Agent vs Admin, plan gating) need extra test users; I will create them locally.

## 9. How to re-run the baseline
```
python baseline.py resolvo after     # routes x widths, errors, overflow, screenshots
python inventory.py after            # every control on every screen
```
Then diff `inventory_before.json` and `inventory_after.json`.
