# Hệ Thống Tự Động Hóa Tạo Mục Lục & Đánh Số Trang Tài Liệu (VI/EN)

Công cụ CLI bằng Python tự động nhận diện cấu trúc đề mục (Tiếng Việt & Tiếng Anh), ghép dòng tiêu đề bị ngắt, tạo trang Mục lục chuẩn (`Times New Roman`, `13-14pt`, chấm bi `Tab Leader` căn lề phải số trang), đánh số trang tự động và xuất tệp phục vụ in ấn cho cả tài liệu **Word (`.doc`, `.docx`)** lẫn **PDF (`.pdf`)**.

---

## 1. Cấu trúc Dự án

```text
doc_toc_automator/
├── main.py                 # Entry point (CLI nhận tham số file hoặc folder)
├── config.py               # Cấu hình Regex đa ngôn ngữ, font, kích thước lề
├── processors/
│   ├── word_processor.py   # Xử lý Luồng A (.doc/.docx)
│   ├── pdf_processor.py    # Xử lý Luồng B (.pdf)
│   └── toc_builder.py      # Tạo file [Mục Lục] *.docx chuẩn Tab Leader
├── utils/
│   ├── office_bridge.py    # Cầu nối MS Word COM / LibreOffice để convert & update TOC
│   └── heading_parser.py   # Bộ phân tích & ghép dòng tiêu đề thông minh (VI/EN)
├── requirements.txt
└── README.md
```

---

## 2. Hướng dẫn Cài đặt

### Yêu cầu hệ thống
* **Python:** 3.10 trở lên.
* **Trình kết xuất Office (khuyên dùng):**
  * Trên Windows: Cài đặt **Microsoft Word** (để `pywin32` gọi COM tự động cập nhật `Fields.Update()` và xuất PDF chính xác tuyệt đối).
  * Đa nền tảng (Linux/macOS/Windows): Hỗ trợ **LibreOffice** (`soffice --headless`) hoặc bộ dựng PDF dự phòng tích hợp sẵn bằng `PyMuPDF`.

### Cài đặt thư viện
```powershell
# 1. Di chuyển vào thư mục dự án
cd doc_toc_automator

# 2. Tạo môi trường ảo (Virtual Environment)
python -m venv .venv

# 3. Kích hoạt môi trường ảo (Windows PowerShell)
.\.venv\Scripts\Activate.ps1

# 4. Cài đặt các thư viện trong requirements.txt
.\.venv\Scripts\pip install -r requirements.txt
```

---

## 3. Hướng dẫn Sử dụng CLI

### 3.1. Xử lý 1 tệp tin đơn lẻ

**Ví dụ với tệp Word (`.doc` hoặc `.docx` - Luồng A):**
```powershell
python main.py "C:\Duong_Dan\Hiến pháp 2013.docx"
```
*Đầu ra tự động sinh ra tại cùng thư mục:*
1. `Hiến pháp 2013_muc_luc.docx` (Đã chèn Mục lục tự động ở Trang 1, đánh số trang giữa chân trang từ 1).
2. `Hiến pháp 2013 (in ấn).pdf` (Bản PDF hoàn chỉnh đã cập nhật số trang mục lục).

**Ví dụ với tệp PDF (`.pdf` - Luồng B):**
```powershell
python main.py "C:\Duong_Dan\21_QD-VKSTC_553974.pdf"
```
*Đầu ra tự động sinh ra tại cùng thư mục:*
1. `[Mục Lục] 21_QD-VKSTC_553974.docx` (Tệp Word mục lục rời định dạng Tab Leader chấm bi để dễ chỉnh sửa thủ công nếu cần).
2. `[Mục Lục] 21_QD-VKSTC_553974.pdf` (Tệp PDF mục lục rời).
3. `21_QD-VKSTC_553974 (in ấn).pdf` (Tệp PDF gộp hoàn chỉnh gồm Mục lục ở đầu + Nội dung gốc giữ nguyên 100% chữ ký/con dấu đỏ).

### 3.2. Xử lý hàng loạt cho cả thư mục (Batch Processing)

```powershell
# Quét toàn bộ file .doc, .docx, .pdf trong thư mục
python main.py "C:\Duong_Dan\Thu_Muc_Tai_Lieu"

# Quét đệ quy cả các thư mục con (-r) và xuất kết quả ra thư mục riêng (-o)
python main.py "C:\Duong_Dan\Thu_Muc_Tai_Lieu" -r -o "C:\Duong_Dan\Ket_Qua_In_An"
```
*(Lưu ý: Hệ thống tự động nhận diện và bỏ qua các tệp đầu ra có tiền tố `[Mục Lục]` hoặc hậu tố `_muc_luc.docx`, `(in ấn).pdf` để không xử lý trùng lặp).*
