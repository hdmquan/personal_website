# MIDI Knob Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the project selector dial with a two-layer MIDI encoder knob + segmented half-circle SVG arc that opens upward on hover/tap.

**Architecture:** The `.dial-ring` becomes a real knurled outer grip ring; `.dial-knob` is the inner aluminum cap. A `.dial-arc-wrap` containing an inline SVG with 4 `<a>` arc segments replaces the `.dial-fan` nav. JS handles hover→rotate and mobile tap→open. SCSS is compiled via `npm run build:sass`.

**Tech Stack:** HTML, SCSS (compiled → CSS via `sass` CLI), vanilla JS

---

## File Map

| File | Change |
|------|--------|
| `src/index.html` | Replace dial HTML structure + JS interaction script |
| `src/assets/sass/critical.scss` | Replace all `.dial-*` and `.fan-*` rules with new knob + arc styles |
| `src/assets/css/critical.css` | Compiled output — regenerated via `npm run build:sass` |

---

## Task 1: Update HTML Structure

**Files:**
- Modify: `src/index.html` (lines 74–143)

- [ ] **Step 1: Replace the dial HTML block**

Find and replace the entire block from `<div class="dial-wrap"` through the closing `</script>` tag (lines 74–143) with:

```html
<div class="dial-wrap" id="projectDialWrap">
    <div class="dial-ring">
        <button
            class="dial-knob"
            id="projectDial"
            aria-label="Browse personal projects"
            aria-expanded="false"
            aria-controls="dialArc"
        ></button>
        <div class="dial-arc-wrap" id="dialArc" aria-hidden="true">
            <svg class="dial-arc" viewBox="0 0 160 90" xmlns="http://www.w3.org/2000/svg" role="presentation">
                <a href="/project/c-fcn-pytorch/" class="arc-item" data-angle="-69" style="--d:0s">
                    <path class="arc-seg" d="M 10 90 A 70 70 0 0 1 28.0 43.2 L 48.8 61.9 A 42 42 0 0 0 38 90 Z"/>
                    <text class="arc-label" x="27.7" y="72.5" text-anchor="middle">C-FCN</text>
                </a>
                <a href="/project/torch-activation/" class="arc-item" data-angle="-23" style="--d:0.04s">
                    <path class="arc-seg" d="M 31.4 39.6 A 70 70 0 0 1 77.6 20.0 L 78.5 48.0 A 42 42 0 0 0 50.8 59.8 Z"/>
                    <text class="arc-label" x="58.1" y="41.5" text-anchor="middle">TORCH</text>
                </a>
                <a href="/cbd/" class="arc-item" data-angle="23" style="--d:0.08s">
                    <path class="arc-seg" d="M 82.4 20.0 A 70 70 0 0 1 128.6 39.6 L 109.2 59.8 A 42 42 0 0 0 81.5 48.0 Z"/>
                    <text class="arc-label" x="101.9" y="41.5" text-anchor="middle">CBD</text>
                </a>
                <a href="/top-9/" class="arc-item" data-angle="69" style="--d:0.12s">
                    <path class="arc-seg" d="M 132.0 43.2 A 70 70 0 0 1 150 90 L 122 90 A 42 42 0 0 0 111.2 61.9 Z"/>
                    <text class="arc-label" x="132.3" y="72.5" text-anchor="middle">TOP 9</text>
                </a>
            </svg>
        </div>
    </div>
    <span class="dial-legend" aria-hidden="true">PROJECTS</span>
</div>
<script>
(function(){
  var wrap = document.getElementById('projectDialWrap');
  var knob = document.getElementById('projectDial');
  var arc  = document.getElementById('dialArc');
  if (!wrap || !knob || !arc) return;

  var isOpen = false;
  var isMobile = false;

  function setAngle(deg) {
    knob.style.transform = deg != null ? 'rotate(' + deg + 'deg)' : '';
  }

  function open() {
    isOpen = true;
    wrap.classList.add('is-open');
    knob.setAttribute('aria-expanded', 'true');
  }

  function close() {
    isOpen = false;
    wrap.classList.remove('is-open');
    knob.setAttribute('aria-expanded', 'false');
    setAngle(null);
  }

  /* Desktop: open on mouseenter wrap, close on mouseleave wrap */
  wrap.addEventListener('mouseenter', function() {
    isMobile = false;
    open();
  });
  wrap.addEventListener('mouseleave', function() {
    if (!isMobile) close();
  });

  /* Segment hover → rotate knob */
  arc.querySelectorAll('.arc-item').forEach(function(item) {
    item.addEventListener('mouseenter', function() {
      setAngle(parseFloat(item.dataset.angle));
    });
    item.addEventListener('mouseleave', function() {
      setAngle(null);
    });
  });

  /* Mobile: knob tap toggles arc */
  knob.addEventListener('click', function(e) {
    isMobile = true;
    e.stopPropagation();
    isOpen ? close() : open();
  });

  /* Mobile: tap outside closes */
  document.addEventListener('click', function(e) {
    if (isMobile && !wrap.contains(e.target)) close();
  });
})();
</script>
```

- [ ] **Step 2: Verify HTML is valid** — open `src/index.html` and confirm there are no leftover `.dial-fan`, `.fan-item`, or `.fan-pip` elements.

---

## Task 2: Replace SCSS Styles

**Files:**
- Modify: `src/assets/sass/critical.scss` (lines 140–328)

- [ ] **Step 1: Delete old dial rules**

Remove everything from line 140 (`/* ── Project Dial ──`) through line 328 (`.dial-fan.is-open .fan-item { ... }`) inclusive.

- [ ] **Step 2: Insert new dial rules in the same place**

```scss
/* ── Project Dial ─────────────────────────────────── */
.social-section .dial-wrap {
  margin-left: 0.75rem;
}

.dial-wrap {
  position: relative;
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 0.3rem;
}

/* Outer knurled grip ring */
.dial-ring {
  position: relative;
  width: 4.8rem;
  height: 4.8rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;

  background:
    /* Bevel: bright top edge, dark bottom edge */
    radial-gradient(ellipse 100% 50% at 50% 0%, rgba(255,255,255,0.10) 0%, transparent 100%),
    radial-gradient(ellipse 100% 50% at 50% 100%, rgba(0,0,0,0.25) 0%, transparent 100%),
    /* Knurled ridges */
    repeating-conic-gradient(
      hsl(140 5% 16%) 0deg 3deg,
      hsl(140 7% 26%) 3deg 6deg
    );

  border: 1px solid rgba(0,0,0,0.5);
  box-shadow:
    0 1px 0 rgba(255,255,255,0.07) inset,
    0 -1px 0 rgba(0,0,0,0.4) inset,
    0 6px 14px rgba(0,0,0,0.6),
    0 2px 4px rgba(0,0,0,0.4);
}

/* Inner aluminum cap */
.dial-knob {
  width: 3.2rem;
  height: 3.2rem;
  border-radius: 50%;
  cursor: pointer;
  position: relative;
  flex: none;
  transition: transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);

  background:
    radial-gradient(ellipse 55% 30% at 38% 22%, rgba(255,255,255,0.22) 0%, transparent 100%),
    radial-gradient(ellipse 100% 55% at 50% 0%, rgba(255,255,255,0.10) 0%, transparent 100%),
    linear-gradient(175deg,
      hsl(140 8% 38%) 0%,
      hsl(140 6% 24%) 40%,
      hsl(140 5% 14%) 100%
    );

  border: 1px solid rgba(0,0,0,0.55);
  outline: 1px solid rgba(255,255,255,0.08);
  outline-offset: -2px;

  box-shadow:
    0 1px 0 rgba(255,255,255,0.18) inset,
    0 -2px 1px rgba(0,0,0,0.55) inset,
    1px 0 2px rgba(0,0,0,0.25) inset,
    -1px 0 2px rgba(0,0,0,0.25) inset,
    0 4px 10px rgba(0,0,0,0.55),
    0 1px 2px rgba(0,0,0,0.4);

  /* Indicator: bright dot near top rim */
  &::before {
    content: '';
    position: absolute;
    width: 0.22rem;
    height: 0.22rem;
    top: 0.2rem;
    left: 50%;
    transform: translateX(-50%);
    border-radius: 50%;
    background: var(--accent-hi);
    box-shadow:
      0 0 4px 1px color-mix(in srgb, var(--accent) 60%, transparent),
      0 0 8px 2px color-mix(in srgb, var(--accent) 25%, transparent);
  }

  &:focus-visible { outline: 2px solid var(--accent); outline-offset: 6px; }

  &:active {
    transform: scale(0.97) !important;
    box-shadow:
      0 -1px 0 rgba(255,255,255,0.1) inset,
      0 1px 1px rgba(0,0,0,0.6) inset,
      0 2px 4px rgba(0,0,0,0.4);
  }

  &[aria-expanded="true"] {
    box-shadow:
      0 1px 0 rgba(255,255,255,0.18) inset,
      0 -2px 1px rgba(0,0,0,0.55) inset,
      1px 0 2px rgba(0,0,0,0.25) inset,
      -1px 0 2px rgba(0,0,0,0.25) inset,
      0 4px 10px rgba(0,0,0,0.55),
      0 1px 2px rgba(0,0,0,0.4),
      0 0 0 2px color-mix(in srgb, var(--accent) 40%, transparent),
      0 0 12px 2px color-mix(in srgb, var(--accent) 18%, transparent);
  }
}

.dial-legend {
  font-family: 'DM Mono', monospace;
  font-size: 0.48rem;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--text-3);
  pointer-events: none;
}

/* Arc container — positioned so SVG cy=90 aligns with dial-ring center */
.dial-arc-wrap {
  position: absolute;
  width: 10rem;
  height: 5.625rem;  /* 10rem × 90/160 */
  left: 50%;
  bottom: 50%;
  transform: translateX(-50%);
  pointer-events: none;
  z-index: 100;
}

.dial-arc {
  width: 100%;
  height: 100%;
  overflow: visible;
}

/* Each arc segment + label group */
.arc-item {
  --d: 0s;
  text-decoration: none;

  .arc-seg {
    fill: var(--panel-raised);
    stroke: var(--rule);
    stroke-width: 1;
    transform-origin: 80px 90px;  /* SVG knob center */
    transform: scale(0);
    opacity: 0;
    transition:
      transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) var(--d),
      opacity 0.2s var(--d),
      fill 0.15s,
      stroke 0.15s;
  }

  .arc-label {
    font-family: 'DM Mono', monospace;
    font-size: 7px;  /* ~0.48rem at SVG scale */
    letter-spacing: 0.12em;
    text-transform: uppercase;
    fill: var(--text-3);
    opacity: 0;
    transition: opacity 0.15s var(--d), fill 0.15s;
    pointer-events: none;
  }

  &:hover, &:focus-visible {
    .arc-seg {
      fill: var(--panel-inset);
      stroke: var(--accent);
    }
    .arc-label { fill: var(--accent); }
  }
}

/* Open state: arc visible, segments scale in */
.dial-wrap.is-open .dial-arc-wrap {
  pointer-events: auto;
}

.dial-wrap.is-open .arc-item {
  .arc-seg {
    transform: scale(1);
    opacity: 1;
  }
  .arc-label { opacity: 1; }
}
```

- [ ] **Step 3: Confirm no remaining `.fan-item`, `.fan-pip`, `.fan-label`, `.dial-fan` rules exist in the file**

Run: `grep -n "fan-item\|fan-pip\|fan-label\|dial-fan" src/assets/sass/critical.scss`
Expected: no output

---

## Task 3: Compile CSS and Verify

- [ ] **Step 1: Compile SCSS**

Run: `npm run build:sass`
Expected: exits 0, `src/assets/css/critical.css` updated, no errors

- [ ] **Step 2: Check compiled CSS for arc rules**

Run: `grep -c "arc-seg\|dial-ring\|dial-arc" src/assets/css/critical.css`
Expected: number > 0

- [ ] **Step 3: Start dev server and verify visually on localhost:8080**

Run: `npx cross-env ELEVENTY_ENV=DEV eleventy --serve` (or `npm start` if already running)

Check:
1. Knob ring is visible — knurled texture, larger than before
2. Inner cap centered inside ring with bright dot indicator at top
3. Hovering the knob assembly opens the half-circle arc above it
4. Hovering each segment highlights it (green stroke) and rotates the indicator dot
5. Leaving the knob area closes the arc and snaps the knob back to 12 o'clock
6. On mobile viewport (devtools 375px): tapping knob opens arc, tapping segment navigates, tapping outside closes

- [ ] **Step 4: Commit**

```bash
git add src/index.html src/assets/sass/critical.scss src/assets/css/critical.css src/assets/css/critical.css.map
git commit -m "feat: redesign project dial as MIDI knob with segmented half-circle arc"
```

---

## Notes

- SVG coordinates assume `viewBox="0 0 160 90"`, center at `(80, 90)`, outer arc radius 70, inner 42, 4 segments of 42° with 4° gaps
- Knob rotation targets per segment: −69°, −23°, +23°, +69° (matching `data-angle` attributes)
- `arc-label` uses `font-size: 7px` in SVG units which scales proportionally with the `10rem` SVG element — visually equivalent to `0.48rem`
- `repeating-conic-gradient` requires Chrome 69+, Firefox 83+, Safari 12.1+ — acceptable for a personal portfolio
