# MIDI Knob Redesign — Spec

**Date:** 2026-03-30
**Scope:** Redesign the project selector dial on the landing hero into a MIDI-controller-style rotary knob with a segmented half-circle arc selector.

---

## Overview

Replace the current single-circle knob + radial fan with a two-layer MIDI encoder assembly paired with a half-circle SVG arc that segments into one clickable zone per project. The arc opens upward on hover (desktop) or tap (mobile), disappears on blur, and the knob rotates its indicator to point at the hovered segment.

The design follows the existing site palette (warm greige panels, forest green accent, DM Mono labels) and skeuomorphic token language used in buttons and cards throughout the site.

---

## Components

### 1. Knob Assembly

**`.dial-ring`** — outer grip ring
- Size: `4.8rem` circle
- Texture: `repeating-conic-gradient` alternating dark/light slivers (~40 ridges) to suggest knurling
- Raised bevel via `box-shadow` inset highlights
- Uses `--panel-raised` base, `--rule` border, same shadow tokens as buttons

**`.dial-knob`** — inner aluminum cap
- Size: `3.2rem`, centered inside `.dial-ring`
- Retain existing anodized aluminum gradients (forest green tint, top-left specular glint)
- Indicator moves to outer edge of cap (not center) — a bright dot near the rim
- Entire assembly (ring + cap together) rotates on interaction

**Rotation:**
- Transition: `transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)` (weighted spring, slight overshoot = physical feel)
- Rotates to the center angle of the hovered segment, sweeping through the delta from current position (no reset to 0 between segments)
- Returns to 12 o'clock (0°) when arc closes, using same easing

### 2. Segmented Half-Circle Arc

**Structure:** Inline SVG, ~`10rem` wide, absolutely positioned centered above the knob center.

**Geometry:**
- 180° arc (−90° to +90° from vertical, opening upward)
- 4 equal segments of 45° each
- 3–4° gap between segments (visual separation, no interaction dead zone)
- Segment angles (center of each): −67.5°, −22.5°, +22.5°, +67.5° from 12 o'clock
- Corresponding knob rotation targets: −67.5°, −22.5°, +22.5°, +67.5°

**Segment appearance (rest):**
- Fill: `var(--panel-raised)`
- Stroke: `var(--rule)`, `1px`
- No label visible

**Segment appearance (hovered):**
- Fill: `var(--panel-inset)` (press-in feel)
- Stroke: `var(--accent)`
- Label appears at outer arc edge: `DM Mono`, `0.48rem`, uppercase, `letter-spacing: 0.15em`, color `var(--text-2)`

**Show/hide:**
- Hidden at rest (`opacity: 0`, `pointer-events: none`, segments scaled to 0 from knob center)
- Revealed on `.dial-wrap:hover` (desktop) or `.dial-wrap.is-open` (mobile tap)
- Entry animation: segments scale in from `transform-origin` at knob center, staggered 40ms per segment, same spring easing
- Exit: fade + scale out, 200ms

**Interaction — desktop:**
- Arc opens on `mouseenter` on `.dial-wrap`
- Hovering a segment highlights it + rotates knob
- Clicking a segment navigates to project page
- Arc closes on `mouseleave` from `.dial-wrap`

**Interaction — mobile:**
- First tap on knob toggles arc open (`.is-open`)
- Tapping a segment navigates
- Tapping outside closes arc

### 3. Label

**`.dial-legend`** — unchanged: `"PROJECTS"`, `DM Mono`, `0.48rem`, uppercase, `var(--text-3)`. Sits below the knob.

---

## Files Changed

| File | Change |
|------|--------|
| `src/index.html` | Replace `.dial-ring` / `.dial-knob` structure; replace `<nav class="dial-fan">` with inline SVG arc; update JS interaction logic |
| `src/assets/sass/critical.scss` | Replace `.dial-ring`, `.dial-knob`, `.dial-fan`, `.fan-item`, `.fan-pip`, `.fan-label` styles with new knob + arc styles |

---

## Animation Detail

The knob rotation is the primary tactile feedback of this component. Rules:

1. **Always animate through the delta** — if knob is at −67.5° and user moves to +22.5°, it sweeps +90° continuously, not back to 0 then forward.
2. **Spring easing on every rotation** — `cubic-bezier(0.34, 1.56, 0.64, 1)` with 0.35s duration.
3. **Return to 0° on close** — same spring, so it "bounces" back to resting position like releasing a weighted encoder.
4. **Segment entry stagger** — left-to-right, 40ms offset, so the arc fans open from the knob outward.

---

## Out of Scope

- Project preview on hover (deferred)
- More than 4 projects (arc geometry will need recalculation if projects are added)
