# Status Variants Design Specification
> Control-room dashboard status styling. Theme: dark-themed control-room dashboard, subtle signal, "shine not movement".

This document serves as the implementation handoff for Task 5. All properties are CSS-ready, introducing NO layout-shifting or size-changing animations.

---

## 1. Status: `question`

**Pane 1 (Current)**
- **Base Color:** `#d946ef` (`var(--status-question)`)
- **Dot Style:** Solid magenta with literal "?" via `::after`. Solid border `rgba(217, 70, 239, 0.7)`.
- **Shadow:** `inset 0 1px 2px rgba(255, 255, 255, 0.4), inset 0 -1px 2px rgba(0, 0, 0, 0.2), 0 0 12px 2px var(--status-question-border)`
- **Strip Glow:** Gradient border using `question-border-radiation`, opacity drift via `question-shadow-drift`.

**Pane 2 (Close color variant)**
- **Base Color:** `#b829ea` (Neon Purple)
- **Modifications:** Shift base hex, adjust glow to `rgba(184, 41, 234, 0.6)`. Keep "?" literal.

**Pane 3 (New effect/feel - Scanline)**
- **Dot Background:** `linear-gradient(to bottom, transparent 50%, rgba(217, 70, 239, 0.4) 51%), #d946ef`
- **Background Size:** `100% 4px`
- **Animation:** `@keyframes question-scan { to { background-position: 0 4px; } }` `2s linear infinite`. 
- **Strip:** Drop radiation, replace with a slow horizontal scanline on `::before` using linear gradient and `background-position-x`.

**Pane 4 (Close color variant)**
- **Base Color:** `#8a2be2` (Deep Violet)
- **Modifications:** Darker magenta/purple. Shadow: `0 0 8px 1px rgba(138, 43, 226, 0.7)`.

**Pane 5 (New effect/feel - Faulty Neon Strobe)**
- **Dot Style:** Solid magenta, no literal "?".
- **Animation:** `@keyframes faulty-strobe { 0%, 2%, 4%, 100% { opacity: 1; box-shadow: 0 0 12px 2px rgba(217, 70, 239, 0.7); } 1%, 3% { opacity: 0.6; box-shadow: 0 0 2px 0px rgba(217, 70, 239, 0.2); } }` `4s infinite`.
- **Strip Glow:** Opacity tied to the same strobe timing.

**Pane 6 (Maybe-close color variant)**
- **Base Color:** `#ec4899` (Hot Pink)
- **Modifications:** Moves toward red/pink spectrum.

**Pane 7 (Modified existing effect)**
- **Dot Style:** Remove the "?" overlay. Increase shadow blur for a diffuse, ethereal look: `box-shadow: 0 0 20px 4px rgba(217, 70, 239, 0.3)`.
- **Strip Glow:** Slow down `question-border-radiation` from `5s` to `12s`.

**Pane 8 (Not-close contrasting alternative)**
- **Base Color:** `#eab308` (Warning Yellow)
- **Dot Style:** Caution tape hatch. `background: repeating-linear-gradient(45deg, #eab308, #eab308 2px, #ca8a04 2px, #ca8a04 4px);`
- **Strip Glow:** Static solid gold border `rgba(234, 179, 8, 0.4)`, no animation.

---

## 2. Status: `busy`

**Pane 1 (Current)**
- **Base Color:** `#06b6d4` (`var(--status-busy-new)`)
- **Dot Style:** Solid cyan.
- **Shadow:** `inset 0 2px 4px rgba(0, 0, 0, 0.4), 0 0 6px 1px rgba(6, 182, 212, 0.3)`
- **Strip Glow:** Strip has a gradient border `::before` at full opacity. `::after` produces `strip-sheen` scan across the strip.

**Pane 2 (Close color variant)**
- **Base Color:** `#00e5ff` (Electric Teal)
- **Modifications:** Brighter variant, higher contrast.

**Pane 3 (New effect/feel - Optical Fiber)**
- **Dot Style:** Super intense center, dark edges. `background: radial-gradient(circle at center, #ffffff 0%, #06b6d4 40%, #0891b2 100%);`
- **Shadow:** `0 0 10px 2px rgba(6, 182, 212, 0.5)`
- **Strip Glow:** Only the top and bottom edges of the strip glow, fading at the sides via `linear-gradient(to right, transparent, rgba(6,182,212,0.4), transparent)`.

**Pane 4 (Close color variant)**
- **Base Color:** `#0284c7` (Ocean Blue)
- **Modifications:** Deeper, more submerged blue feeling.

**Pane 5 (New effect/feel - Data Stream)**
- **Strip Glow:** Replace `strip-sheen` with a data-stream effect. `background: repeating-linear-gradient(90deg, transparent, transparent 10px, rgba(6, 182, 212, 0.1) 10px, rgba(6, 182, 212, 0.1) 12px);`
- **Animation:** `@keyframes data-stream { from { background-position-x: 0; } to { background-position-x: 22px; } }` `1s linear infinite`.

**Pane 6 (Maybe-close color variant)**
- **Base Color:** `#2dd4bf` (Teal/Mint)

**Pane 7 (Modified existing effect)**
- **Strip Glow:** Double the sheen. Create a secondary `::before` sheen moving in the opposite direction or slightly delayed, yielding an overlapping moiré interference of light.

**Pane 8 (Not-close contrasting alternative)**
- **Base Color:** `#8b5cf6` (Electric Purple)
- **Dot Style:** Purple core with cyan border. `border: 1px solid #06b6d4; background: #8b5cf6;` 
- **Shadow:** `0 0 8px #8b5cf6`

---

## 3. Status: `tool` (Maps to `running_tool`)

**Pane 1 (Current)**
- **Base Color:** Shares `busy` styling. `#06b6d4`.
- **Dot/Strip Style:** Identical to `busy` (cyan dot, inset shadow, `strip-sheen`).

**Pane 2 (Close color variant)**
- **Base Color:** `#0ea5e9` (Light Sky Blue)
- **Modifications:** Differentiates `tool` from `busy` via hue shift towards true blue.

**Pane 3 (New effect/feel - Radar Sweep)**
- **Dot Style:** Conic gradient representing a radar. `background: conic-gradient(from 0deg, transparent 0%, rgba(6,182,212,0.2) 80%, #06b6d4 100%);`
- **Animation:** `@keyframes radar-spin { 100% { transform: rotate(360deg); } }` `2s linear infinite`. (Note: rotating the background via transform on a pseudo-element `::before` avoids layout shifts).

**Pane 4 (Close color variant)**
- **Base Color:** `#3b82f6` (Blue)

**Pane 5 (New effect/feel - Machining / Gear)**
- **Dot Style:** Dashed border simulating a gear. `background: transparent; border: 2px dashed #06b6d4; box-sizing: border-box;`
- **Animation:** Rotate the dot `4s linear infinite`.

**Pane 6 (Maybe-close color variant)**
- **Base Color:** `#10b981` (Emerald Green)
- **Modifications:** Shifts to green to signify a "working/active" sub-process.

**Pane 7 (Modified existing effect)**
- **Strip Glow:** Pinpoint laser sheen. Change the `strip-sheen` `::after` gradient to be incredibly sharp: `linear-gradient(90deg, transparent 0%, transparent 48%, rgba(255,255,255,0.8) 50%, transparent 52%, transparent 100%)`.

**Pane 8 (Not-close contrasting alternative)**
- **Base Color:** `#f59e0b` (Amber)
- **Dot Style:** Welding spark effect. `background: #f59e0b`.
- **Animation:** `@keyframes weld-spark { 0%, 100% { filter: brightness(1); box-shadow: 0 0 4px #f59e0b; } 10%, 30%, 50% { filter: brightness(1.5); box-shadow: 0 0 12px #fef3c7; } }` `0.8s infinite`.

---

## 4. Status: `thinking`

**Pane 1 (Current)**
- **Base Color:** Uses `busy` styling in `ProjectStrip.css` (`#06b6d4`), though tokens mention `#ffa502`.
- **Dot/Strip Style:** Same cyan sheen and inset shadow as `busy`.

**Pane 2 (Close color variant)**
- **Base Color:** `#f97316` (Orange)
- **Modifications:** Reverts to the intended token color. `box-shadow: inset 0 2px 4px rgba(0,0,0,0.4), 0 0 6px 1px rgba(249, 115, 22, 0.3)`.

**Pane 3 (New effect/feel - Neural Pulse)**
- **Dot Style:** `#ffa502`.
- **Animation:** `@keyframes neural-throb { 0%, 100% { opacity: 0.8; box-shadow: 0 0 4px rgba(255,165,2,0.4); } 50% { opacity: 1; box-shadow: 0 0 12px rgba(255,165,2,0.8), inset 0 0 4px rgba(255,255,255,0.5); } }` `1.5s ease-in-out infinite`.

**Pane 4 (Close color variant)**
- **Base Color:** `#fbbf24` (Gold)

**Pane 5 (New effect/feel - Synapse Shimmer)**
- **Dot Style:** Multi-layered gradients. `background: radial-gradient(circle at 30% 30%, rgba(255,255,255,0.8) 1px, transparent 2px), #ffa502;`
- **Strip Glow:** Slow panning gradient on `::before` combining orange and faint purple: `linear-gradient(90deg, rgba(255,165,2,0.1), rgba(168,85,247,0.1))`.

**Pane 6 (Maybe-close color variant)**
- **Base Color:** `#ea580c` (Burnt Orange)

**Pane 7 (Modified existing effect)**
- **Dot Style:** Keep cyan (`#06b6d4`) but change the sheen animation.
- **Strip Glow:** `strip-sheen` becomes a slow, sine-wave oscillation. Instead of sweeping left-to-right infinitely, it eases back and forth `left: -20%` to `left: 120%` using `alternate` direction.

**Pane 8 (Not-close contrasting alternative)**
- **Base Color:** `#c084fc` (Lavender)
- **Dot Style:** Vaporous glow. High blur, low opacity. `background: #c084fc; box-shadow: 0 0 8px 4px rgba(192, 132, 252, 0.2), 0 0 16px 2px rgba(192, 132, 252, 0.1);`

---

## 5. Status: `idle`

**Pane 1 (Current)**
- **Base Color:** `#94a3b8` (`var(--status-idle-glow)`)
- **Dot Style:** Stone texture via multiple radial-gradients.
- **Shadow:** `0 0 12px 2px rgba(148, 163, 184, 0.5)`
- **Strip Glow:** 4s breathing animation `status-glow`. Static flat stone if `stale`. Strip `::before` at `0.4` opacity.

**Pane 2 (Close color variant)**
- **Base Color:** `#64748b` (Slate Gray)
- **Modifications:** Darker stone base, more subdued.

**Pane 3 (New effect/feel - Carbon Fiber)**
- **Dot Style:** `background: repeating-linear-gradient(45deg, #475569 0, #475569 2px, #334155 2px, #334155 4px);`
- **Shadow:** None. Pure matte finish.

**Pane 4 (Close color variant)**
- **Base Color:** `#a1a1aa` (Dim Silver / Zinc)

**Pane 5 (New effect/feel - Sleeping LED)**
- **Dot Style:** Almost black base `#0f172a`, with a tiny bright center point. `background: radial-gradient(circle at center, #ffffff 0%, transparent 15%), #0f172a;`
- **Animation:** The white dot breathes opacity `0.1` to `0.5` over `6s`.

**Pane 6 (Maybe-close color variant)**
- **Base Color:** `#4b5563` (Cool Gray)

**Pane 7 (Modified existing effect)**
- **Dot Style:** Keep the stone texture but add a fixed metallic highlight. `box-shadow: inset 0 4px 4px rgba(255,255,255,0.2), 0 0 4px rgba(148,163,184,0.2)`. Remove the 4s breathing animation for an absolutely rigid feel.

**Pane 8 (Not-close contrasting alternative)**
- **Base Color:** `#312e81` (Deep Matte Indigo)
- **Dot Style:** Recessed hole effect. `background: #1e1b4b; box-shadow: inset 0 2px 4px rgba(0,0,0,0.8), 0 1px 0 rgba(255,255,255,0.1);` pure dark void.

---

## 6. Status: `unknown`

**Pane 1 (Current)**
- **Base Color:** `#444460` / `#666680` (`var(--text-muted)`)
- **Dot/Strip Style:** Solid flat color. Transparent border. No box-shadow. No animation.

**Pane 2 (Close color variant)**
- **Base Color:** `#4c4c6d` (Muddy Violet)
- **Modifications:** Shifts slightly toward purple to feel like a lost signal rather than an empty state.

**Pane 3 (New effect/feel - TV Static Noise)**
- **Dot Style:** CSS noise fallback. `background: repeating-radial-gradient(circle at 15% 15%, #444460 1px, #2a2a3e 2px); background-size: 4px 4px;`
- **Strip Glow:** Completely `opacity: 0`.

**Pane 4 (Close color variant)**
- **Base Color:** `#52525b` (Ashen / Zinc 600)

**Pane 5 (New effect/feel - Foggy Glass)**
- **Dot Style:** `background: rgba(102, 102, 128, 0.2); border: 1px solid rgba(102, 102, 128, 0.4); backdrop-filter: blur(2px);`
- **Shadow:** None.

**Pane 6 (Maybe-close color variant)**
- **Base Color:** `#78716c` (Taupe)

**Pane 7 (Modified existing effect)**
- **Dot Style:** Flat color as Pane 1, but with a highly subtle, extremely slow vertical line. `background: linear-gradient(to bottom, #444460 0%, #444460 48%, #666680 50%, #444460 52%, #444460 100%); background-size: 100% 200%; animation: unknown-scan 10s linear infinite;`

**Pane 8 (Not-close contrasting alternative)**
- **Base Color:** Transparent.
- **Dot Style:** Glitch split. `background: transparent; box-shadow: inset 2px 0 0 rgba(6,182,212,0.4), inset -2px 0 0 rgba(217,70,239,0.4);`
- **Animation:** `@keyframes static-flicker { 0%, 100% { opacity: 0.5; } 50% { opacity: 0.8; } }` `0.2s steps(2) infinite`.

---

## 7. Status: `danger` (Maps to `error`)

**Pane 1 (Current)**
- **Base Color:** `#ef4444` (`var(--status-danger)`)
- **Dot Style:** Solid red, red border.
- **Shadow:** `0 0 10px 3px rgba(239, 68, 68, 0.6)`
- **Strip Glow:** Expanded strip gets `0 0 8px rgba(255, 107, 107, 0.3)`.
- **Animation:** `status-pulse` scales to `1.3` (Note: layout shifting).

**Pane 2 (Close color variant)**
- **Base Color:** `#dc2626` (Crimson)
- **Modifications:** Darker red base.

**Pane 3 (New effect/feel - Core Breach)**
- **Dot Style:** `background: #ffffff; border-color: #ef4444;`
- **Shadow:** Intensely stacked. `0 0 4px #fff, 0 0 12px 4px #ef4444, 0 0 20px 2px rgba(239,68,68,0.4)`
- **Animation:** `@keyframes breach-throb { 0%, 100% { opacity: 1; } 50% { opacity: 0.8; box-shadow: 0 0 2px #fff, 0 0 8px 2px #ef4444; } }` `1s ease-in-out infinite`. (No transform scaling).

**Pane 4 (Close color variant)**
- **Base Color:** `#991b1b` (Blood Red)

**Pane 5 (New effect/feel - Warning Beacon)**
- **Dot Style:** `#ef4444`.
- **Animation:** Double-flash opacity. `@keyframes beacon-flash { 0%, 10%, 20%, 100% { opacity: 1; box-shadow: 0 0 12px 2px #ef4444; } 5%, 15%, 30%, 90% { opacity: 0.3; box-shadow: none; } }` `2s infinite`.
- **Strip Glow:** Expanded strip pulses border opacity in sync with `beacon-flash`.

**Pane 6 (Maybe-close color variant)**
- **Base Color:** `#f43f5e` (Bright Coral / Rose)

**Pane 7 (Modified existing effect)**
- **Modifications:** Fix the layout shifting. Remove `transform: scale(1.3)`. Map `status-pulse` purely to `box-shadow` expansion. `@keyframes safe-status-pulse { 0%, 100% { box-shadow: 0 0 10px 3px rgba(239, 68, 68, 0.6); } 50% { box-shadow: 0 0 20px 6px rgba(239, 68, 68, 0.8); } }`.

**Pane 8 (Not-close contrasting alternative)**
- **Base Color:** `#84cc16` (Biohazard Green)
- **Dot Style:** Green core, toxic yellow border. `background: #84cc16; border-color: #eab308;`
- **Shadow:** `0 0 15px 3px rgba(234, 179, 8, 0.6)`.

---

## 8. Status: `plan-complete` (Maps to `plan_complete`)

**Pane 1 (Current)**
- **Base Color:** `#10b981` (`var(--status-plan-complete)`)
- **Dot/Strip Style:** Currently lacking full definition in `ProjectStrip.css`. Defaults to fallback rules. `var(--status-plan-complete-glow)` is `rgba(32, 178, 170, 0.5)`.

**Pane 2 (Close color variant)**
- **Base Color:** `#14b8a6` (Teal)
- **Modifications:** Introduces a basic solid dot with a matching glow `0 0 8px 1px rgba(20, 184, 166, 0.4)`.

**Pane 3 (New effect/feel - Success Aura)**
- **Dot Style:** Hollow center. `background: transparent; border: 2px solid #10b981;`
- **Shadow:** `inset 0 0 4px #10b981, 0 0 8px rgba(16, 185, 129, 0.5)`
- **Strip Glow:** Soft, persistent green border `rgba(16, 185, 129, 0.2)` on `.project-strip::before`.

**Pane 4 (Close color variant)**
- **Base Color:** `#166534` (Forest Green)

**Pane 5 (New effect/feel - Upward Sparkle)**
- **Dot Style:** `#10b981`.
- **Strip Glow:** `::after` layer with an upward moving noise/sparkle. `background: radial-gradient(1px 1px at 50% 50%, rgba(255,255,255,0.8), transparent) 0 0 / 10px 10px; animation: sparkle-rise 3s linear infinite;` (`to { background-position: 0 -100px; }`).

**Pane 6 (Maybe-close color variant)**
- **Base Color:** `#86efac` (Pale Green / Pistachio)

**Pane 7 (Modified existing effect)**
- **Dot Style:** Base `#10b981`. Provide a single, non-repeating pulse on load. `@keyframes success-wave { 0% { box-shadow: 0 0 0 0 rgba(16,185,129,0.8); } 100% { box-shadow: 0 0 0 8px transparent; } }` `animation: success-wave 1s ease-out forwards;`

**Pane 8 (Not-close contrasting alternative)**
- **Base Color:** `#f8fafc` (Platinum White)
- **Dot Style:** Solid white with a diamond glare. `background: #ffffff;`
- **Shadow:** Sharp cross-style glow. `0 -4px 4px -2px rgba(255,255,255,0.6), 0 4px 4px -2px rgba(255,255,255,0.6), -4px 0 4px -2px rgba(255,255,255,0.6), 4px 0 4px -2px rgba(255,255,255,0.6)`
