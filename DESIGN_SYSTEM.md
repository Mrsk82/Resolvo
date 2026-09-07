# Resolvo Design System

This documents the **actual, currently-rendered** design system in `public/index.html`, not an aspirational one. Where the file previously had conflicting/duplicate definitions (later ones winning via CSS cascade), this doc records the winning value as canonical and the file has been cleaned up to match — see "Cleanup log" at the bottom.

Everything here already exists as CSS custom properties at `index.html:28-99`. The work going forward is **adoption**, not invention: use these tokens instead of literal px values in every new/edited screen.

## Color tokens

```css
--bg-base: #0B0F19;        /* page background */
--bg-surface: #0f1520;     /* sidebar/topbar */
--bg-card: #141c2e;        /* cards, panels */
--bg-elevated: #1a2438;    /* raised elements, secondary buttons */
--bg-hover: #1f2d45;       /* hover state */

--accent: #10B981;         /* brand green — primary actions, links */
--accent-dim: rgba(16,185,129,0.12);
--accent-glow: rgba(16,185,129,0.3);

--critical: #ff4757;  --critical-dim: rgba(255,71,87,0.12);
--high:     #fb923c;  --high-dim: rgba(251,146,60,0.12);
--medium:   #f59e0b;  --medium-dim: rgba(245,158,11,0.12);
--low:      #10B981;  --low-dim: rgba(16,185,129,0.12);

--text-primary: #f1f5f9;
--text-secondary: #94a3b8;
--text-muted: #64748b;
--text-dim: #334155;

--border: rgba(255,255,255,0.07);
--border-accent: rgba(16,185,129,0.3);
```

These are the **midnight** (dark) theme values. Five more full themes exist (arctic/uiux/forest/ocean/slate) redefining the same token names — always reference the token, never hardcode a hex value, or your component will look wrong in 5 of the 6 themes.

**Rule**: no new hardcoded hex colors. If a needed shade doesn't exist as a token, add it to `:root` (and to each theme block) rather than inlining it once.

## Typography scale

```css
--text-xs:   11px;  /* micro labels, badges */
--text-sm:   12px;  /* secondary text, meta */
--text-base: 13px;  /* default body/button text */
--text-md:   15px;  /* emphasized body, card titles */
--text-lg:   18px;  /* section headers */
--text-xl:   24px;  /* page titles */
--text-2xl:  32px;  /* rare — hero numbers, empty-state icons */
```

The audit found 23 raw px values in active use where this 7-step scale should cover it. **Every new font-size must map to one of these 7** — if a design genuinely needs a size outside this range, that's a signal to add an explicit 8th token (documented here), not to drop in another one-off literal.

Utility classes already exist: `.text-xs` / `.text-sm` / `.text-base` / `.text-md` / `.text-lg` / `.text-xl` / `.text-2xl` — prefer the class over `style="font-size:var(--text-sm)"` inline when the element has no other custom styling.

Semantic classes: `.page-title` (18px/700), `.page-subtitle` (12px/muted), `.section-header` (15px/700), `.section-label` (11px/700/uppercase).

## Spacing scale

```css
--space-1: 4px;   --space-2: 8px;   --space-3: 12px;
--space-4: 16px;  --space-5: 20px;  --space-6: 24px;
--space-8: 32px;  --space-10: 40px;
```

The audit found every integer 1-14px in active use as padding — this must stop. **Every padding/margin/gap value must be one of these 8 tokens.** If you're about to write `padding: 9px 14px`, the intent was almost certainly `padding: var(--space-2) var(--space-4)` (8px 16px) or `var(--space-3) var(--space-4)` (12px 16px) — pick the closer one, don't invent a 9th value.

## Radius scale

```css
--radius-sm: 5px;   /* badges, small chips */
--radius:    8px;   /* buttons, inputs */
--radius-md: 10px;  /* small cards, dropdowns */
--radius-lg: 14px;  /* cards (canonical — see cleanup log) */
--radius-xl: 18px;  /* large panels, modals */
```

## Shadows & z-index

```css
--shadow-sm: 0 1px 4px rgba(0,0,0,0.2);
--shadow:    0 4px 16px rgba(0,0,0,0.3);
--shadow-lg: 0 8px 32px rgba(0,0,0,0.45);
--shadow-accent: 0 4px 24px rgba(16,185,129,0.15);

--z-base: 1;  --z-sticky: 50;  --z-sidebar: 100;  --z-topbar: 110;
--z-dropdown: 200;  --z-modal: 500;  --z-toast: 600;  --z-loading: 900;
```

Any new floating/overlay element (dropdown menu, popover, tooltip) must pick from this z-scale — do not hardcode a new z-index value, and never use `9998`/`9999` as a "just make it on top" escape hatch (found 2 instances of exactly this in the audit).

## Components

### Buttons
`.btn-primary` / `.btn-secondary` / `.btn-danger`, sized with `.btn-sm` / `.btn-xs`. Canonical values (post-cleanup):
- Primary: `padding: 9px 18px; border-radius: var(--radius); background: var(--accent); color: #0d0e14;`
- Secondary: `padding: 8px 16px; border-radius: var(--radius); background: var(--bg-elevated); border: 1px solid var(--border);`
- Danger: `padding: 8px 16px; border-radius: var(--radius); background: var(--critical-dim); color: var(--critical);`

43% of buttons in the file bypass these classes with inline styles — new/edited buttons must use the classes.

### Cards
`.card` — canonical: `background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 20px 24px;`

Feature-specific card classes (`.kanban-card`, `.workload-card`, `.analytics-card`, etc.) should extend `.card` rather than redefine the same three properties with a slightly different number. When touching a screen with its own one-off card class, fold it into `.card` (+ a modifier class for anything genuinely different, like a colored left border) rather than leaving it standalone.

### Modals
`.modal-overlay` + `.modal` — the canonical pattern (284/312 uses). Fixed backdrop `rgba(0,0,0,0.8)` + `backdrop-filter: blur(5px)`, `z-index: var(--z-modal)`. **Never build a raw `position:fixed;inset:0;background:rgba(...)` overlay from scratch** — 4 screens currently do this with 4 different opacities/z-indexes; fold each into the shared classes as it's touched.

### Dropdown menus (portal pattern)
As of this session, the Owner Console's "⋯" row menu, notification bell, and Tools menu render into a single shared `#ownerDropdownPortal` body-level element (`App._toggleOwnerMenu`, `index.html` ~10035) positioned via `getBoundingClientRect()` from the trigger button, flipping upward if it would overflow the viewport. This is the pattern to copy for any other dropdown discovered to have the same `overflow:auto`-ancestor clipping bug — don't reintroduce `position:absolute` inside a scrollable container.

### Icons
No formal icon system exists (95 inline SVGs vs. 1,100+ emoji used as icons). Going forward:
- **Status indicators** (priority, health, sentiment) may keep using colored-circle emoji (🟢🟡🔴) for now — replacing 1,100+ instances is out of scope for this pass — but pair color with a text label wherever it's the *only* signal (accessibility).
- **New interactive icons** (buttons, nav items) should prefer the existing inline-SVG pattern already used in the sidebar nav (`stroke="currentColor"`, 18-20px, matches `--text-primary`/`--text-muted`) over adding new emoji, so hover/active/theme color states work correctly (emoji can't be recolored by CSS).

## Breakpoints

Two, going forward — consolidating the 8 ad-hoc widths found in the audit:
```css
@media (max-width: 1024px) { /* tablet: condense nav, adapt grids */ }
@media (max-width: 768px)  { /* mobile: stack panels, bottom nav, single column */ }
```
768px was already the dominant breakpoint (8 of 22 existing `@media` blocks) — new responsive work should target these two only, migrating away from 480/600/900/1100/1200px as those screens are touched.

## Cleanup log

Changes made when this doc was written (all value-preserving or resolving an existing internal conflict — no visual change to already-consistent screens):

- `.card` was defined 3 times (`index.html:161`, `1669`, `4981`) with 3 different radius/padding combinations; the cascade-winning one (`4981`, radius `var(--radius-lg)`/14px, padding `20px 24px`) is now the single canonical definition — the other two were deleted.
- `.btn-primary` was defined twice, once inside the "DESIGN SYSTEM PATCH" block (`~line 146`, correct green `--accent-glow` shadow) and once later (`~line 1611`, a leftover from the pre-rebrand orange palette — hardcoded `rgba(245,166,35,...)` shadow color, a radius literal instead of `var(--radius)`). The later, stale orange-era definition was removed; the token-based one is canonical.
