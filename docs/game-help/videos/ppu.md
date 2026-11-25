# PPU (Tiles & Sprites) User Manual

`VIDEO_MODE = 1` (`VIDEO_MODE_PPU`). A classic tile-based 2D renderer:
an 8×8-pixel tile set, a background made of tiles arranged in a grid,
and up to 128 independently movable sprites on top. See the Video
Controller manual first for how to read/write VRAM at all.

## 1. VRAM layout in PPU mode

| Region | Offset (inside VRAM) | Size |
|---|---|---|
| `VRAM_TILESET_BASE` | `0x0000` | 32KB — 1024 tiles × 32 bytes (8×8 @ 4bpp) |
| `VRAM_TILEMAP_BASE` | `0x8000` | 4KB — 64×32 cells × 2 bytes (background layer 1) |
| `VRAM_PALETTE_BASE` | `0x9000` | 512B — 256 colors × 2 bytes (RGB555). The first 16 entries come preloaded every Reset with a default CGA/EGA-style palette — safe to overwrite, see the Video Controller manual |
| `VRAM_SPRITES_BASE` | `0x9200` | 1024B — 128 sprites × 8 bytes |
| `VRAM_TILEMAP2_BASE` | `0x9600` | 4KB — background layer 2 (parallax, §5) |
| `VRAM_LINE_SCROLL1_BASE` | `0xA600` | 400B — layer 1 per-scanline scroll table, 200 × s16 (§5.1) |
| `VRAM_LINE_SCROLL2_BASE` | `0xA800` | 400B — layer 2 per-scanline scroll table, 200 × s16 (§5.1) |
| `VRAM_AFFINE_TABLE_BASE` | `0xAA00` | 1600B — affine layer table, 200 × 8 bytes (§5.2) |

Everything from `0xA600` up that isn't listed above is free for your own use.

The screen is 320×200 (40×25 tiles). Each tilemap is bigger than the
screen (64×32 cells = 512×256 pixels) — see §4.1, Scrolling.

## 2. Tiles

Each tile is 8×8 pixels at 4 bits per pixel (16 possible color indices
per pixel, 32 bytes total). Pixel `0` in a **background** tile is
opaque (drawn normally); pixel `0` in a **sprite** is transparent (see
§6).

## 3. The tilemap — background layer 1

Each cell is a 16-bit "attribute word", used identically for tilemap
cells and for sprites:

| Bits | Meaning |
|---|---|
| 0–9 | Tile index (0–1023) |
| 10–13 | Palette group (0–15 — see §4) |
| 14 | Horizontal flip |
| 15 | Vertical flip |

```asm
MOV R0, VRAM_TILEMAP_BASE   ; cell (0,0)
STORE R0, VRAM_ADDR
MOV R1, 5                    ; tile #5, palette group 0, no flip
STORE R1, VRAM_DATA
```

Named masks: `PPU_ATTR_TILE_MASK` (`0x03FF`), `PPU_ATTR_PALETTE_SHIFT`
(`10`), `PPU_ATTR_HFLIP` (`0x4000`), `PPU_ATTR_VFLIP` (`0x8000`).

## 4. Palette

256 colors total, organized as **16 groups of 16 colors** — a tile's
"palette group" (bits 10–13 of its attribute word) picks which group of
16 it draws from. Each color is 2 bytes, RGB555 (5 bits per channel: R
in bits 10–14, G in bits 5–9, B in bits 0–4).

```asm
MOV R0, VRAM_PALETTE_BASE
ADD R0, 2                     ; index 1 (index 0 + 2 bytes)
STORE R0, VRAM_ADDR
MOV R1, 0x7FFF                 ; white
STORE R1, VRAM_DATA
```

An absolute palette index = `PaletteGroup * 16 + PixelValue`.

### 4.1 Scrolling

`SCROLL_X` (`0xC106`) / `SCROLL_Y` (`0xC108`) shift layer 1's visible
window over its 512×256-pixel world, in **pixels** (not cells), with
wraparound — scrolling past the edge seamlessly shows the opposite
edge, useful for repeating/tiling backgrounds.

```asm
LOAD R0, SCROLL_X
INC R0
STORE R0, SCROLL_X    ; scrolls 1px per loop iteration
```

### 4.2 Backdrop

`BACKDROP_COLOR` (`0xC10C`, RGB555) is what shows through wherever
**every** background layer's pixel is transparent (index `0`) at that
screen position.

### 4.3 Brightness

`SCREEN_BRIGHTNESS` (`0xC10A`), range `0`–`16` (`0` = black, `16` =
normal — the default after Reset). Applied as a final multiplier over
the whole composed frame (both background layers + sprites), same idea
as a real SNES's master brightness register. Useful for fade in/out
effects.

## 5. A second background layer — parallax

A completely independent background layer, with its own scroll and its
own tilemap (`VRAM_TILEMAP2_BASE`), but **sharing** the tileset and
palette with layer 1 (no need to duplicate graphics). Off by default —
turn it on with `BG2_ENABLE` (`0xC11A`, bit 0).

Layer 2 draws **first** (farthest away), layer 1 draws on top of it,
sprites draw on top of both. Give layer 2 a slower scroll rate than
layer 1 for the classic parallax depth illusion (distant elements
appear to move slower):

```asm
MOV R0, 1
STORE R0, BG2_ENABLE

; layer 1 scrolls twice as fast as layer 2 - depth cue
LOAD R0, SCROLL_X
ADD R0, 2
STORE R0, SCROLL_X

LOAD R0, SCROLL2_X
INC R0
STORE R0, SCROLL2_X
```

Layer 2's tilemap starts all-zero (tile `0`) after Reset, same as
layer 1 — you need to fill it explicitly (see the worked example at
the end of this manual) or it will simply show nothing (transparent),
letting layer 1/backdrop show through everywhere.

### 5.1 Per-scanline scroll (line scroll)

Each layer can have its own horizontal offset **per screen line**, for
water ripples, heat haze, curved roads or parallax strips (far sky
slower than near ground, all in one layer). Enable it per layer with
`LINE_SCROLL_CTRL` (`0xC12E`): bit 0 = layer 1
(`LINE_SCROLL_CTRL_LAYER1`), bit 1 = layer 2 (`LINE_SCROLL_CTRL_LAYER2`).

The tables are 200 signed 16-bit words (one per screen line), at
`VRAM_LINE_SCROLL1_BASE` (`0xA600`) and `VRAM_LINE_SCROLL2_BASE`
(`0xA800`). The word for line `Y` is **added** to the global `SCROLL_X` /
`SCROLL2_X`, in pixels, with the usual wraparound. Negative offsets use
two's complement (`0xFFFE` = -2). Vertical scroll stays global.

```asm
; wavy layer 1: lines alternate between +2 and -2 pixels
MOV R0, VRAM_LINE_SCROLL1_BASE
STORE R0, VRAM_ADDR
MOV R2, 0
WAVE_LOOP:
    MOV R1, 2
    STORE R1, VRAM_DATA        ; even line: +2
    MOV R1, 0xFFFE
    STORE R1, VRAM_DATA        ; odd line: -2
    INC R2
    CMP R2, 100
    JNZ WAVE_LOOP              ; 100 iterations x 2 lines = 200 lines
MOV R0, LINE_SCROLL_CTRL_LAYER1
STORE R0, LINE_SCROLL_CTRL
```

These are ordinary VRAM writes, so outside VDP mode they obey the vblank
window (Video Controller manual §3): run the loop right after a vblank
(wait for `FRAME_COUNT_LO` to change), use the retry pattern, or copy
a prepared table with DMA, which waits for vblank by itself.

### 5.2 Affine layer (Mode 7)

Layer 2 can be switched from a plain tile layer to an **affine layer**:
a rotated/scaled plane sampled per screen line, the classic SNES
"Mode 7" floor or rotating map. It needs **both** `BG2_ENABLE` and
`AFFINE_CTRL` (`0xC130`) bit 0 (`AFFINE_CTRL_ENABLE`). It uses layer 2's
tilemap and the shared tileset/palette, and **ignores `SCROLL2_X/Y` and
the layer-2 line-scroll table** (the table below replaces them). Layer 1
and sprites draw on top as usual.

For every screen line there is an 8-byte entry at
`VRAM_AFFINE_TABLE_BASE` (`0xAA00`) `+ line * AFFINE_ENTRY_STRIDE` (8):

| Offset | Field | Format |
|---|---|---|
| 0 | `AFFINE_XSTART_OFFSET` | u16, world X at the left of the line, in pixels × 128 |
| 2 | `AFFINE_YSTART_OFFSET` | u16, world Y at the left of the line, in pixels × 128 |
| 4 | `AFFINE_DX_OFFSET` | s16, world X step per screen pixel, in pixels × 256 |
| 6 | `AFFINE_DY_OFFSET` | s16, world Y step per screen pixel, in pixels × 256 |

For screen pixel `X` of that line, the world position (in 1/256 px) is
`start*2 + step*X`. It wraps around the 512×256-pixel tilemap world.
So `DX = 0x0100` is 1:1 horizontally, `0x0080` magnifies ×2, `0x0200`
shrinks ×2. A flat, unrotated plane has `DY = 0`; rotation comes from
non-zero `DX` **and** `DY` that change together (`DX = cos·s`,
`DY = sin·s`). **Perspective** comes from a scale that changes with
the line: far lines (top) step over more world per pixel than near
lines (bottom).

```asm
; a floor receding to the horizon: DX grows with the line number
    MOV R0, 1
    STORE R0, BG2_ENABLE
    MOV R0, AFFINE_CTRL_ENABLE
    STORE R0, AFFINE_CTRL
    ; (fill VRAM_TILEMAP2_BASE with floor tiles first - see §5)

    LOAD R5, FRAME_COUNT_LO
WAIT_VBLANK:                       ; table writes obey the vblank window
    LOAD R0, FRAME_COUNT_LO
    CMP R0, R5
    JZ WAIT_VBLANK

    MOV R0, VRAM_AFFINE_TABLE_BASE
    STORE R0, VRAM_ADDR
    MOV R2, 0                      ; line
    MOV R3, 0                      ; YSTART, grows 64 per line
FLOOR_LOOP:
    MOV R1, 0
    STORE R1, VRAM_DATA            ; XSTART = 0
    STORE R3, VRAM_DATA            ; YSTART
    MOV R1, 64
    ADD R1, R2
    STORE R1, VRAM_DATA            ; DX = 64 + line  (0.25 .. 0.78 px/px)
    MOV R1, 0
    STORE R1, VRAM_DATA            ; DY = 0
    ADD R3, 64
    INC R2
    CMP R2, 200
    JNZ FLOOR_LOOP
```

The loop does about 2,400 instructions, which fits in the vblank window
at normal speeds; on a very slow simulator speed prefer building the
table in RAM and sending it with one `RAM_TO_VRAM` DMA (which waits for
vblank by itself), or rewrite only part of it per frame. Update
`XSTART`/`YSTART` each frame to move over the plane; update `DX`/`DY` to
rotate it. The table is read every frame, so changes show up on the next one.

Limitations: it is **layer 2 only**; the affine layer is sampled
point-wise (no interpolation); and while it is on, layer 2 has no
ordinary scrolling.

## 6. Sprites

Up to 128, each an 8-byte entry at `VRAM_SPRITES_BASE + index * 8`:

| Offset | Field | Type |
|---|---|---|
| 0 | X | **s16** (signed) |
| 2 | Y | u16 |
| 4 | Attribute word (same format as §3) | u16 |
| 6 | Size + priority + blend (see below) | u16 |

The Size field packs three things:

| Bits | Meaning |
|---|---|
| 0–1 | Size: `PPU_SPRITE_SIZE_8` (`0`), `_16` (`1`), `_32` (`2`), `_64` (`3`) |
| 2 | `PPU_SPRITE_PRIORITY_BEHIND_BG` — see §6.2 |
| 3 | `PPU_SPRITE_BLEND` — see §6.3 |

**X is signed.** Values `0x8000`–`0xFFFF` are negative, so a sprite can
slide smoothly in and out of the left edge: `0xFFF8` is X = -8 (the
assembler has no negative immediates, so write the two's complement).
Collision boxes use the signed X too. Y stays unsigned. **Compatibility
note:** a program that used to hide a sprite with a huge X (such as
`0xFFFF`) will now show a sliver at the left edge — hide sprites with
`Y >= 200` instead.

### 6.1 Multi-tile sprites — a critical gotcha

**A sprite bigger than 8×8 needs multiple *consecutive* tiles, not
one tile stretched.** `PPU_SPRITE_SIZE_16` needs a full 2×2 block (4
tiles: the base tile index, plus `+1`, `+2`, `+3`); `_32` needs 4×4 (16
tiles); `_64` needs 8×8 (64 tiles). If two sprites' tile ranges
accidentally overlap (e.g. sprite A is 16×16 starting at tile 1, so it
silently claims tiles 1–4, and sprite B's *own* single-tile graphic
happens to sit at tile 2), you'll see a sprite made of mismatched
graphics glued together, not a clean error — this is easy to miss and
easy to get right once you know to plan for it.

```asm
; WRONG: a 16x16 sprite starting at tile 1 uses tiles 1,2,3,4 -
; if another sprite has ITS tile at index 2, they will blend together
MOV R1, PPU_SPRITE_SIZE_16
STORE R1, [attribute_offset]   ; tile base = 1 (from the Attr above)

; RIGHT: reserve one complete, consecutive block of 4 tiles for
; each 16x16 sprite, so no other sprite touches it
```

Larger tiles are arranged left-to-right then top-to-bottom (a 16×16
sprite at base tile `T` uses `T`, `T+1` for its top row and `T+2`,
`T+3` for its bottom row). Flipping a multi-tile sprite mirrors the
whole image (both the tile arrangement and each tile's own pixels).

Convention: a sprite with `Y >= 200` is treated as hidden (off-screen) —
there's no dedicated visibility bit. Pixel value `0` is transparent in
sprites (the background shows through), unlike in the tilemap.

```asm
MOV R2, VRAM_SPRITES_BASE
STORE R2, VRAM_ADDR
MOV R1, 100
STORE R1, VRAM_DATA          ; X = 100
MOV R1, 80
STORE R1, VRAM_DATA          ; Y = 80
MOV R1, 3
STORE R1, VRAM_DATA          ; tile 3, palette group 0, no flip
MOV R1, PPU_SPRITE_SIZE_16
STORE R1, VRAM_DATA          ; 16x16
```

### 6.2 Priority — sprites behind the background

Setting `PPU_SPRITE_PRIORITY_BEHIND_BG` (bit 2 of the Size field) makes
that sprite draw **behind** any opaque background pixel (from either
layer) instead of always on top. Where the background is transparent
at that spot, the sprite still shows through normally — it only hides
behind *actually drawn* background tiles, not the backdrop.

```asm
MOV R1, PPU_SPRITE_SIZE_8
MOV R0, PPU_SPRITE_PRIORITY_BEHIND_BG
OR R1, R0
STORE R1, VRAM_DATA          ; this sprite now draws behind opaque tiles
```

### 6.3 Blending — translucent sprites

Setting `PPU_SPRITE_BLEND` (bit 3 of the Size field) draws the sprite's
opaque pixels as a **50/50 average** with whatever is already on screen
under them (backgrounds and earlier sprites) instead of replacing it.
Good for shadows, glass, water, ghosts and light effects. Transparent
pixels (index `0`) still draw nothing. Combine flags with `OR`:

```asm
MOV R1, PPU_SPRITE_SIZE_16
MOV R0, PPU_SPRITE_BLEND
OR R1, R0
STORE R1, VRAM_DATA          ; 16x16 translucent sprite
```

## 7. Sprite-vs-sprite collision

A query port, not an automatic per-frame computation — write two
sprite indices, read back whether their bounding boxes (AABB, not
pixel-perfect) currently overlap:

```asm
MOV R0, 0
STORE R0, COLLISION_SPRITE_A
MOV R0, 1
STORE R0, COLLISION_SPRITE_B
LOAD R0, COLLISION_RESULT
CMP R0, 0
JZ NOT_TOUCHING
; they are touching
```

## 8. Sprite-vs-background collision

For platformer-style movement ("did I land on the ground?", "did I hit
a wall?") — this probes the 4 edges just outside the sprite's
bounding box against a chosen tilemap layer, and returns a **bitmask**
telling you which sides touched something opaque, not just yes/no:

```asm
MOV R0, 0
STORE R0, COLLISION_BG_SPRITE   ; which sprite
MOV R0, 0
STORE R0, COLLISION_BG_LAYER    ; 0 = layer 1, 1 = layer 2
LOAD R0, COLLISION_BG_RESULT

AND R0, PPU_COLLISION_BG_BOTTOM
JNZ ON_GROUND
```

| Constant | Meaning |
|---|---|
| `PPU_COLLISION_BG_BOTTOM` | Something opaque directly below the sprite |
| `PPU_COLLISION_BG_TOP` | Directly above |
| `PPU_COLLISION_BG_LEFT` | Directly to the left |
| `PPU_COLLISION_BG_RIGHT` | Directly to the right |

Bits can combine (e.g. touching the ground *and* a wall at the same
time sets both `BOTTOM` and `LEFT`/`RIGHT`). A sprite that's fully
off-screen on a given side reads as not-touching on that side (there's
nothing on-screen to probe against).

## 9. The built-in font

The engine preloads a full 95-character printable ASCII bitmap font
(`0x20`–`0x7E` — digits, letters, punctuation) into the **last 96 tile
slots** of the tileset (`VRAM_FONT_TILE_BASE` = `928` onward), every
Reset — so tile `0` stays free for your own graphics.

```
TileIndex = VRAM_FONT_TILE_BASE + (AsciiCode - VRAM_FONT_ASCII_START)
```

This is what Text Mode uses automatically — but you can also reference
these tiles directly from a PPU tilemap if you want text rendered with
full tile-attribute control (custom palette group, flipping, etc.),
which Text Mode doesn't offer.

## 10. Worked example: a platformer floor with a falling sprite

Puts together tiles, palette, sprites, and background collision — a
sprite falls until it lands on solid ground:

```asm
JMP MAIN
MAIN:
    MOV R0, VIDEO_MODE_PPU
    STORE R0, VIDEO_MODE

    ; palette: index 1 = floor, index 2 = player (see the full example:
    ; test_ppu_bg_collision.asm)
    ; ... set up tile 1 (floor, solid) and tile 2 (player, solid) ...
    ; ... fill rows 20-24 of the tilemap with tile 1 ...
    ; ... create sprite 0 at (150, 20), 8x8, tile 2 ...

FALL_LOOP:
    ; ... wait for the next frame (FRAME_COUNT_LO) ...

    MOV R0, 0
    STORE R0, COLLISION_BG_SPRITE
    MOV R0, 0
    STORE R0, COLLISION_BG_LAYER
    LOAD R0, COLLISION_BG_RESULT
    AND R0, PPU_COLLISION_BG_BOTTOM
    JNZ LANDED

    ; still nothing below - keep falling (Y += 1, update VRAM_DATA)

    JMP FALL_LOOP
LANDED:
    HLT
```

See `test_ppu_bg_collision.asm` for the complete, runnable version.

## 11. Current limitations

- No sprite/sprite pixel-perfect collision (only AABB bounding boxes).
- `PPU_SPRITE_PRIORITY_BEHIND_BG` doesn't distinguish which layer a
  sprite hides behind — it hides behind *either* layer's opaque
  pixels, not one specifically.
- Sprite draw order (which sprite wins when two overlap) is fixed by
  index — no separate priority-between-sprites register.
- Sprite Y is unsigned (a sprite can't enter from the top edge; `Y >= 200`
  means hidden). Only X is signed.
- Sprite blend is a fixed 50/50 average — no other blend ratios or
  additive/subtractive modes.
- Line scroll is horizontal only, and the affine layer exists only on
  layer 2 (with no scrolling of its own besides its table).
