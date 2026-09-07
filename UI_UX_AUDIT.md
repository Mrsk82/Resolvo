# Resolvo UI/UX Audit

Scope: `public/index.html` (~30,000 lines, the entire agent/admin/owner SPA) and its supporting pages. No framework, no build step — hand-rolled template-string HTML with inline styles over a partial CSS custom-property system.

This audit is evidence-based (grep counts + line references against the actual file), not generic SaaS advice.

## Headline finding

**A real design system already exists in this codebase — it's just not used.** Tokens for typography (`--text-xs/sm/md/lg`), spacing (`--space-1` through `--space-10`), and radius (`--radius-sm/md/lg`) are defined once near the top of the file (`index.html:28-90`), along with `.btn-*`, `.card`, and `.modal-overlay`/`.modal` classes. But adoption across the rest of the file is low:

| System | Token defined | Adoption rate |
|---|---|---|
| Typography | `--text-xs/sm/md/lg` | ~29% of `font-size:` declarations |
| Spacing | `--space-1`…`--space-10` | <1% of `padding`/`margin` declarations |
| Radius | `--radius-sm/md/lg` | ~2% of `border-radius:` declarations |
| Buttons | `.btn-primary/secondary/danger/sm/xs/icon` | 57% of `<button>` elements (43% opt out with inline styles) |
| Cards | `.card` | 77 uses, vs. 167 duplicate one-off card classes with slightly different radius/padding, and `.card` itself is redefined 3 times with 3 different values |
| Modals | `.modal-overlay`/`.modal` | Consistent (~284/312 uses) but 4 screens roll a raw custom overlay instead, each with a different opacity/z-index |

**Practical implication**: most of "build a design system" (Section 4-7 of the master prompt) is really "restore discipline to the one that already exists" — lower risk and faster than inventing tokens from scratch, since existing pixel values can be mapped onto existing/extended tokens without changing anything visually.

## Navigation

- Global search exists (Cmd/Ctrl+**Shift**+F, not the conventional Cmd/Ctrl+K) — non-standard binding likely to be missed by users expecting the industry-standard shortcut.
- Cmd/Ctrl+K is bound to "Ask Gemini" (an AI command bar), not a command palette — no true command palette (jump to settings, create X, invite user) exists yet.
- Owner Console dropdown menus (per-brand "⋯" menu, notification bell, Tools menu) used raw `position:absolute` inside scrollable containers — this silently clipped menu items below the visible area (fixed this session for one instance; likely other instances of the same pattern exist elsewhere in the file and haven't been audited individually).
- No breadcrumb component — `setPage(title, breadcrumb)` sets a title/subtitle pair, not a clickable breadcrumb trail.

## Visual consistency

- **Typography**: 23 distinct raw `font-size` px values in active use (9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 20, 22, 24, 26, 28, 30, 32, 36, 40, 48, 56, 72px) where a 4-step scale is defined. No H1-H4 semantic classes are used consistently — `.page-title`/`.section-header` exist but most headings are one-off inline styles.
- **Spacing**: every integer 1-14px appears as a real padding value (not a 4/8pt scale) — odd numbers (7, 9, 11, 13px) are common, meaning spacing was eyeballed per-component rather than drawn from a scale.
- **Radius**: 17 distinct values in use; 6/8/10/12px are used near-interchangeably as "medium" depending on which screen's author picked it.
- **Cards**: `.card` conflicts with itself across 3 definitions in cascade order (`index.html:161`, `1669`, `4981`); separately, feature areas each invented their own near-identical card class (`.kanban-card`, `.workload-card`, `.analytics-card`, `.pattern-card`, `.health-card`, ...) instead of reusing `.card`.
- **Icons**: no icon system — 95 hand-drawn inline `<svg>` elements vs. 1,100+ emoji/Unicode glyphs used as icons (🟢🟡🔴 for status, ✅⚠️⚡ for actions). Status color is frequently conveyed only by emoji color, which is an accessibility gap (color-blind users, screen readers) as well as a visual-consistency one.

## UX problems found this session (concrete, not hypothetical)

These were real, user-reported or independently discovered bugs fixed during this project — they're representative of the kind of gap a systemic redesign needs to catch:

- **~9 features silently broken** by a `App.call` vs `App.callAsync` typo (Workload Board, Leadership Dashboard, Issue Links, Time Logs, AI Thread Summarize, SLA Forecast widget, AI Triage, password-change modals, duplicate-issue button) — no build step / no type checking meant these shipped and stayed broken with no error surfaced to the user, just an infinite loading state.
- **Ticket Inbox defaulted to sorting by last-activity-adjacent behavior** with no unread/read distinction — a customer reply on an old ticket looked identical to an untouched one. Fixed this session (unread-first + newest sort + a per-agent read-state model that didn't exist before).
- **Sidebar "Upgrade" page was a fully disconnected mock** — fake plan names/prices unrelated to the real Free/Pro/Enterprise tier system, and every CTA just showed a "coming soon" toast. Real self-service upgrade/downgrade now exists (this session), but this is a strong signal that **stale/prototype UI accumulates silently** in this codebase with no automated way to catch it.
- **A dropdown menu (Owner Console brand actions) silently clipped its own last 3 items** off-screen due to `overflow:auto` on an ancestor — a real feature (Bulk Ticket Ops) was completely unreachable and undiscoverable until this was traced and fixed.
- Several "orphaned" report pages (`forecast`, `repeat-offenders`, `first-response`, `root-causes`, `workload-board`, `leadership`, `customer-health`) have real, working backend RPCs and full render functions, but **no nav link anywhere** points to them — they were built and then never wired up, so nobody can find them.

## Responsive / mobile

- 22 `@media` blocks, 8 different breakpoint widths (480/600/768/900/1024/1100/1200px, plus a min-width:769px split for the mobile bottom nav) with no consistent rationale for which component uses which cutoff. 768px is the closest thing to a standard (used in 8 of 22 blocks).
- No systemic "mobile-first" or "desktop-first with tested breakpoints" discipline — most `@media` rules are narrow, single-selector patches (`.card { padding: 10px !important; }`) rather than deliberate layout changes.
- A mobile bottom-nav component exists, suggesting mobile was considered as a real surface at some point, but coverage is inconsistent screen-to-screen (verified this session: Ticket Inbox/Detail needed explicit fixes to stack correctly at 375px width; other screens haven't been checked).

## Accessibility

- 16 `aria-label` occurrences across ~30,000 lines. No semantic heading structure verified. Modal/drawer focus-trapping not verified. Keyboard navigation exists for some flows (command bar, some shortcuts) but hasn't been audited screen-by-screen.

## What's NOT broken (don't rebuild this)

- The theme system (6 themes: midnight/arctic/uiux/forest/ocean/slate) is a real, working, intentional light+dark(+more) system built on shared token names — this is genuinely good architecture and should be preserved/extended, not replaced.
- The modal/toast/skeleton/empty-state patterns are real and mostly consistent where used (`App._skeleton()`, `App._emptyState()`, the undo-toast pattern) — extend these, don't reinvent them.
- Backend RPC/API surface is stable and this project's business logic (SLA math, ticket lifecycle, billing, notifications) has been extensively verified this session — redesign work must not touch server.js business logic, only how the frontend calls and displays it.

## Recommended phased plan

Given the size of this file and the absence of any test suite, a full simultaneous rewrite is the highest-risk option. Proposed order (detailed in `DESIGN_SYSTEM.md` and executed incrementally, each phase verified in-browser and deployed before the next starts):

1. **Design system consolidation** (this doc's sibling) — extend the existing token scale to cover the real range in use, collapse the 3 `.card` definitions into 1, standardize the 4 rogue modal overlays onto the shared class, standardize breakpoints to 2 (tablet/mobile).
2. **Mechanical token adoption pass** — value-preserving find/replace of literal px values that exactly match a token, in font-size/padding/margin/border-radius. Zero visual change, pure consistency win, low risk because output is byte-identical to input.
3. **App shell** — sidebar, topbar, notification/search, dropdown-menu positioning (generalize the portal fix built this session), breadcrumb.
4. **Core screens** — Ticket Inbox, Ticket Detail, Dashboard, Issues, Settings (highest-traffic first).
5. **Secondary screens** — Reports, Owner Console, remaining settings tabs, marketing pages.
6. **Orphaned-feature sweep** — wire up or deliberately remove the report pages with no nav link, resolve the `.card`-variant sprawl into documented variants.

Each phase preserves all backend calls, RPC names, and business logic exactly — only the HTML/CSS/JS presentation layer changes.
