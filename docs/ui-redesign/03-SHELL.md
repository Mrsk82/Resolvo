# Phase 3: application shell (done 2026-10-23)

## What changed
**Sidebar**
- Collapses to a 68px icon rail and expands to 248px. The earlier theme CSS had pinned the width and broken collapsing; fixed. State is remembered (`tt_sb_collapsed`). The page content moves with it.
- All 27 items keep a tooltip when collapsed (27/27).
- The navigation area scrolls on its own, and the last item (Audit Trail) is reachable above the footer. Footer is more compact (the duplicate setup progress bar is hidden because the dashboard shows it).
- Group label "Admin" is now "Administration". Every route and every permission-controlled item is unchanged.
- Phones and tablets up to 768px: slide-in drawer from the menu button, closes on Escape and on the backdrop, and now sits above the header.

**Header**
- A visible global search field (opens the existing search panel; `/` shortcut still works). On narrow screens it becomes an icon.
- The AI field is shortened ("Ask AI") and collapses to an icon below 1360px, expanding when clicked.
- **One contextual primary action** instead of a fixed "New Issue": "New ticket" on Dashboard, Inbox, Customers, Ticket, Reports, Analytics, Workload, Customer Health; "New issue" on Issues, My Issues, Kanban, Sprints; hidden on settings and admin pages and on the issue form. The dashboard no longer has its own duplicate button.
- **Account menu** (avatar): name, email, role, light/dark switch, keyboard shortcuts, plan and upgrade, sign out.
- The header never wraps. Phones get a compact 56px row.

## Verification
- Automated shell test: sidebar width 248 / 68, content offset follows, state survives reload, tooltips 27/27, last nav item reachable, primary action correct on 8 pages, New ticket opens the ticket form, New issue opens the issue form, account menu items, dark-mode switch, search opens, drawer opens and closes at 768 and 390, no horizontal overflow at 1024/768/390, no script errors.
- Header placement checked at 1920, 1440, 1280, 1024, 768, 390: every visible control inside the bar.
- Full baseline (30 routes x 5 widths): no console errors, no overflow.
- Control inventory vs the original baseline: sidebar 27/27 identical; no content-area control removed on any screen; the only change besides the rebuilt dashboard is the global header button (now contextual) plus the new search field and account menu.

## Known limitations
- The footer still holds the plan badge, theme row, Learn/Upgrade/sign-out and legal links (about 185px). Navigation scrolls, so nothing is hidden, but a leaner footer is possible once the old theme picker is retired.
- Role-based visibility (Agent vs Admin navigation) is unchanged but was only tested with an Admin test user. Tests with an Agent user are scheduled for the final verification phase.
- Command palette (Ctrl+K), keyboard shortcut help and the agent status menu keep their original styling for now.
