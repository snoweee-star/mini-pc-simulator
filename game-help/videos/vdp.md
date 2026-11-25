# VDP (Raw Framebuffer) User Manual

`VIDEO_MODE = 2` (`VIDEO_MODE_VDP`). No tiles, no sprites, no palette
groups — just a flat grid of pixels, one byte each, indexing directly
into a 256-color palette. This is the same idea as classic VGA "Mode
13h" (320×200, 8 bits per pixel), the mode most DOS-era games used for
anything drawn pixel-by-pixel rather than tile-by-tile (Doom included).

See the Video Controller manual for the `VRAM_ADDR`/`VRAM_DATA` port
itself, and the DMA Controller manual for bulk fills, blits (2D mode,
colour-key transparency) and column fills. §7 covers the optional
double buffer.

## 1. VRAM layout in VDP mode

| Region | Offset (inside VRAM) | Size |
|---|---|---|
| `VDP_FRAMEBUFFER_BASE` | `0x0000` | 64,000 bytes — 320×200, 1 byte/pixel, row-major, no padding |
| `VDP_PALETTE_BASE` | `0xFA00` | 512 bytes — 256 colors × 2 bytes (RGB555) |

A pixel's VRAM offset is `Y * 320 + X`. The byte there is a palette
index (0–255) into `VDP_PALETTE_BASE` — same RGB555 format as the PPU's
palette (5 bits per channel), but a **separate, unrelated** region of
VRAM — setting up the PPU's palette does not affect VDP's, and vice
versa.

**Unlike Text/PPU mode, no default palette is preloaded for VDP.**
Every entry starts at `0x0000` (black) after Reset — your program needs
to set up whatever palette it wants before anything but black will show.

### 1.1 Clear the framebuffer before drawing anything

VDP shares the exact same physical VRAM as PPU/Text mode — switching
`VIDEO_MODE` never clears VRAM (by design: mode switches only change
how the *same* bytes are interpreted, matching real hardware). Since
the engine preloads the PPU/Text font into VRAM on every Reset (see the
PPU manual §6), and that font's bytes fall well inside the VDP
framebuffer's address range, **you will see leftover font-glyph bytes
as scattered colored pixels** until you overwrite that memory yourself.

This isn't a bug to work around — it's exactly how real VGA Mode 13h
programs had to operate too, and the fix is the same one they used:
**always clear the framebuffer as your very first VDP action**, before
setting up a palette or drawing anything meaningful. The DMA
Controller's fill mode makes this a single instruction — see §5.

## 2. No vblank restriction

Every other VRAM write in this simulator (PPU tilemap/tileset, DMA into
VRAM) is normally gated to a short window after each vblank, to avoid
showing a half-updated frame. **VDP mode is the one exception** — pixel
writes land immediately, any time. A raw framebuffer needs to be
redrawn in full, every frame, so gating individual pixel writes would
make real-time drawing impractical. This does mean some tearing is
possible if you redraw mid-frame, matching how real Mode 13h programs
actually behaved — most didn't bother synchronizing either.

## 3. Plotting a pixel

Compute the byte offset `Y * 320 + X`, point `VRAM_ADDR` at it, and
write one byte (exactly what a pixel is) with `STOREB`:

```asm
MOV R0, VDP_FRAMEBUFFER_BASE
MOV R2, Y
MOV R3, 320
MUL R2, R3              ; R2 = Y * 320
ADD R0, R2
ADD R0, X                ; R0 = VDP_FRAMEBUFFER_BASE + Y*320 + X
STORE R0, VRAM_ADDR
MOV R1, COLOR_INDEX
STOREB R1, VRAM_DATA
```

## 4. Setting up the palette

Same RGB555 packing as the PPU (see the PPU manual §4):

```asm
MOV R0, VDP_PALETTE_BASE
ADD R0, 2               ; palette index 1
STORE R0, VRAM_ADDR
MOV R1, 0x7C00            ; red
STORE R1, VRAM_DATA
```

## 5. Clearing the whole screen fast

Plotting 64,000 individual pixels with `STOREB` works, but the DMA
Controller's fill mode does it in one instruction — and per §1.1, doing
this **first**, before anything else, is required practice for VDP
programs, not just an optimization:

```asm
MOV R0, VIDEO_MODE_VDP
STORE R0, VIDEO_MODE

MOV R0, VDP_FRAMEBUFFER_BASE
STORE R0, DMA_DST
MOV R0, 0                      ; whatever palette index 0 ends up being (set it to black below)
STORE R0, DMA_SRC
MOV R0, 64000
STORE R0, DMA_LEN
MOV R0, DMA_MODE_FILL_VRAM
OR R0, DMA_CTRL_TRIGGER
STORE R0, DMA_CTRL

; only now set up the palette and start drawing
```

See the DMA manual §4 for the same example with more detail.

## 6. Brightness

`SCREEN_BRIGHTNESS` (see the PPU manual §4.3) applies to VDP output
too — same register, same effect, applied as a final pass over the
whole framebuffer.

## 7. Double buffering (optional)

By default you draw straight into the visible framebuffer, which can
tear or flicker if you redraw mid-frame. The optional **double buffer**
fixes that:

| Register | Address | Purpose |
|---|---|---|
| `VDP_CTRL` | `0xC12A` | bit 0 = `VDP_CTRL_DOUBLE_BUFFER` (default `0` = off) |
| `VDP_PRESENT` | `0xC12C` | write any value: publish the current VRAM contents to the screen |

With the bit set, the screen no longer shows live VRAM but a **front
copy**. You keep drawing into the normal framebuffer/palette addresses
(the "back buffer"), and when the frame is complete you write to
`VDP_PRESENT`: the framebuffer (64,000 bytes) **and the palette** (512
bytes) are copied atomically to the front copy. The viewer therefore
never sees a half-drawn frame.

- The first frame is shown automatically (an implicit present happens if
  no copy exists yet), so enabling the mode never shows a black screen.
- Turning the bit off returns to showing live VRAM.
- Because the palette is part of the snapshot, palette changes also only
  appear on `VDP_PRESENT` — handy for fades.
- The back buffer is **not** cleared by a present; it keeps the last
  frame, so redraw or clear it yourself each frame (DMA fill).
- A present is a snapshot copy, not a pointer swap — the 64 KB VRAM has
  no room for a second 64,000-byte framebuffer. It is free from the
  program's point of view (a single `STORE`).

```asm
MOV R0, VDP_CTRL_DOUBLE_BUFFER
STORE R0, VDP_CTRL            ; once, at startup

FRAME:
    ; 1) clear the back buffer (DMA FILL_VRAM, see §5)
    ; 2) draw the whole scene into VRAM as usual
    MOV R0, 1
    STORE R0, VDP_PRESENT     ; 3) show it
    JMP FRAME
```

## 8. Blitting with DMA

Sprites and textured columns can be copied into the framebuffer with the
DMA Controller's **2D mode** (rows of `DMA_WIDTH` bytes with
`DMA_DST_STRIDE = 320`) and `SKIP_ZERO` for colour-key transparency —
see the DMA manual §5 and §6 for the complete examples, including a
vertical wall-column fill that draws a raycaster column in one transfer.

## 9. Current limitations

- No hardware line-drawing or shape-fill primitives — lines and
  circles are software you write yourself. Rectangular fills and blits
  are covered by DMA (§8).
- Double buffering is a snapshot copy of the framebuffer and palette
  on `VDP_PRESENT`, not a page flip, and there is no vsync-wait
  built into it: present when you are done and pace your loop with
  `FRAME_COUNT_LO` if needed.
