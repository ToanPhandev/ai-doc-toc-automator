"""
Bộ Nhận diện Đề mục Thông minh (Smart Heading Detection) & Ghép dòng tiêu đề (Title Merging).
Áp dụng chiến lược 2 lớp (Mục 3.2):
- Lớp 1: Đọc trực tiếp từ Style Heading 1/2/3 (Word) hoặc PDF Bookmarks/Outlines (PDF).
- Lớp 2: Quét định dạng In đậm (Bold) hoặc Cỡ chữ lớn hơn nội dung thường + Regex đa ngôn ngữ (VI/EN).
"""

import re
from dataclasses import dataclass
from typing import Optional

from config import (
    BODY_DEFAULT_FONT_SIZE_PT,
    HeadingItem,
    LEVEL_1_PATTERNS,
    LEVEL_1_PREFIX_ONLY_PATTERN,
    LEVEL_2_PATTERNS,
    LEVEL_2_PREFIX_ONLY_PATTERN,
)


@dataclass
class CandidateBlock:
    """Khối văn bản thô trích xuất từ một đoạn Word hoặc một dòng/khối PDF."""

    text: str
    is_bold: bool
    font_size: float
    page_number: int = 1
    paragraph_index: int = -1
    style_level: Optional[int] = None  # 1, 2 nếu đã gắn sẵn style Heading


def clean_heading_text(text: str) -> str:
    """Loại bỏ khoảng trắng thừa, ký tự xuống dòng ẩn và chuẩn hóa chuỗi tiêu đề."""
    if not text:
        return ""
    cleaned = re.sub(r"[\r\n\t]+", " ", text)
    cleaned = re.sub(r"\s{2,}", " ", cleaned).strip()
    return cleaned


def match_regex_level(text: str) -> Optional[int]:
    """
    Kiểm tra chuỗi văn bản có khớp với Regex Cấp 1 hoặc Cấp 2 (VI/EN) hay không.
    Trả về 1, 2 hoặc None.
    """
    cleaned = clean_heading_text(text)
    if not cleaned:
        return None

    for pattern in LEVEL_1_PATTERNS:
        if pattern.match(cleaned):
            return 1

    for pattern in LEVEL_2_PATTERNS:
        if pattern.match(cleaned):
            return 2

    return None


def is_prefix_only_heading(text: str, level: int) -> bool:
    """
    Kiểm tra xem tiêu đề có phải chỉ mới chứa phần Tiền tố + Số hiệu hay không.
    Ví dụ: 'CHƯƠNG I', 'PHẦN II', 'MỤC 1', 'CHAPTER 2' (bị ngắt tên tiêu đề xuống dòng dưới).
    """
    cleaned = clean_heading_text(text)
    if level == 1:
        return bool(LEVEL_1_PREFIX_ONLY_PATTERN.match(cleaned))
    if level == 2:
        return bool(LEVEL_2_PREFIX_ONLY_PATTERN.match(cleaned))
    return False


def format_merged_title(prefix_text: str, subtitle_text: str) -> str:
    """
    Nối dòng tiền tố (VD: 'CHƯƠNG I' hoặc 'CHƯƠNG I.') với dòng tên tiêu đề
    (VD: 'CHẾ ĐỘ CHÍNH TRỊ') thành một dòng chuẩn: 'CHƯƠNG I: CHẾ ĐỘ CHÍNH TRỊ'.
    """
    prefix_clean = clean_heading_text(prefix_text).rstrip(":.-–— ")
    subtitle_clean = clean_heading_text(subtitle_text).lstrip(":.-–— ")
    if not subtitle_clean:
        return prefix_clean
    return f"{prefix_clean}: {subtitle_clean}"


def is_likely_subtitle_continuation(
    block: CandidateBlock,
    median_body_font_size: float = BODY_DEFAULT_FONT_SIZE_PT,
) -> bool:
    """
    Kiểm tra xem dòng kế tiếp ngay sau một dòng tiền tố ('CHƯƠNG I', 'MỤC 1'...)
    có phải là phần tên của đề mục bị ngắt dòng hay không.
    Điều kiện:
    1. Không trống và không phải là một từ khóa đề mục mới (CHƯƠNG, MỤC, ĐIỀU...).
    2. Có định dạng nổi bật (In đậm, hoặc cỡ chữ lớn hơn văn bản thường, hoặc viết IN HOA toàn bộ).
    3. Độ dài hợp lý của một tiêu đề (không phải một đoạn văn dài nhiều câu).
    """
    text = clean_heading_text(block.text)
    if not text or len(text) > 220:
        return False

    # Nếu bản thân dòng này đã khớp một đề mục mới thì không ghép
    if match_regex_level(text) is not None:
        return False

    is_all_upper = text.isupper() and any(ch.isalpha() for ch in text)
    is_larger_font = block.font_size >= (median_body_font_size + 0.5)

    return block.is_bold or is_all_upper or is_larger_font


def parse_headings_from_blocks(
    blocks: list[CandidateBlock],
    median_body_font_size: float = BODY_DEFAULT_FONT_SIZE_PT,
) -> list[HeadingItem]:
    """
    Phân tích danh sách các khối văn bản (từ Word hoặc PDF) theo chiến lược 2 lớp
    kết hợp thuật toán ghép dòng tiêu đề (Title Merging).
    """
    if not blocks:
        return []

    # Kiểm tra Lớp 1: Tài liệu có sử dụng sẵn Style Heading 1/2 hay chưa
    has_explicit_styles = any(b.style_level in (1, 2) for b in blocks)

    headings: list[HeadingItem] = []
    idx = 0
    total = len(blocks)

    while idx < total:
        block = blocks[idx]
        text = clean_heading_text(block.text)
        if not text:
            idx += 1
            continue

        detected_level: Optional[int] = None

        # 1. Xét theo Lớp 1 (Style có sẵn)
        if has_explicit_styles and block.style_level in (1, 2):
            detected_level = block.style_level

        # 2. Xét theo Lớp 2 (Regex + In đậm / Cỡ chữ lớn / In hoa đầu dòng)
        if detected_level is None:
            regex_level = match_regex_level(text)
            if regex_level is not None:
                is_emphasized = (
                    block.is_bold
                    or block.font_size >= (median_body_font_size + 0.5)
                    or text.isupper()
                    or is_prefix_only_heading(text, regex_level)
                )
                if is_emphasized:
                    detected_level = regex_level

        if detected_level is not None:
            final_title = text
            merged_next_idx = -1

            # Kiểm tra quy tắc ghép dòng tiêu đề (Title Merging - Mục 3.1):
            # Nếu dòng hiện tại chỉ mới là 'CHƯƠNG I', 'PHẦN I', 'MỤC 1'...
            # và dòng liền kề cùng trang là tiêu đề phụ in đậm/in hoa -> Ghép thành 1 dòng
            if is_prefix_only_heading(text, detected_level) and (idx + 1) < total:
                next_block = blocks[idx + 1]
                same_page = next_block.page_number == block.page_number
                if same_page and is_likely_subtitle_continuation(
                    next_block, median_body_font_size
                ):
                    final_title = format_merged_title(text, next_block.text)
                    merged_next_idx = next_block.paragraph_index
                    idx += 1  # Bỏ qua dòng kế tiếp vì đã được ghép

            headings.append(
                HeadingItem(
                    level=detected_level,
                    title=final_title,
                    page_number=block.page_number,
                    paragraph_index=block.paragraph_index,
                    merged_next_index=merged_next_idx,
                )
            )

        idx += 1

    return headings
