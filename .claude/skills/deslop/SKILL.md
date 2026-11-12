---
name: deslop
description: Strip the tells of generated work from UI, copy and code before calling it done. Use after building or changing any user-facing page (especially src/dashboard/index.html), any message Rook sends, or any sizeable code change, and whenever Eddie says something looks sloppy, generic, templated or "AI".
---

# Deslop

Slop is anything that's there because it's the default, not because this product needs it. Eddie reads this dashboard on his phone every day; every element should earn its place. Run this as a review pass over the finished work, fix what you find, and look at the result again (screenshot at phone and desktop width) before saying you're done.

Work through the three passes in order. For each finding, either fix it or keep it on purpose and be able to say why in one line.

## 1. UI pass

**Structure**
- No wall of equal-weight cards. Decide what the one or two most important things on the screen are and make them visibly primary; demote the rest (smaller, quieter, collapsed, or gone).
- Not everything needs a card. Group with spacing and alignment first; borders and boxes only where they separate genuinely different things.
- One radius scale with meaning (e.g. small for controls, larger for containers), not the same radius on everything.
- Shadows only where something actually floats (popovers, sheets, the composer). Flat surfaces don't need a drop shadow.
- No decorative gradients, glows or blobs unless they carry meaning (the Brain graph's glow is the one place motion and light are the point).
- Labels: delete any label the content already makes obvious. No ALL-CAPS tracked eyebrow above every heading. Sentence case.
- No `A · B · C` metadata chains when a layout (columns, alignment, a second line) would read better; keep at most one short separator line where it truly helps.
- Monospace only for things that are literally code, paths, cron expressions or IDs, not for small numbers or labels.
- Numbered markers (01/02/03) only for real sequences.
- Icons only where they speed recognition; never an icon next to every label.

**Type and colour**
- A real type scale (few sizes, clear steps) and consistent weights. Body text never below 14px on phones; meta text not below 12px.
- Line length under ~75 characters for reading views.
- One accent colour, used for the primary action and the current selection, not sprinkled. Status colours (good / warning / critical) only for status.
- Check both themes. Dark is not "light with inverted greys": tune surfaces, borders and text contrast separately. Contrast AA at minimum.

**Motion**
- One orchestrated moment beats scattered effects. Don't fade-and-slide every section on every tab switch, don't count up every number, don't add hover lift to every card.
- Motion that answers an action (opening, expanding, confirming, a job starting) is good when it shows what changed.
- Everything respects `prefers-reduced-motion`.

**Phone**
- 375px wide, no horizontal scroll, thumb-reachable primary actions, tap targets ≥ 40px, nothing important hidden behind hover.
- Check safe areas (notch, home indicator) and the bottom tab bar never covering content.

## 2. Copy pass

- Every string does one job. Cut filler ("Here's an overview of…", "Easily manage…", "Powerful insights").
- Name things the way Eddie thinks about them, not how the system is built: "Conversations", not "session archive"; "Runs today", not "usage entries".
- Buttons say what happens ("Run now", "Delete"), and the result uses the same verb ("Deleted morning-brief").
- Empty states say what to do next. Errors say what happened and how to fix it; they don't apologise and are never vague.
- No emoji decoration in UI text unless it carries meaning (status). No exclamation marks.
- Numbers: humane formatting (1.8M tokens, 3h 20m, "in 6h"), consistent everywhere.

## 3. Code pass

- Delete dead code, unused CSS, commented-out blocks, and leftover debug logging.
- Comments explain why (a constraint, a trade-off, a non-obvious bug avoided), never what the next line obviously does. Remove narration comments.
- No defensive noise: don't null-check things that can't be null, don't wrap everything in try/catch, don't add options nobody asked for.
- No duplicate helpers: search for an existing one before adding another (there is already `esc`, `api`, `toast`, `relEl`, `fmtDur` and friends in the dashboard).
- CSS: no rules that cancel each other out; prefer tokens on `:root` over literal colours; keep specificity flat.
- Match the surrounding style and naming. A reviewer should not be able to tell which lines were generated.

## Done means

- Screenshots at ~390px and desktop width, dark and light, look intentional: you could explain why each element is where it is.
- `npm run typecheck` passes if any TypeScript changed.
- You removed at least one thing. If the pass found nothing to cut, look again.
