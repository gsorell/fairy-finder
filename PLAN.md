# Fairy Finder — Upgrade Plan

This file tracks every issue raised in the v1 review and the order we'll address
them in. Items are grouped into milestones. Each milestone should leave the game
fully playable; no half-finished features get merged.

## Milestone 1 — Feel & correctness ✅ DONE

Tunings: `MOVE_SPEED` 4.2 → 3.0, `JUMP_VELOCITY` -13.5 → -11.5, `GRAVITY` 0.75
→ 0.65, plus `JUMP_CUT = 0.45` for variable jump height. Browser key
auto-repeat is suppressed and jumps fire on the rising edge of the spacebar.

### 1.1 Full AABB collision resolution ✅
X and Y axes are resolved separately each frame. After X movement, any
platform overlap pushes the player to the corresponding edge; same for Y.
`onGround` is only set on a downward Y resolution. Hitting the underside of a
platform now bonks the head (vy zeroed) instead of passing through.

### 1.2 Robust stomp detection ✅
Position-based check: `(p.y + p.h - b.y) < (b.h * 0.6)`. Independent of vy —
works regardless of fall speed or grounded state. Stomp also snaps the player
to `b.y - p.h` so they sit cleanly on top.

### 1.3 Coyote time + jump buffering ✅
`COYOTE_FRAMES = 6` and `JUMP_BUFFER_FRAMES = 6`. Coyote refreshes whenever
`onGround` becomes true after collision resolution; decrements once per frame
otherwise. Jump press sets the buffer; both must be > 0 for a jump to fire.
Jump check happens AFTER movement so a buffered press resolves on the same
frame the player lands.

### 1.4 Bug consequence ✅
Side-hit drops the most recently collected flower (`got = false`), decrements
score, applies `INV_FRAMES = 45` invuln. Invuln blocks further side-hit
penalty AND triggers a 4-frame on/off flicker in `drawFamilyPlayer`. Stomps
still work through invuln.

## Milestone 2 — Audio ✅ DONE

All SFX in [src/audio.js](src/audio.js). Single lazy-init `AudioContext`
primed on the first keydown to satisfy browser autoplay rules. Internal
`tone()` and `noise()` helpers schedule via `currentTime + delay` so multi-note
cues need no `setTimeout`.

### 2.1 SFX ✅
- `sfxJump`: 280→440 Hz sine, 90ms — fires when a buffered jump actually
  resolves (post-coyote/buffer check), not on key press.
- `sfxCollect`: C5 → E5 square arpeggio, 60ms apart.
- `sfxBonk`: lowpassed noise burst, 60ms — stomp.
- `sfxHurt`: 200→110 Hz sawtooth, 220ms — side-hit (skipped during invuln).
- `sfxFairy`: E5/G5/B5/D6 triangle sparkle on fairy contact.
- `sfxLevelClear`: C-E-G-C-E triangle cadence, queued 500ms after `sfxFairy`
  via `setTimeout`.

### 2.2 Mute toggle ✅
`M` key OR HUD button (top-right). State persists in
`localStorage['fairy-finder-muted']`. React state `muted` is updated
side-by-side with the module flag so the button label stays in sync.

## Milestone 3 — Touch controls

Required for iPad/phone play.

### 3.1 On-screen pad
- Left + right buttons bottom-left, jump button bottom-right.
- Only render when `pointer: coarse` matches OR if a touch event has been
  detected at least once.
- Use `pointerdown`/`pointerup`/`pointercancel`, not `touchstart` — handles
  mouse-on-touchscreen edge cases.
- Tap anywhere on the canvas during title/complete/win screens advances.
**Acceptance:** Game is fully playable with thumbs on a phone in landscape.

### 3.2 Responsive canvas sizing
Already mostly handled by `w-full max-w-[960px] aspect-video` Tailwind classes.
Verify the canvas backing-store stays at 960×540 (we don't want to upscale
internal coordinates), but the CSS box scales to viewport.

## Milestone 4 — Scrolling camera + bigger levels ✅ DONE

### 4.1 Camera transform ✅
`cameraX` lives on game state. Target each frame is
`clamp(player.x + player.w/2 - GAME_W/2, 0, level.width - GAME_W)`. Smoothed
with a 0.12 lerp factor. Snaps to 0 on respawn after a fall. Applied as a
`ctx.translate(-cameraX, 0)` around the world layer in `drawScene`.

### 4.2 Level data: width + scroll ✅
All three levels are now `width: 1920` (2×). Floor extended to full width;
each level got 5 new platforms, 7–8 new collectibles, and 2 new bugs. Fairies
moved to near x=1850. New platforms reuse the existing `name` taxonomy
(`couch`, `bookshelf`, `tree branch`, `log`, etc.) so platform coloring stays
consistent.

### 4.3 Parallax + extended scenery ✅
Clouds scroll at 0.3× camera with horizontal drift, distributed across the
full level width. Per-level scenery extended:
- **home**: living-room windows duplicated at +960 offset.
- **school**: two extra background trees at x=1200 and x=1700.
- **pond**: water + wave loop now span `level.width`; extra tree at x=1450.

## Milestone 5 — Polish & retention

### 5.1 Character select ✅ FIRST PASS
Title screen now shows three character previews: **Big Sis** (light blue
floral dress, dark hair, hibiscus clip), **Lil Sis** (pink floral dress, dark
pigtails with ribbons), and **Dad** (existing bearded sunglasses character).
Selection via ← → arrows, A/D keys, or 1/2/3 number keys. Persisted in
`localStorage['fairy-finder-character']`. Same hitbox (34×70) and physics for
all three; only `character.draw(ctx)` differs.

**Vector art is placeholder.** The two girls are first-pass renderings to get
the system in place — the `drawBigSis` and `drawLilSis` functions will be the
iteration targets when you want to refine their look. Body envelope is fixed
so any redesign stays gameplay-compatible.

### 5.2 Level transition animation
Fairy float-out + flowers pop into a counter on level-clear, instead of an
instant overlay.

### 5.3 Particles
Sparkles when a flower is collected, dust puff on landing, fairy rescue burst.
A single 50-particle pool, no allocation per frame.

### 5.4 Save state
Last-completed level persisted to `localStorage` so a kid doesn't have to
restart from level 1 every session. Title screen offers "continue" if a save
exists.

## Milestone 6 — Art (the big one)

Held until last because it benefits from everything above being in place
first.

### 6.1 Sprite sheets
Replace `drawFamilyPlayer`, `drawBug`, `drawFairy`, `drawCollectible` with
sprite-sheet animation. Frame-counter already exists; add `frameIndex`,
`frameDuration`, `loop` per animation state.

### 6.2 Tilemap rendering
Migrate hand-placed `platforms` arrays to a tile grid (16×16 or 32×32 cells)
with tile IDs. Author levels in a JSON file editable in
[Tiled](https://www.mapeditor.org/) or a simple in-repo editor. Solid/empty
distinction stays at the cell level for collision; no need for per-tile rects.

### 6.3 Reference photography
Take one photo each of: living room, schoolyard, pond. Trace into pixel-art
tilesets. This is when the game stops feeling generic.

---

## Non-goals (for now)

- Multi-player / multi-character co-op on one screen.
- Procedural levels.
- Boss fights.
- Cutscenes / dialogue beyond the existing one-line sign.
- Inventory system.
- Skill tree / progression.

These can come back if the kid actually plays the game enough to outgrow it.
That's a much better problem to have than over-investing now.
