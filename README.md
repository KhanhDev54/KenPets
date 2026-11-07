# KenPets

KenPets là thú cưng nhỏ sống trên màn hình máy tính, nhắc bạn uống nước, uống thuốc và nghỉ ngơi. Pet có thể mang **chính khuôn mặt của bạn**: chọn thân bé trai, bé gái, mèo hoặc cún, tải ảnh mặt lên là xong.

Tác giả: **KenDev**. Dự án dựa trên [OpenPets](https://github.com/OpenPetsHQ/openpets) (giấy phép MIT); README gốc của OpenPets nằm ở [docs/OPENPETS_README.md](docs/OPENPETS_README.md).

## Có gì khác so với OpenPets

- **Tiếng Việt** cho menu khay, menu pet và các plugin nhắc nhở.
- Plugin **Nhắc uống thuốc** (`plugins/official/openpets.medicine-reminder`): đặt tên thuốc và giờ uống mỗi ngày (ví dụ `08:00, 20:00`), có nút "Uống rồi" / hoãn, nhắc lại liều bị lỡ khi mở máy.
- **Nhắc uống nước** và **chào sáng tối** được cài sẵn.
- **Xưởng Pet Mặt Mình** (`tools/pet-maker/index.html`): mở bằng Chrome/Edge, ghép ảnh mặt vào nhân vật, tải gói `.zip`, rồi trong app chọn **Pets → Import pet**.

## Chạy thử

Cần Node.js 20+ và Git.

```
git clone https://github.com/KhanhDev54/KenPets
cd KenPets
corepack enable
pnpm install
pnpm build
pnpm dev:desktop:plugins
```

Tạo bộ cài Windows: `pnpm package:desktop` (file nằm trong `apps/desktop/dist-electron/`).

## Giấy phép

MIT. Giữ nguyên dòng bản quyền OpenPets trong [LICENSE](LICENSE) khi phân phối lại.
