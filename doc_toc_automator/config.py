"""
Cấu hình hệ thống Tự động hóa Tạo Mục lục & Đánh số trang Tài liệu (VI/EN).
Bao gồm Regex đa ngôn ngữ, thông số font chữ, kích thước trang và vùng Header/Footer.
"""

import re
from dataclasses import dataclass
from typing import Pattern

# ==============================================================================
# 1. CẤU HÌNH FONT & ĐỊNH DẠNG TRANG MỤC LỤC (Mục 3.1)
# ==============================================================================
FONT_NAME: str = "Times New Roman"
TOC_TITLE_FONT_SIZE_PT: float = 14.0
TOC_LEVEL1_FONT_SIZE_PT: float = 13.5
TOC_LEVEL2_FONT_SIZE_PT: float = 13.0
BODY_DEFAULT_FONT_SIZE_PT: float = 13.0

# Kích thước trang chuẩn A4 và lề (đơn vị: Inches & Cm cho python-docx)
PAGE_WIDTH_CM: float = 21.0
PAGE_HEIGHT_CM: float = 29.7
MARGIN_TOP_CM: float = 2.0
MARGIN_BOTTOM_CM: float = 2.0
MARGIN_LEFT_CM: float = 3.0
MARGIN_RIGHT_CM: float = 2.0

# Độ rộng khả dụng của dòng văn bản = 21.0 - 3.0 - 2.0 = 16.0 cm
CONTENT_WIDTH_CM: float = PAGE_WIDTH_CM - MARGIN_LEFT_CM - MARGIN_RIGHT_CM
# Khoảng lùi bên phải cho chữ khi đề mục dài (để số trang tách biệt rõ ở lề phải)
TOC_TEXT_RIGHT_INDENT_CM: float = 1.2
TOC_LEVEL2_LEFT_INDENT_CM: float = 0.6

# ==============================================================================
# 2. CẤU HÌNH REGEX NHẬN DIỆN ĐỀ MỤC ĐA NGÔN NGỮ (Mục 3.2)
# ==============================================================================
# Cấp 1 (Level 1):
# - Tiếng Việt: ^(LỜI NÓI ĐẦU|QUYẾT ĐỊNH|PHẦN\s+[IVXLCDM\d]+|CHƯƠNG\s+[IVXLCDM\d]+)\b.*
# - Tiếng Anh:  ^(INTRODUCTION|PREFACE|PART\s+[IVXLCDM\d]+|CHAPTER\s+[IVXLCDM\d]+|CONCLUSION)\b.*
LEVEL_1_PATTERNS: list[Pattern[str]] = [
    re.compile(
        r"^(LỜI\s+NÓI\s+ĐẦU|QUYẾT\s+ĐỊNH|PHẦN\s+[IVXLCDM\d]+|CHƯƠNG\s+[IVXLCDM\d]+)(?:\b|[\s:.\-–—]).*",
        re.IGNORECASE | re.UNICODE,
    ),
    re.compile(
        r"^(INTRODUCTION|PREFACE|PART\s+[IVXLCDM\d]+|CHAPTER\s+[IVXLCDM\d]+|CONCLUSION)(?:\b|[\s:.\-–—]).*",
        re.IGNORECASE | re.UNICODE,
    ),
]

# Mẫu kiểm tra một dòng Cấp 1 chỉ chứa Tiền tố/Số hiệu và cần ghép với dòng tiêu đề kế tiếp
# Ví dụ: "CHƯƠNG I", "PHẦN II.", "CHAPTER 1:", "PART IV -"
LEVEL_1_PREFIX_ONLY_PATTERN: Pattern[str] = re.compile(
    r"^(?:PHẦN|CHƯƠNG|PART|CHAPTER)\s+[IVXLCDM\d]+\s*[:.\-–—]?\s*$",
    re.IGNORECASE | re.UNICODE,
)

# Cấp 2 (Level 2):
# - Tiếng Việt: ^(MỤC\s+\d+|ĐIỀU\s+\d+)\b.*
# - Tiếng Anh:  ^(SECTION\s+\d+|ARTICLE\s+\d+)\b.*
LEVEL_2_PATTERNS: list[Pattern[str]] = [
    re.compile(
        r"^(MỤC\s+[IVXLCDM\d]+|ĐIỀU\s+\d+)(?:\b|[\s:.\-–—]).*",
        re.IGNORECASE | re.UNICODE,
    ),
    re.compile(
        r"^(SECTION\s+[IVXLCDM\d]+|ARTICLE\s+\d+)(?:\b|[\s:.\-–—]).*",
        re.IGNORECASE | re.UNICODE,
    ),
]

# Mẫu kiểm tra một dòng Cấp 2 chỉ chứa Tiền tố/Số hiệu và cần ghép với dòng kế tiếp
# Ví dụ: "MỤC 1", "ĐIỀU 12.", "SECTION 2", "ARTICLE 5:"
LEVEL_2_PREFIX_ONLY_PATTERN: Pattern[str] = re.compile(
    r"^(?:MỤC|ĐIỀU|SECTION|ARTICLE)\s+[IVXLCDM\d]+\s*[:.\-–—]?\s*$",
    re.IGNORECASE | re.UNICODE,
)

# ==============================================================================
# 3. CẤU HÌNH QUÉT SỐ TRANG HEADER / FOOTER TRONG PDF (Mục 4 - Luồng B)
# ==============================================================================
# Tỷ lệ vùng đỉnh trang (Header) và chân trang (Footer) tính theo chiều cao trang PDF
HEADER_ZONE_RATIO: float = 0.09  # 9% đỉnh trang
FOOTER_ZONE_RATIO: float = 0.09  # 9% đáy trang

# Các mẫu nhận diện chuỗi số trang phổ biến ở Header/Footer:
# Ví dụ: "1", "- 1 -", "Trang 1", "Trang 1/10", "Page 2 of 15", "[3]"
PAGE_NUMBER_REGEXES: list[Pattern[str]] = [
    re.compile(r"^\s*[-–—\[\(]?\s*(\d{1,4})\s*[-–—\]\)]?\s*$"),
    re.compile(
        r"^\s*(?:trang|page|tr\.?|p\.?)\s*(\d{1,4})(?:\s*(?:/|of|-)\s*\d{1,4})?\s*$",
        re.IGNORECASE | re.UNICODE,
    ),
    re.compile(r"^\s*(\d{1,4})\s*/\s*\d{1,4}\s*$"),
]

# Cỡ chữ và vị trí vẽ số trang mới vào PDF (khi PDF chưa có số trang)
PDF_FOOTER_FONT_SIZE: float = 11.0
PDF_FOOTER_BOTTOM_OFFSET_PT: float = 28.0  # Cách mép dưới trang ~1cm (28pt)

# ==============================================================================
# 4. HẬU TỐ & TIỀN TỐ TỆP ĐẦU RA (Để loại trừ khi chạy Batch Folder)
# ==============================================================================
OUTPUT_PREFIXES: tuple[str, ...] = ("[Mục Lục] ",)
OUTPUT_SUFFIXES: tuple[str, ...] = ("_muc_luc.docx", " (in ấn).pdf")
SUPPORTED_EXTENSIONS: tuple[str, ...] = (".doc", ".docx", ".pdf")


@dataclass
class HeadingItem:
    """Cấu trúc lưu trữ một mục lục đã nhận diện."""

    level: int  # 1 hoặc 2
    title: str  # Tên đề mục đã chuẩn hóa và ghép dòng
    page_number: int  # Số trang hiển thị trên tài liệu
    paragraph_index: int = -1  # Vị trí đoạn văn trong Word (nếu là Luồng A)
    merged_next_index: int = -1  # Vị trí đoạn văn kế tiếp đã được ghép vào tiêu đề này
