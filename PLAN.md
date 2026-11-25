# Bitdesk Native — Kế hoạch theo bước nhỏ (Java)

Nguồn yêu cầu: kế hoạch bàn giao gốc (M0–M6). Bản này thay **Kotlin → Java 17**, **Compose → Android View/Canvas**,
và chia mỗi mốc thành các bước nhỏ; **mỗi bước = 1 phiên Claude** (mở phiên mới, đọc `PROGRESS.md` + đúng file `spec/` cần).

## Quyết định kỹ thuật

| Mục | Chọn | Lý do |
|---|---|---|
| Ngôn ngữ | Java 17 (records, switch expression, text block) | Học Java; Android hỗ trợ qua desugaring |
| UI | Android View + XML layout + `Canvas`/`Bitmap` | Compose chỉ dùng được với Kotlin |
| Trạng thái khi xoay màn hình | `androidx.lifecycle.ViewModel` (Java) | Giữ máy, mã, PC |
| Build | Gradle Wrapper + AGP, 2 module `:core` (java-library) và `:app` | Theo kế hoạch gốc; Java-only nên ít xung đột phiên bản |
| JDK cho Gradle | JBR của Android Studio (`openjdk 25`). Nếu Gradle chưa hỗ trợ thì cài JDK 21 | JDK 27 mặc định quá mới |
| Test | JUnit 5 cho `:core`; instrumented test ít, chỉ ở M6 | Lõi test nhanh trên máy tính |
| Tham chiếu | `../old-source/Bitdesk-Android/` (đã giải nén, chỉ đọc) | Không đọc lại JS: dùng `spec/` |
| minSdk / applicationId | 26 / `dev.bitdesk.nativeapp.dev` | Cài song song bản cũ |

## Quy tắc tiết kiệm token
1. Mỗi phiên chỉ làm **1 bước** dưới đây; cuối phiên cập nhật `PROGRESS.md` (≤10 dòng mỗi bước).
2. Chỉ đọc JS gốc ở **bước 0.2–0.3**; sau đó đọc `spec/*.md`.
3. Build/test với `-q`; chỉ đọc phần lỗi.
4. Cách làm việc senior–junior (xem `CLAUDE.md`): bạn code, Claude hint theo bậc và review. Nhãn **[Bạn viết]** đánh dấu bước nên tự viết gần như 100%; các bước khác Claude có thể viết hạ tầng (Gradle, script, spec).
5. Dùng Sonnet cho bước lặp (opcode, thiết bị); Opus cho bước thiết kế (0.4, 1.3, 3.1, 4.6).

## M0 — Chuẩn và project
- [x] **0.1** Chạy `node verify-media.cjs`, `verify-actors.cjs` trên bản tham chiếu, ghi kết quả vào `docs/parity.md`. `git init`.
- [ ] **0.2** Đọc `assembler.js` + `cpu.js` một lần → `spec/isa.md` (47 opcode: mã, toán hạng, cờ từng lệnh; cú pháp; mã hóa 6 byte; PBIN; chỗ chưa rõ như indexed).
- [ ] **0.3** Đọc `devices.js`, `media.js`, `world.js`, `mod-device.js` → `spec/mmio.md`, `spec/media.md`, `spec/world.md`. Script `tools/reference/export-campaign.cjs` xuất 177 nhiệm vụ/307 điều kiện → `app/src/main/assets/campaign.json` (+ `lessons.json`).
- [ ] **0.4** Gradle Wrapper, `:core` + `:app` rỗng (Activity "Hello"), `gradlew.bat :core:test :app:assembleDebug` chạy được. `tools/reference/trace.cjs` tạo trace JSON từng bước cho bài tổng → `fixtures/sum4.trace.json`.

## M1 — Vòng lặp tính tổng trên điện thoại
- [ ] **1.1** **[Bạn viết]** Lexer + assembler 2 lượt cho `MOV ADD DEC CMP JNZ HLT`, số dec/hex/bin, nhãn, comment; lỗi có số dòng (`R16`).
- [ ] **1.2** `Cpu`, `Bus`, `Machine.step()` cho 6 lệnh; test khớp trace: R0 = 4,7,9,10; R0=0x000A, SP=0x8000, 19 lệnh; đầu vào 5 → 15.
- [ ] **1.3** Luồng máy + hàng đợi lệnh (run/pause/step/reset), `snapshot()`; ViewModel.
- [ ] **1.4** Màn hình dọc: editor, nút, dòng đang chạy, bảng thanh ghi HEX/DEC/BIN (4 nhóm 4 bit), giữ khi xoay. Cài APK lên máy, sửa 4→5 chạy lại.

## M2 — Đủ tập lệnh và debugger
- [ ] **2.1** **[Bạn viết]** Chuyển dữ liệu + số học (ADD/SUB/MUL/DIV…): kết quả + cờ, test `0x7FFF+1`, `0xFFFF+1`, chia 0.
- [ ] **2.2** **[Bạn viết]** Logic, dịch, quay qua carry.
- [ ] **2.3** Nhảy có/không dấu (test cả nhảy và đi tiếp).
- [ ] **2.4** Stack, CALL/RET (khôi phục bank), INT/IRET, WAIT.
- [ ] **2.5** `.DB .DW .DS .BANK`, chuỗi, nhãn tiến/lùi, con trỏ, indexed, kiểm biên.
- [ ] **2.6** PBIN đọc/ghi + kiểm lỗi; mở/lưu tệp qua Storage Access Framework.
- [ ] **2.7** Breakpoint theo (bank, địa chỉ), nhật ký hữu hạn, xem/sửa RAM khi tạm dừng.

## M3 — Thiết bị nền
- [ ] **3.1** `Mmio` hằng số dùng chung; RAM 64 KiB, cửa sổ bank 0x4000–0x7FFF; `peek` không side-effect.
- [ ] **3.2** Đồng hồ giả/đơn điệu, timer, RTC, VBlank, bộ ngắt; test WAIT→IRQ→IRET.
- [ ] **3.3** DMA 1D/2D, stride, bỏ byte 0, trì hoãn.
- [ ] **3.4** Màn hình text 40×25 (con trỏ, màu, xuống dòng, backspace, cuộn) + View hiển thị; test `HELLO`.
- [ ] **3.5** Bàn phím: giữ phím/cạnh/FIFO; phím cứng, phím cảm ứng, ô nhập.

## M4 — Video, âm thanh, vòng đời
- [ ] **4.1** Framebuffer 320×200 → `Bitmap`, phóng nguyên lần; hash khung hình trong test.
- [ ] **4.2** PPU tile/sprite, palette, va chạm sprite, double buffer.
- [ ] **4.3** VDP framebuffer.
- [ ] **4.4** PC speaker → PCM → `AudioTrack` trên luồng riêng; test 440 Hz.
- [ ] **4.5** Chiptune + sequencer (pan, gate).
- [ ] **4.6** Tách tốc độ CPU/thiết bị/UI, chạy theo lô; vòng đời nền/xoay/bàn phím; tắt tiếng khi ra nền.

## M5 — Robot, voxel, nhiệm vụ, mod
- [ ] **5.1** Đọc `campaign.json`, bộ chấm Java; test mỗi loại điều kiện đạt/trượt.
- [ ] **5.2** Màn hình danh sách nhiệm vụ, chấm, lưu tiến trình (SharedPreferences/JSON), nhập tệp khởi đầu (kiểm SHA-256 PBIN).
- [ ] **5.3** Robot: khớp, trigger, cảm biến, kẹp/thả, băng chuyền + view; bài gắp→chuyển băng B→đếm 1.
- [ ] **5.4** Voxel 1: thế giới trong bank, tạo/truy vấn khối, va chạm, trọng lực, FIFO sự kiện.
- [ ] **5.5** Voxel 2: cát/nước, mạch tín hiệu, cây trồng, actor; seed cố định.
- [ ] **5.6** Mod JSON: 3 khe, RAM riêng, widget cảm ứng; bài trao đổi byte với ASM.
- [ ] **5.7** (Tùy chọn) Lua callback qua thư viện native, có giới hạn thời gian/bộ nhớ.

## M6 — Bàn giao
- [ ] **6.1** Build sạch từ ZIP mới; `connectedDebugAndroidTest` trên emulator; kiểm manifest không có quyền mạng/WebView.
- [ ] **6.2** Ký release (khóa ngoài repo), `apksigner verify`, ZIP nguồn, SHA-256, `README.vi.md` hướng dẫn build.
