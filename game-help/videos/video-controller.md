# Video Controller & VRAM User Manual

This document covers the shared foundation used by every video mode
(PPU, Text, VDP): the external VRAM and the port used to access it. For
mode-specific details, see the PPU, Text Mode, and VDP manuals.

## 1. VRAM is a separate memory space

The 64KB VRAM is **not** mapped anywhere in the CPU's own memory (the
`0x0000`–`0xFFFF` range you already know — program, work RAM, I/O). It's
a second, independent `65536`-byte space, reachable only through a
2-register port living in the CPU's memory map:

| Register | Address | Access | Purpose |
|---|---|---|---|
| `VIDEO_MODE` | `0xC100` | RW | `0`=TEXT (default), `1`=PPU, `2`=VDP |
| `VRAM_ADDR` | `0xC102` | RW | Current read/write pointer *inside* VRAM |
| `VRAM_DATA` | `0xC104` | RW (port) | Reading/writing here touches VRAM at `VRAM_ADDR`, and auto-advances the pointer |

```asm
MOV R0, 0x8000
STORE R0, VRAM_ADDR      ; "point at VRAM offset 0x8000"
MOV R1, 0x1234
STORE R1, VRAM_DATA      ; writes 0x1234 into VRAM[0x8000..0x8001], VRAM_ADDR becomes 0x8002
```

**A single `STORE` like this is not actually guaranteed to work by
itself.** Outside of VDP mode, writes to `VRAM_DATA` are only accepted
during a short window after each vblank (~2ms, roughly 60 times a
second) — a short program like this one runs in a fraction of a
millisecond, almost certainly outside that window, so the write above
gets silently ignored (and `VRAM_ADDR` never advances either, since
that happens as part of the same gated write). **See §3 below for
exactly why, and the retry-loop pattern every real program actually
uses.** The snippet above is only meant to show the *shape* of the
port — copy the retry version from §3, not this one.

## 2. Word access vs. byte access

Both work, and both auto-increment — just by a different amount:

| Instruction | Touches | `VRAM_ADDR` advances by |
|---|---|---|
| `STORE`/`LOAD` | 1 word (2 bytes) | 2 |
| `STOREB`/`LOADB` | 1 byte | 1 |

```asm
STOREB R2, VRAM_DATA     ; writes 1 byte, VRAM_ADDR += 1 - useful for framebuffer pixels (VDP)
STORE  R1, VRAM_DATA     ; writes 1 word, VRAM_ADDR += 2 - useful for tilemap cells (PPU)
```

Reading works the same way, in reverse:

```asm
LOADB R3, VRAM_DATA      ; reads 1 byte from VRAM at VRAM_ADDR, advances by 1
```

## 3. The vblank restriction — and when it doesn't apply

Writes to `VRAM_DATA` are normally restricted to a short window right
after each VBlank (~2ms), same reasoning as real hardware: writing VRAM
while it's being displayed can show a half-updated frame. Outside that
window, a write is **silently ignored** — the classic pattern is to
retry until it "sticks":

```asm
RETRY:
    STORE R3, VRAM_ADDR
    STORE R1, VRAM_DATA
    STORE R3, VRAM_ADDR
    LOAD  R0, VRAM_DATA
    CMP   R0, R1
    JNZ   RETRY
```

**Exception: in VDP mode (`VIDEO_MODE` = `2`), this restriction is
lifted entirely.** A raw framebuffer needs to be redrawn every single
frame, so gating every pixel write behind a 2ms window would make VDP
mode impractical. Writes and reads in VDP mode always succeed
immediately, no retry loop needed. See the DMA Controller manual — the
same rule applies there too, for VRAM-destination transfers.

**Reads are never restricted**, in any mode — reading doesn't affect
what's on screen, only writing can.

## 4. Other video registers

Registers added to the video block (details in the manual of each mode):

| Register | Address | Mode | Purpose |
|---|---|---|---|
| `VDP_CTRL` | `0xC12A` | VDP | bit 0 = double buffer (VDP manual §7) |
| `VDP_PRESENT` | `0xC12C` | VDP | publish the back buffer to the screen |
| `LINE_SCROLL_CTRL` | `0xC12E` | PPU | per-scanline scroll tables, bit 0 = layer 1, bit 1 = layer 2 (PPU manual §5.1) |
| `AFFINE_CTRL` | `0xC130` | PPU | bit 0 = affine (Mode 7) layer 2 (PPU manual §5.2) |

## 5. Where to go next

- **PPU manual** — tiles, sprites (signed X, blending), scrolling,
  per-line scroll, the affine layer, the built-in font.
- **Text Mode manual** — the cursor/teletype port, keyboard-to-text input.
- **DMA Controller manual** — bulk transfers and fast fills, including
  2D rectangles/columns and colour-key transparency (`SKIP_ZERO`).
- **VDP manual** — the raw framebuffer mode, with optional double buffer.
