# Basics — Welcome to the Machine

Somewhere underneath every game you've ever played, every website you've
ever opened, and every message you've ever sent, there's a machine doing
something almost absurdly simple, over and over, billions of times a
second: reading a number, deciding what it means, and doing what it says.

That's it. That's the whole secret. And in this simulator, you're about
to build that machine's programs yourself — one instruction at a time,
with nothing hidden and nothing automatic. No black boxes. You'll see
every register, every byte of memory, every decision the CPU makes,
exactly as it makes it.

By the time you're done with this manual, you'll understand what a
computer actually *is* underneath every abstraction ever built on top of
it. That's not a small thing to walk away with.

## What Is a Computer, Really?

Strip away the screen, the operating system, the apps — and a computer
is just two things working together: a small set of **registers** (fast
storage the CPU can act on instantly) and a much larger pool of
**memory** (slower, but with room for an entire program and all its
data). A **CPU** — the machine you're programming here — reads
instructions one at a time from memory, and each one tells it to do
something tiny: add two numbers, compare them, move a value, or jump
somewhere else in the program.

None of those steps are individually impressive. A calculator can add.
What makes a computer a *computer* is that it can look at the result of
one step and **decide**, on its own, what step to take next. That single
idea — decisions based on values it just computed — is the difference
between a calculator and everything else humanity has ever built out of
silicon.

## What Is This Simulator?

This is a complete, self-contained CPU — built from scratch, simulated
in software, with every part of it visible and inspectable while it
runs. It has its own instruction set (its own "vocabulary" of commands),
its own memory, its own registers, and a whole collection of simulated
devices hanging off of it: a screen, a robot arm, sound chips, a
keyboard, a clock. Real computers have all of this too — you're just
getting to see it happen instead of trusting that it does.

You're going to write real programs for it, in a real assembly
language — the same *kind* of language, at the same level of the stack,
that operating systems, game engines, and firmware are built on. Nothing
here is a toy simplification of how computers work. It's the real
mechanism, just built small enough to fully understand.

## Numbers the Machine Understands: Binary and Hexadecimal

Here's something worth sitting with: the CPU doesn't understand letters,
words, or decimal numbers the way you do. Every single thing it ever
touches — instructions, addresses, colors, characters — is, underneath,
nothing but a pattern of **bits**: switches that are either on (`1`) or
off (`0`).

A single bit isn't very expressive. But group 8 of them into a **byte**,
and you get 256 possible patterns — enough to represent any number from
0 to 255, or one character of text, or one pixel's worth of color index.
Group two bytes into a **word** (16 bits), and you get 65,536 possible
values — plenty to address every byte in this machine's entire memory
space at once.

Writing numbers in pure binary gets unwieldy fast (`0110000100101010`
is not fun to read), so programmers use **hexadecimal** — base 16 — as
a compact shorthand, where each hex digit represents exactly 4 bits.
You'll see hex constants everywhere in this simulator's registers and
memory addresses, written like `0xC104`. Learning to read hex fluently
is one of the most useful habits you'll build here — every memory
address, every register value, every color, all of it shows up in hex.

## The CPU's Short-Term Memory: The Register Bank

**Registers** are the handful of values the CPU keeps closest at hand —
its scratchpad. Instead of reaching into memory for every single
calculation (slow), the CPU loads a couple of values into registers,
operates on them directly (fast), and only writes the result back to
memory when it actually needs to. Almost everything a program does flows
through registers at some point.

The **Register Bank** window lets you watch these values change live,
in real time, as your program runs — which is one of the best ways to
actually *feel* what an instruction does, instead of just reading what
it's supposed to do.

## What Is Memory?

If registers are the CPU's scratchpad, **memory** is its filing
cabinet — much bigger, a little slower to access, and where your actual
program (as raw bytes) and its data both live. Every byte in memory has
its own numeric **address**, and the CPU's instructions constantly read
from and write to specific addresses — loading a value to work with,
storing a result, jumping to a new address to keep executing from there.

Some addresses in this machine aren't ordinary storage at all — they're
wired directly to a real device. Write to the right address, and you're
not just saving a number: you're telling the screen to draw a pixel, or
the robot arm to move a joint. This is called **memory-mapped I/O**, and
it's how every device manual in this Help section explains its own
piece of the machine.

## Decisions: How a Machine "Thinks"

Here's the part that turns a pile of arithmetic into something that
behaves intelligently: after almost every instruction, the CPU updates a
tiny set of **flags** — Zero, Carry, and so on — describing what just
happened to the result. Was it zero? Did it overflow?

Your program can then ask: *"if the last comparison came out zero, jump
back to the start of this loop — otherwise, keep going."* That's a
**conditional jump**, and it's the entire mechanism behind loops,
`if`-statements, and every other decision any program has ever made, in
any language, on any computer. There's no deeper magic underneath it.
Everything you've ever seen software "decide" reduces, eventually, to
exactly this: check a flag, jump or don't.

This idea — a machine that reads instructions one at a time, keeps a
small amount of internal state (registers and flags), and changes what
it does next based on that state — is the essence of what's called a
**Turing machine**, the theoretical model underneath every computer ever
built. You're not simulating a metaphor for one. You're operating one.

## Your Playground Starts Now

Everything in this machine — every register, every device, every byte
of memory — is yours to command, in full view, with nothing hidden. You
can draw to the screen pixel by pixel, choreograph a robot arm, compose
music on a chiptune synthesizer, build a text adventure, write a
scrolling shooter, or invent something nobody's tried yet on this
hardware. The instruction set doesn't care what you build with it.

This is a sandbox. The only real limit is your imagination — and maybe,
for now, how comfortable you are with hex numbers. That part's about to
change. Head to **How to Use the Simulator** next to get your first
program running, or go straight to the **Instruction Set** manual if
you're ready to start writing code right now.
