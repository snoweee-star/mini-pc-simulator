# Bảng tương thích (parity)

Nguồn tham chiếu: `../old-source/Bitdesk-Android/` — ZIP SHA-256 `5B58525476C8CF00CE1139707E9F04F360CA85F57EAB2CF961EE7A357E126205`.
Môi trường đối chiếu (2026-11-25): Node v26.13.1, Windows 11.

Nguồn bằng chứng: **D** = tài liệu/README, **B** = hành vi Bitdesk JS (có test), **W** = đã quan sát trong PlayASM Windows.

## Kết quả bộ kiểm tra gốc (bước 0.1)

| Script | Kết quả | Nội dung kiểm |
|---|---|---|
| `verify-media.cjs` | PASS (exit 0) | VDP (ghi pixel từ ASM, tăng/quay vòng VRAM_ADDR, RGB, double buffer, brightness); PPU (vblank, tile map, RGB555, backdrop, sprite, va chạm sprite/sprite và nền, scroll); TEXT (glyph dùng chung, font tùy biến); Audio (vuông 440 Hz, câm ở Nyquist, câm khi HLT/pause, tam giác có pan, sequencer); Robot (chuyển động 300 decidegree/s, status, giới hạn tốc độ); Voxel (lưu trong bank, fill/line/sphere, truy vấn) |
| `verify-actors.cjs` | PASS (exit 0) | Actor: chặn bởi tường/actor, trọng lực 1 ô/khung, actorAt, nearest Manhattan, IRQ/FIFO theo cạnh, metadata cần gạt, walkable, LOS, đào/đặt khối |

→ Hai script này sẽ được port thành JUnit (`MediaParityTest`, `ActorParityTest`) ở M4/M5 — cùng giá trị assert.

## Bảng tính năng

| Nhóm | Bằng chứng | Test | JVM | Android | Sai khác / chưa xác minh |
|---|---|---|---|---|---|
| Assembler cơ bản | D, B | — | ⬜ | ⬜ | |
| 47 opcode + cờ | B | — | ⬜ | ⬜ | Mã hóa địa chỉ indexed chưa xác minh với W |
| Bank / stack / ngắt | B | — | ⬜ | ⬜ | |
| MMIO, timer, RTC, DMA | B | — | ⬜ | ⬜ | Thời gian ngoại vi chưa đối chiếu W |
| Text 40×25, bàn phím | B | verify-media (TEXT) | ⬜ | ⬜ | |
| PPU / VDP | B | verify-media | ⬜ | ⬜ | |
| Âm thanh PCM | B | verify-media | ⬜ | ⬜ | |
| Robot | B | verify-media | ⬜ | ⬜ | README: tham số vật lý là giá trị mô phỏng riêng |
| Voxel / actor | B | verify-media, verify-actors | ⬜ | ⬜ | Như trên |
| Nhiệm vụ (177 / 307 điều kiện) | B | — | ⬜ | ⬜ | 29 ASM + 10 PBIN khởi đầu không có trong ZIP |
| Mod JSON | B | — | ⬜ | ⬜ | Bản gốc chưa có cầu nối Lua |
