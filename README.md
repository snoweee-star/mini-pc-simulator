# Bitdesk Native

Trình mô phỏng máy tính 16-bit chạy ngoại tuyến trên Android. Bạn viết chương trình assembly, chạy từng lệnh, xem thanh ghi và bộ nhớ thay đổi, rồi điều khiển các thiết bị giả lập như màn hình, âm thanh, robot và thế giới voxel ngay trên điện thoại.

> **Ghi chú cho người xem trên GitHub**
>
> - Đây là **project cá nhân để học tập**: học Java, Android và kiến trúc máy tính / assembly.
> - **Không có mục đích thương mại.** Sản phẩm không được bán, không chạy quảng cáo, không thu phí dưới bất kỳ hình thức nào.
> - Project được **đồng phát triển cùng [Claude](https://claude.com/claude-code)** (Anthropic). Claude đóng vai senior developer, gợi ý và review. Phần lớn code chính do mình tự viết để học.
> - Ý tưởng và hành vi máy ảo được tham khảo từ trò chơi lập trình assembly PlayASM. Mọi quyền với trò chơi gốc và tài liệu của nó thuộc về tác giả gốc.

## Trạng thái

🚧 Đang phát triển theo từng bước nhỏ. Kế hoạch nằm trong [docs/PLAN.md](docs/PLAN.md), tiến độ trong [docs/PROGRESS.md](docs/PROGRESS.md), mức tương thích với bản gốc trong [docs/parity.md](docs/parity.md).

## Mục tiêu

- CPU 16-bit với 47 lệnh, cờ Z/C/N/O, stack, ngắt và bank bộ nhớ.
- Assembler hai lượt, báo lỗi theo dòng, hỗ trợ `.DB`, `.DW`, `.DS`, `.BANK` và tệp PBIN.
- Debugger: chạy, tạm dừng, chạy từng bước, breakpoint, xem và sửa RAM.
- Thiết bị: timer/RTC, DMA, màn hình text 40×25, PPU tile/sprite, VDP framebuffer, PC speaker, chiptune, robot arm, voxel sandbox.
- Hệ thống nhiệm vụ có chấm điểm và lưu tiến trình.
- 100% native, chạy ngoại tuyến: **không WebView, không JavaScript, không cần mạng**.

## Công nghệ

| Phần | Lựa chọn |
|---|---|
| Ngôn ngữ | Java 17 |
| Giao diện | Android View, Canvas/Bitmap, AudioTrack |
| Build | Gradle, gồm module `:core` (Java thuần) và `:app` (Android) |
| Test | JUnit 5 |
| Android tối thiểu | 8.0 (API 26) |

## Build

Phần này sẽ được bổ sung khi xong bước 0.4. Dự kiến:

```powershell
.\gradlew.bat :core:test :app:assembleDebug
```

## Ví dụ: vòng lặp tính tổng

```asm
MOV R0, 0
MOV R1, 4
loop:
    ADD R0, R1
    DEC R1
    CMP R1, 0
    JNZ loop
HLT        ; R0 = 10
```

## Giấy phép

Mã nguồn trong repo này chỉ dùng cho mục đích học tập cá nhân. Tài liệu và tài nguyên của trò chơi gốc không thuộc phạm vi giấy phép của project này.


## From snoweee:

Hãy mua game ủng hộ tác giả nếu bạn thích khoa học máy tính và lập trình giống mình
https://store.steampowered.com/app/5424530/PlayASM/
