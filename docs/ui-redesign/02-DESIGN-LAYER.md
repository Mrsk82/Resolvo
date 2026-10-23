# Phase 2: design layer (done 2026-10-23)

## What was added
| File | Purpose |
|---|---|
| `public/css/rv-tokens.css` | One source for colour, type scale, spacing (4px base), radius, elevation, layering, motion, layout sizes. Colours read the active theme's variables and fall back to Resolvo Light, so components follow any theme. Documents the five breakpoints (640, 768, 1024, 1280, 1536). |
| `public/css/rv-components.css` | 30+ components with new `rv-` class names (no collisions with legacy CSS, no `!important`): buttons, icon buttons, inputs, selects, textarea, search, switch, cards, KPI stat, page header, tabs (underline + pills), range selector, badges, status, priority, count, avatar, table + wrapper, pagination, menu, tooltip, modal, drawer, toast, alert, empty state, skeleton, progress, layout helpers. One shared focus ring. Reduced-motion supported. |
| `public/js/rv-ui.js` | `RV.*` builders that return HTML for those components and escape all data in one place (`RV.esc`), plus behaviours: menus (click-outside and Escape), tab arrow keys, modal (focus in, focus returned, Escape), drawer, toast. |
| `public/styleguide.html` | Living style guide at `/styleguide.html` (noindex): every component, with a Light/Dark switch. |

## Wired into the app
- `index.html` loads the three files after the existing theme CSS (cache-busted `?v=`).
- The dashboard (`renderDashboardV3`) was rebuilt on the components. Its inline styles are gone; every figure is still real data.

## Verification
- Style guide: no console errors; menu, modal, Escape, tab arrow keys and toast all work; no horizontal overflow at 1440 or 390.
- Dashboard: cards stay inside the screen at 1440, 1280, 1024, 768 and 390.
- Full baseline re-run (30 routes x 5 widths): no console errors, no overflow. One transient "empty" reading for Integrations at 390 was a test timing issue; re-tested three times, the screen loads fully (2,602 characters) every time.
- Control inventory diff against the pre-redesign baseline: **28 of 29 screens identical**; the only difference is the dashboard (rebuilt on purpose). Sidebar (27 items) and topbar (16 controls) unchanged.

## How to use the components in a screen
```js
area.innerHTML = '<div class="rv">' +
  RV.pageHead({ title: 'Customers', actions: RV.btn({ label: 'New customer', kind: 'primary', icon: 'plus', onclick: 'App._custNew()' }) }) +
  RV.card({ title: 'All customers', flush: true, body: RV.table({ columns: [...], rows: rows, rowClick: 'App._open' }) }) +
'</div>';
```
Rules: text from data always goes through `RV.esc` (the builders do it for you); `onclick` options are developer-written strings, never user data.

## Not yet done (later phases)
- The old CSS (11 themes, 534 `!important`) is still in place underneath. It is removed screen by screen as each module moves onto `rv-*`, and only after the screen is verified.
- Customers, inbox, ticket page and the other modules still use their earlier markup (Phases 3 to 5).
- The nine older themes: decision pending with the owner.
