# How to Use the Simulator

This manual assumes you already know how to write assembly for this
machine (if you don't yet, see the **Instruction Set** manual first). It
covers the app itself: where you write code, how to run it, and what
each window shows you.

## Writing Your Program: The Code Editor

The **Code Editor** window is where you write your assembly source
code — plain text, one instruction per line. It behaves like a real code
editor: you can click into the gutter next to any line to toggle a
**breakpoint** there, which pauses execution automatically the moment
the CPU reaches that line, so you can inspect registers and memory
before deciding whether to step forward or keep running.

## Turning Code Into a Running Program: Assemble & Load

Once your program is written, press **Assemble & Load**. This runs your
source through the assembler, which translates it into raw bytecode —
the actual binary instructions the CPU executes — and loads that
bytecode into memory.

If there's a problem with your source (a typo, an unknown label, invalid
syntax), the editor will tell you what's wrong instead of loading
anything. If assembly succeeds, the bytecode is in memory and you're
ready to run.

## Running the Simulation

The **execution controls**, at the bottom of the screen, are how you
actually run your program:

- **Run / Pause / Resume** — starts execution. While running, the same
  button pauses it; while paused, it resumes from exactly where it left
  off (not from the beginning).
- **Step** — executes exactly one instruction and stops. This is the
  single most useful tool for understanding *why* a program isn't doing
  what you expected — you can watch every register and every flag
  change, one instruction at a time.
- **Reset** — stops execution and returns the whole machine (registers,
  flags, memory, every device) to its startup state.
- The **speed slider** controls how fast the simulation runs once
  you press Run — anywhere from watching individual instructions
  execute at a readable pace, up to running as fast as the simulator
  can go.

## Loading a Different Program

The simulator doesn't erase the previous program on its own just because
you've edited the Code Editor's text — it keeps running whatever
bytecode was last assembled and loaded. To load a *new* version of your
program (after editing it), you need to:

1. Press **Reset**, to stop execution and clear the machine's state.
2. Press **Assemble & Load** again, to re-translate your (edited) source
   and load the new bytecode.

Skipping the Reset step is the single most common source of "why isn't
my change doing anything?" confusion — if you edit code and just press
Run again, you're running the *old* bytecode, not your new edit.

## Watching the Machine Think: Register Bank & Memory View

Two windows exist purely so you can *see* what's happening inside the
machine as your program runs:

- **Register Bank** shows every register's current value, live,
  updating in real time as instructions execute.
- **Memory View** shows the CPU's memory as a grid of bytes. You can
  browse by region, or jump straight to a specific address — useful when
  you know exactly which byte you're trying to inspect (for example, a
  particular device register, or a variable your program is using).

Between Step, breakpoints, and these two windows, you have everything
you need to find out exactly why a program is behaving the way it is,
one instruction at a time.

## Seeing What Your Program Draws: Video Output & VRAM View

The **Video Output** window is the simulated screen itself — whatever
your program draws (text, tiles, sprites, or raw pixels, depending on
which video mode you use) shows up there. It's also where simulated
keyboard input is read from, so click into that window before pressing
keys your program is meant to respond to.

**VRAM View** is a lower-level companion to it: a byte-by-byte look at
video memory itself, separate from the CPU's own memory. It's most
useful when you're debugging exactly what your program wrote into VRAM,
rather than just watching the rendered result.

## When a Device Needs Your Attention

Every device in this machine — Video Output, the Robot Arm, and others
as they get their own window — has a button in the sidebar. If your
program interacts with a device while its window happens to be closed,
that device's sidebar button will **blink orange** for a few seconds and
then stay lit, as a signal that something happened there worth checking
out. Opening the window (or pressing Reset) clears it. This means you
never have to guess whether a program "did something" with a device you
weren't watching — the sidebar will tell you.

## Where to Go Next

This covers the app itself — writing, assembling, running, and
inspecting a program. For the actual instruction set (every opcode,
every addressing mode, worked examples), see the **Instruction Set**
manual. For what each individual device does and which memory addresses
control it, see that device's own manual under its category below.
