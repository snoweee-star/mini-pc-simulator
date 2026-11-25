# Tiến độ

## 0.1 — Chuẩn tham chiếu + git (2026-11-25)
- Tham chiếu thật nằm ở `../old-source/Bitdesk-Android/` (đã sửa đường dẫn trong PLAN/CLAUDE).
- `node verify-media.cjs` và `node verify-actors.cjs`: cả hai PASS → ghi trong `docs/parity.md`.
- Hai script này sẽ thành JUnit parity test ở M4/M5.
- `git init` (nhánh `main`) + `.gitignore` (loại build/, local.properties, khóa ký).
- Claude viết: parity.md, .gitignore. Người dùng: commit đầu tiên.
- Học/ôn: `.gitignore` dùng để làm gì; vì sao không commit khóa ký và `local.properties`.

## Bổ sung sau 0.1 — manual game gốc
- Người dùng thêm `game-help/` (manual chính thức: ISA, bank, DMA, timing, io, video, audio, robot, voxel).
- PLAN.md: thêm bảng "Tài liệu cần đọc" theo bước; 0.2/0.3 lấy từ manual trước, JS chỉ grep.
- Quy tắc: manual khác JS → theo manual + test + ghi parity.md.
- Gợi ý: thêm `.openidea/` vào `.gitignore` nếu không muốn commit cấu hình IDE.
