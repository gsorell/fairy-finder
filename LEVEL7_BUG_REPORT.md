# Level 7 (NYC Rooftop) — Bug Report & Design Specification

## Project Context

**File to edit:** `src/FairyFinder.jsx`  
**Framework:** React + Vite, canvas-2D game loop  
**Dev server:** `npm run dev` → localhost:5174  
**Current debug mode:** `makeGame(6, "playing")` near the bottom of the file starts directly on Level 7. Revert to `makeGame()` when done.

---

## Physics Constants (do NOT change these)

```js
const GAME_W = 960;
const GAME_H = 540;
const GRAVITY = 0.65;
const MOVE_SPEED = 3.0;
const JUMP_VELOCITY = -11.5;       // normal jump
const HANG_GRAVITY = 0.10;
const HANG_VY_WINDOW = 3.5;
const HANG_MAX_FRAMES = 10;
const SUPER_JUMP_VELOCITY = -17.5; // spring launch vy
const SPRING_LAUNCH_SPEED_MIN = 4.8;
const SPRING_LAUNCH_SPEED_MAX = 6.8;
const SPRING_AIR_SPEED = 4.6;
const SPRING_HANG_GRAVITY = 0.05;
const SPRING_HANG_VY_WINDOW = 6.5;
const SPRING_HANG_MAX_FRAMES = 18;
```

**Derived jump limits (approximate):**
- Max normal jump height: `11.5² / (2 × 0.65)` ≈ **102 px**
- Max spring jump height: ~**235 px** (vy=17.5, with reduced hang gravity)
- Horizontal travel at MOVE_SPEED=3.0 for 10 hang frames ≈ 30 px extra

---

## Player Size

```js
const PLAYER = { w: 34, h: 70 };
```

Player Y coordinate is the **top** of the sprite. Feet = `p.y + 70`.

---

## Level 7 Configuration (vertical scrolling level)

```js
{
  id: "nyc",
  height: 2200,
  vertical: true,
  start: { x: 120, y: 2060 },  // player top at y=2060, feet at y=2130
  fairy: { x: 370, y: 60 },
}
```

- `vertical: true` means `cameraX = 0` always; camera tracks vertically.
- Player X is clamped to `[0, GAME_W - 34]` = `[0, 926]`.
- Camera freezes during `springAirborne` (spring flight).

---

## Collision Resolution Code (do NOT change)

```js
if (rectsOverlap(p, plat)) {
  if (p.vy > 0) {
    p.y = plat.y - p.h;   // land on top
    p.onGround = true;
  } else if (p.vy < 0) {
    p.y = plat.y + plat.h; // hit ceiling — pushed DOWN to platform bottom face
  }
  p.vy = 0;
}
```

**Critical implication:** When the player jumps up (vy < 0) and hits a platform from below, they are pushed to the platform's **bottom face** and velocity zeroed. There is no "phase through" — any upward movement that intersects a platform results in a ceiling bonk.

---

## Spring Mechanics

**Spring data shape:**
```js
{ x, y, w: 72, h: 14, name: "askew plank", launchToX: <number> }
```

**Direction:** `launchToX >= (s.x + s.w/2)` → launch right (+vx); else launch left (-vx).  
**Visual tilt:** Springboard rotates 0.32 rad toward launch direction.

**Launch physics:**
```js
const launchDir = getSpringDirection(s);         // ±1
const springCenterX = s.x + s.w / 2;
const targetX = s.launchToX;                     // always defined for Level 7
const launchDx = Math.abs(targetX - springCenterX);
const launchSpeed = clamp(4.2 + launchDx / 55, 4.8, 6.8); // px/frame horizontal
p.vy = SUPER_JUMP_VELOCITY;   // -17.5
p.vx = launchDir * launchSpeed;
g.springAirborne = true;
g.springCooldown = 12;        // frames before spring can fire again
```

Spring fires on **any contact** (not only landing on top). The 12-frame cooldown prevents re-triggering.  
`springAirborne` is cleared when `p.onGround` becomes true.

**Design rule for springs:**
1. Spring sits ON TOP of its host platform (spring `y` = host platform `y - 14`).
2. No platform may horizontally overlap the spring's launch lane above it — the player must fly unobstructed.
3. `launchToX` is the **target landing X center** (not the destination platform's edge). Choose it so the player arcs onto the intended platform.

---

## The Core Design Rule — Horizontal Overlap Constraint

> **Two consecutive platforms in the route MUST NOT horizontally overlap if the upper one is reachable by jumping from the lower one.**

### Why:
If Platform A (lower) and Platform B (upper) share any X range, and B is above A within jump reach (gap ≤ 102 px), then:

1. The player standing on A has `head_y = A.y - 70`.
2. Platform B's bottom face is at `B.y + B.h`.
3. If `B.y + B.h > A.y - 70` (i.e., B's bottom is BELOW the player's head) → **the player can't even stand without clipping**.
4. Even if clearance is a few pixels, the first frame of a jump sends vy negative, immediately triggering the ceiling-bonk code → player is stuck.

### The Formula:
For two horizontally-overlapping platforms A (lower) and B (upper) to be traversable:

```
B.y + B.h  ≤  A.y - PLAYER.h  - clearance_margin
```

With `PLAYER.h = 70`, `B.h = 20`, and a safe `clearance_margin = 5`:

```
B.y ≤ A.y - 70 - 20 - 5 = A.y - 95
```

But B must also be reachable:
```
A.y - B.y ≤ 102   →   B.y ≥ A.y - 102
```

So the only valid range for overlapping platforms is:
```
A.y - 102  ≤  B.y  ≤  A.y - 95
```

That's only a **7 px window** — extremely tight and error-prone.

### Recommended approach:
**Simply do not allow consecutive route platforms to horizontally overlap at all.** Use a clean zig-zag pattern where each platform's X range is entirely to the left OR right of the previous one. This eliminates the overlap constraint entirely and makes the level easy to reason about.

---

## Current Broken Platform Layout & Specific Problems

### Platform list (current, as of last edit):
```js
{ x: 0,   y: 2140, w: 1920, h: 60, name: "street" },
{ x: 50,  y: 2055, w: 150,  h: 22, name: "dumpster" },        // [50, 200]
{ x: 120, y: 1970, w: 200,  h: 20, name: "scaffold ledge" },  // [120, 320] ← BUG 1
{ x: 390, y: 1880, w: 200,  h: 20, name: "scaffold ledge" },  // [390, 590]
{ x: 660, y: 1790, w: 200,  h: 20, name: "scaffold ledge" },  // [660, 860]
{ x: 420, y: 1700, w: 200,  h: 20, name: "scaffold ledge" },  // [420, 620]
{ x: 690, y: 1610, w: 200,  h: 20, name: "window ledge" },    // [690, 890]
{ x: 620, y: 1520, w: 200,  h: 20, name: "scaffold ledge" },  // [620, 820] ← BUG 2 (spring host)

{ x: 390, y: 1330, w: 200,  h: 20, name: "scaffold ledge" },  // [390, 590]
{ x: 140, y: 1240, w: 200,  h: 20, name: "scaffold ledge" },  // [140, 340]
{ x: 410, y: 1150, w: 200,  h: 20, name: "window ledge" },    // [410, 610]
{ x: 170, y: 1060, w: 200,  h: 20, name: "scaffold ledge" },  // [170, 370]
{ x: 430, y: 970,  w: 200,  h: 20, name: "scaffold ledge" },  // [430, 630]
{ x: 180, y: 880,  w: 200,  h: 20, name: "scaffold ledge" },  // [180, 380] (spring host)

{ x: 430, y: 700,  w: 200,  h: 20, name: "scaffold ledge" },  // [430, 630]
{ x: 680, y: 610,  w: 200,  h: 20, name: "scaffold ledge" },  // [680, 880]
{ x: 450, y: 520,  w: 200,  h: 20, name: "window ledge" },    // [450, 650]
{ x: 700, y: 430,  w: 200,  h: 20, name: "scaffold ledge" },  // [700, 900]
{ x: 640, y: 340,  w: 200,  h: 20, name: "scaffold ledge" },  // [640, 840] (spring host)

{ x: 390, y: 180,  w: 200,  h: 20, name: "window ledge" },    // [390, 590]
{ x: 250, y: 120,  w: 240,  h: 24, name: "roof lip" },        // [250, 490]
```

### Spring list:
```js
{ x: 700, y: 1496, w: 72, h: 14, launchToX: 490 },  // spring center ~736, dir LEFT
{ x: 250, y: 856,  w: 72, h: 14, launchToX: 530 },  // spring center ~286, dir RIGHT
{ x: 710, y: 316,  w: 72, h: 14, launchToX: 490 },  // spring center ~746, dir LEFT
```

---

### BUG 1 — Impossible start (the "very first thing" problem)

| Item | X range | Y (top surface) |
|------|---------|-----------------|
| Dumpster (A) | [50, 200] | 2055 |
| Scaffold 1 (B) | [120, 320] | 1970 |

**Horizontal overlap:** [120, 200] — 80 px wide.  
**Vertical gap:** 2055 − 1970 = **85 px** (within jump reach ✓)  
**Head clearance:** `B.y + B.h − (A.y − 70)` = `1990 − 1985` = **5 px**

When the player stands on the dumpster at x ∈ [120, 200], their head is 5 px from the scaffold's bottom face. Any upward velocity → immediate ceiling bonk → player stuck on dumpster forever.

The player cannot move right out from under it either: the scaffold extends to x=320, but the dumpster only extends to x=200. Once the player steps off the dumpster at x=200 they are on the **street** (y=2140), from which the scaffold at y=1970 is 170 px up — far beyond the 102 px max jump.

**The player is irreversibly trapped at the start of the level.**

---

### BUG 2 — Impossible jump to Spring 1 host platform

| Item | X range | Y (top surface) |
|------|---------|-----------------|
| Window ledge (A) | [690, 890] | 1610 |
| Spring host (B) | [620, 820] | 1520 |

**Horizontal overlap:** [690, 820] — 130 px wide.  
**Vertical gap:** 1610 − 1520 = **90 px** (within jump reach ✓)  
**Head clearance:** `1540 − 1540` = **0 px**

The player's head exactly touches the spring host bottom face while standing on the window ledge. No jump is possible in the overlap zone. The non-overlapping right portion of the window ledge (x:[820,890]) is only 36 px wide; jumping from there the player would need to arc left to reach the spring host, but the spring host ends at x=820 and the player would be at x ≥ 856, requiring a leftward arc of ≥ 36 px — very tight, essentially undoable without pixel-perfect positioning.

---

### Additional potential issues to verify

Run through the rest of the route and check each consecutive pair for horizontal overlap:

| From | To | X overlap? |
|------|----|-----------|
| Street [0,1920] → Dumpster [50,200] | ✓ overlap | gap=85, clearance= street is ground so fine |
| Scaffold 1 [120,320] → Scaffold 2 [390,590] | ✗ no overlap | ✓ |
| Scaffold 2 [390,590] → Scaffold 3 [660,860] | ✗ no overlap | ✓ |
| Scaffold 3 [660,860] → Scaffold 4 [420,620] | ✗ no overlap | ✓ |
| Scaffold 4 [420,620] → Window [690,890] | ✗ no overlap | ✓ |
| **Window [690,890] → Spring host [620,820]** | ✓ overlap [690,820] | **BUG 2** |
| Spring1 land target (~490) → next scaffold? | check y=1330 | ~240 px spring rise, verify X |
| Upper sections | inspect manually | not yet verified |

---

## What Needs to Be Done

### Minimum fix (surgical):

1. **Fix BUG 1:** Move `scaffold ledge` at y=1970 so it does NOT horizontally overlap the dumpster [50,200].  
   - Simplest: change `x: 120` → `x: 230` (new range [230,430], dumpster ends at 200). Gap still 85 px ✓.

2. **Fix BUG 2:** Move the spring host platform (currently `{ x: 620, y: 1520 }`) so it does NOT horizontally overlap the window ledge [690,890].  
   - Simplest: change `x: 620` → `x: 450` (new range [450,650], window ledge starts at 690). Same gap 90 px ✓.  
   - Also update spring 1: `x: 700` → `x: 530` (sits on new host, launch still goes left to launchToX: 490 ✓).

3. **Verify the rest of the route** for additional overlapping pairs using the formula above, and fix any found.

### Ideal fix (full redesign):

Redesign the entire Level 7 platform list following this constraint:

> **No two consecutive route platforms share any X range.**

Use a zig-zag stagger: if platform N is at x:[L, L+200], platform N+1 must start at x > L+200 (shifted right) or end at x < L (shifted left). Alternate sides of the 960-px-wide screen. Vertical gaps should be 75–95 px between each step.

**Template for clean zig-zag (reference, not prescriptive):**
```
Street           y=2140   x:[0, 1920]   (ground)
Dumpster         y=2055   x:[50, 200]   (step 1 — 85 px rise)
Scaffold A       y=1965   x:[230, 430]  (no overlap with dumpster, 90 px rise)
Scaffold B       y=1875   x:[490, 690]  (no overlap with A, 90 px rise)
Scaffold C       y=1785   x:[220, 420]  (no overlap with B, 90 px rise)
...continuing...
Spring host 1    y=XXX    x:[L, L+200]  (no overlap with previous)
Spring 1         y=XXX-14 x:[L+64, L+136] launchToX= center of landing platform
...etc...
Roof lip         y=120    x:[250, 490]
```

Each platform must be within 102 px of the one below it (for a normal jump) or within 235 px if accessed via spring.

---

## Spring Placement Rules (for redesign)

1. Spring sits at `y = host_platform.y - 14` (flush on top of host).
2. Spring `x` should be near the edge of the host platform facing the launch direction (right edge if launching right, left edge if launching left).
3. `launchToX` should be the **horizontal center of the destination platform** the player should land on.
4. No platform should exist in the vertical strip `[spring.x, spring.x + spring.w]` between the spring and the top of the level — the launch lane must be clear.
5. After the spring lands the player, the destination platform must be reachable (within spring jump arc).

---

## Summary of What Has Already Been Implemented & Works

- Spring contact detection (not just top-land) ✓
- 12-frame spring cooldown ✓
- `springAirborne` flag freezes camera during flight ✓
- Spring tilt/direction derived from `launchToX` ✓
- Distance-scaled launch speed ✓
- Player clamped to `GAME_W` in vertical levels ✓
- All other levels (1–6) are working and should not be touched ✓

**Do not change any physics constants, collision code, spring launch code, camera code, or other levels. Only edit the Level 7 `platforms` and `springboards` arrays.**
