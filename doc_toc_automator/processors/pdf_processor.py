"""
Xử lý LUỒNG B: Đầu vào là tệp PDF (<Base_Name>.pdf).
Quy trình:
1. Kiểm tra vùng Header & Footer của các trang PDF xem đã có sẵn số trang hay chưa:
   - Trường hợp 1 (Đã có số trang): Giữ nguyên 100%, không vẽ đè, ghi nhận số trang hiển thị để ánh xạ vào Mục lục.
   - Trường hợp 2 (Chưa có số trang): Tự động đánh số trang từ 1 vào Chính giữa chân trang (Footer - Center).
2. Trích xuất Mục lục theo chiến lược 2 lớp (Lớp 1: PDF Outlines/Bookmarks, Lớp 2: Font Bold/Size + Regex + Ghép dòng).
3. Tạo tệp Word Mục lục rời `[Mục Lục] <Base_Name>.docx` (Tab Leader chấm bi, không đánh số trang) và xuất `[Mục Lục] <Base_Name>.pdf`.
4. Gộp `[Mục Lục] <Base_Name>.pdf` lên trước trang đầu tiên của PDF nội dung, giữ nguyên 100% vector/chữ ký/con dấu đỏ -> `<Base_Name> (in ấn).pdf`.
"""

from collections import Counter
import logging
from pathlib import Path
import statistics
from typing import Optional

import fitz  # PyMuPDF

from config import (
    BODY_DEFAULT_FONT_SIZE_PT,
    FOOTER_ZONE_RATIO,
    HEADER_ZONE_RATIO,
    HeadingItem,
    PAGE_NUMBER_REGEXES,
    PDF_FOOTER_BOTTOM_OFFSET_PT,
    PDF_FOOTER_FONT_SIZE,
)
from processors.toc_builder import build_standalone_toc_docx
from utils.heading_parser import (
    CandidateBlock,
    clean_heading_text,
    parse_headings_from_blocks,
)
from utils.office_bridge import update_fields_and_export_pdf

logger = logging.getLogger(__name__)


def _extract_number_from_margin_text(text: str) -> Optional[int]:
    """
    Kiểm tra một chuỗi ngắn ở vùng Header/Footer có phải là ký hiệu số trang hay không.
    Ví dụ khớp: '1', '- 2 -', 'Trang 3', 'Trang 4/12', 'Page 5 of 20', '[6]'.
    """
    cleaned = clean_heading_text(text)
    if not cleaned or len(cleaned) > 30:
        return None

    for pattern in PAGE_NUMBER_REGEXES:
        match = pattern.match(cleaned)
        if match:
            try:
                val = int(match.group(1))
                if 1 <= val <= 9999:
                    return val
            except (ValueError, IndexError):
                continue
    return None


def detect_existing_page_numbers(pdf_doc: fitz.Document) -> tuple[bool, dict[int, int]]:
    """
    Thuật toán kiểm tra vùng Header (lề trên) và Footer (lề dưới) của toàn bộ tệp PDF
    xem tài liệu đã được đánh số trang sẵn hay chưa.

    Nguyên lý:
    1. Trên mỗi trang i (0-based), quét tất cả các dòng text nằm trong vùng Header
       (y1 <= height * HEADER_ZONE_RATIO) hoặc vùng Footer (y0 >= height * (1 - FOOTER_ZONE_RATIO)).
    2. Lọc các chuỗi khớp định dạng số trang (`_extract_number_from_margin_text`).
    3. Tìm độ lệch chuẩn (offset = số_trang_hiển_thị - chỉ_số_trang_i) xuất hiện ổn định nhất
       (đảm bảo tính tăng dần liên tục giữa các trang: trang sau lớn hơn trang trước đúng bằng khoảng cách trang).
    4. Nếu số trang khớp chuỗi liên tục đạt ngưỡng tin cậy (>= 50% tổng số trang, hoặc >= 2 trang liên tiếp
       với tài liệu ngắn), kết luận PDF ĐÃ CÓ SỐ TRANG và trả về bảng ánh xạ {page_index: displayed_page_num}.
    """
    total_pages = len(pdf_doc)
    if total_pages == 0:
        return False, {}

    # Lưu danh sách ứng viên số trang tìm thấy trên từng trang: {page_idx: set(candidate_numbers)}
    candidates_per_page: dict[int, set[int]] = {}

    for page_idx in range(total_pages):
        page = pdf_doc[page_idx]
        rect = page.rect
        page_h = rect.height
        header_limit_y = page_h * HEADER_ZONE_RATIO
        footer_start_y = page_h * (1.0 - FOOTER_ZONE_RATIO)

        page_candidates: set[int] = set()
        text_dict = page.get_text("dict")

        for block in text_dict.get("blocks", []):
            if block.get("type") != 0:  # Chỉ xét text block
                continue
            for line in block.get("lines", []):
                bbox = line.get("bbox", (0, 0, 0, 0))
                y0, y1 = bbox[1], bbox[3]
                in_header = y1 <= header_limit_y
                in_footer = y0 >= footer_start_y
                if not (in_header or in_footer):
                    continue

                line_text = "".join(span.get("text", "") for span in line.get("spans", "")).strip()
                num = _extract_number_from_margin_text(line_text)
                if num is not None:
                    page_candidates.add(num)
                else:
                    # Trường hợp dòng ফু터 có kèm chữ ở góc trái và số trang ở góc phải (cùng 1 line bbox)
                    for span in line.get("spans", []):
                        span_num = _extract_number_from_margin_text(span.get("text", ""))
                        if span_num is not None:
                            page_candidates.add(span_num)

        if page_candidates:
            candidates_per_page[page_idx] = page_candidates

    if not candidates_per_page:
        return False, {}

    # Tính tần suất của hiệu số offset = (displayed_num - page_idx)
    # Nếu tài liệu đánh số từ 1 ở trang đầu tiên (page_idx=0) thì offset = 1.
    offset_counter: Counter[int] = Counter()
    for page_idx, nums in candidates_per_page.items():
        for num in nums:
            offset = num - page_idx
            if -5 <= offset <= 50:  # Giới hạn hợp lý cho số trang bắt đầu
                offset_counter[offset] += 1

    if not offset_counter:
        return False, {}

    best_offset, matched_count = offset_counter.most_common(1)[0]

    # Ngưỡng xác nhận tài liệu đã có sẵn số trang:
    # - Với tài liệu 1 trang: chỉ cần trang đó có số trang hợp lệ (offset >= 1)
    # - Với tài liệu >= 2 trang: ít nhất 50% số trang (hoặc tối thiểu 2 trang nếu tài liệu ngắn) khớp cùng offset tăng dần
    if total_pages == 1:
        has_page_numbers = matched_count == 1 and best_offset >= 1
    else:
        required_matches = max(2, int(total_pages * 0.45))
        has_page_numbers = matched_count >= required_matches

    if not has_page_numbers:
        return False, {}

    # Xây dựng bảng ánh xạ số trang hiển thị cho từng trang PDF
    page_number_map: dict[int, int] = {}
    for page_idx in range(total_pages):
        expected_num = page_idx + best_offset
        if page_idx in candidates_per_page and expected_num in candidates_per_page[page_idx]:
            page_number_map[page_idx] = expected_num
        else:
            # Nội suy theo chuỗi liên tục cho các trang bìa/trang khuyết số
            page_number_map[page_idx] = max(1, expected_num)

    return True, page_number_map


def stamp_page_numbers_on_pdf(pdf_doc: fitz.Document) -> dict[int, int]:
    """
    Đánh số trang tự động (bắt đầu từ 1) vào vị trí Chính giữa chân trang (Footer - Center)
    cho tệp PDF chưa có sẵn số trang.
    Sử dụng font Times New Roman (nếu có trên hệ thống) để đồng bộ thẩm mỹ.
    """
    regular_font_path: Optional[str] = None
    win_font = Path(r"C:\Windows\Fonts\times.ttf")
    if win_font.exists():
        regular_font_path = str(win_font)

    font_obj = fitz.Font(fontfile=regular_font_path) if regular_font_path else fitz.Font("tiro")
    font_tag = "TNR_Footer" if regular_font_path else "tiro"

    page_map: dict[int, int] = {}
    for page_idx, page in enumerate(pdf_doc):
        page_num = page_idx + 1
        page_map[page_idx] = page_num
        num_str = str(page_num)

        if regular_font_path:
            page.insert_font(fontname=font_tag, fontfile=regular_font_path)

        rect = page.rect
        text_w = font_obj.text_length(num_str, fontsize=PDF_FOOTER_FONT_SIZE)
        x_center = (rect.width - text_w) / 2.0
        y_footer = rect.height - PDF_FOOTER_BOTTOM_OFFSET_PT

        page.insert_text(
            fitz.Point(x_center, y_footer),
            num_str,
            fontname=font_tag,
            fontsize=PDF_FOOTER_FONT_SIZE,
            color=(0, 0, 0),
        )

    return page_map


def _is_span_bold(span: dict) -> bool:
    """
    Kiểm tra một span trong PyMuPDF có định dạng In đậm (Bold) hay không
    dựa trên cờ bit (flags & 16) hoặc tên Font.
    """
    flags = int(span.get("flags", 0))
    if flags & 16:  # Bit thứ 4 (2^4 = 16) trong PyMuPDF đại diện cho Bold/ForceBold
        return True
    font_name = str(span.get("font", "")).lower()
    return any(k in font_name for k in ("bold", "bd", "black", "heavy", "semibold", "demi"))


def extract_headings_from_pdf(
    pdf_doc: fitz.Document,
    page_number_map: dict[int, int],
) -> list[HeadingItem]:
    """
    Trích xuất danh sách đề mục từ tệp PDF theo chiến lược 2 lớp (Mục 3.2):
    - Lớp 1: Kiểm tra PDF Bookmarks / Outlines (`pdf_doc.get_toc()`).
    - Lớp 2: Quét các dòng văn bản kèm thông tin Font (Bold, Size) + Regex đa ngôn ngữ + Ghép dòng.
    """
    # --------------------------------------------------------------------------
    # LỚP 1: Ưu tiên đọc từ PDF Bookmarks / Outlines nếu có sẵn
    # --------------------------------------------------------------------------
    toc_outlines = pdf_doc.get_toc(simple=True)
    if toc_outlines:
        outline_blocks: list[CandidateBlock] = []
        for idx, entry in enumerate(toc_outlines):
            if len(entry) < 3:
                continue
            raw_level, raw_title, raw_page_1based = entry[0], entry[1], entry[2]
            title_clean = clean_heading_text(str(raw_title))
            if not title_clean:
                continue
            norm_level = 1 if int(raw_level) <= 1 else 2
            page_idx = max(0, min(len(pdf_doc) - 1, int(raw_page_1based) - 1))
            disp_page = page_number_map.get(page_idx, int(raw_page_1based))

            outline_blocks.append(
                CandidateBlock(
                    text=title_clean,
                    is_bold=True,
                    font_size=BODY_DEFAULT_FONT_SIZE_PT + 1.0,
                    page_number=disp_page,
                    paragraph_index=idx,
                    style_level=norm_level,
                )
            )
        if outline_blocks:
            logger.info("Đã tìm thấy %d mục từ PDF Bookmarks/Outlines (Lớp 1).", len(outline_blocks))
            return parse_headings_from_blocks(outline_blocks)

    # --------------------------------------------------------------------------
    # LỚP 2: Quét văn bản + Thuộc tính Font (Bold / Size) + Regex + Ghép dòng
    # --------------------------------------------------------------------------
    candidate_blocks: list[CandidateBlock] = []
    all_font_sizes: list[float] = []
    running_idx = 0

    for page_idx, page in enumerate(pdf_doc):
        disp_page = page_number_map.get(page_idx, page_idx + 1)
        page_h = page.rect.height
        header_limit_y = page_h * HEADER_ZONE_RATIO
        footer_start_y = page_h * (1.0 - FOOTER_ZONE_RATIO)

        text_dict = page.get_text("dict")

        # Thu thập các dòng văn bản trên trang, sắp xếp từ trên xuống dưới theo tọa độ y
        page_lines: list[tuple[float, float, str, bool, float]] = []

        for block in text_dict.get("blocks", []):
            if block.get("type") != 0:
                continue
            for line in block.get("lines", []):
                bbox = line.get("bbox", (0, 0, 0, 0))
                x0, y0, _, y1 = bbox

                # Bỏ qua chuỗi chỉ là số trang nằm ở sát mép Header/Footer
                spans = line.get("spans", [])
                line_text = clean_heading_text("".join(s.get("text", "") for s in spans))
                if not line_text:
                    continue

                if (y1 <= header_limit_y or y0 >= footer_start_y) and (
                    _extract_number_from_margin_text(line_text) is not None
                ):
                    continue

                total_chars = 0
                bold_chars = 0
                span_sizes: list[float] = []

                for s in spans:
                    s_text = s.get("text", "").strip()
                    if not s_text:
                        continue
                    c_len = len(s_text)
                    total_chars += c_len
                    if _is_span_bold(s):
                        bold_chars += c_len
                    s_size = float(s.get("size", BODY_DEFAULT_FONT_SIZE_PT))
                    span_sizes.append(s_size)
                    all_font_sizes.append(s_size)

                if total_chars == 0:
                    continue

                is_line_bold = (bold_chars / total_chars) >= 0.65
                max_span_size = max(span_sizes) if span_sizes else BODY_DEFAULT_FONT_SIZE_PT
                page_lines.append((y0, x0, line_text, is_line_bold, max_span_size))

        # Sắp xếp dòng theo thứ tự từ trên xuống dưới (y0), trái sang phải (x0)
        page_lines.sort(key=lambda item: (round(item[0], 1), round(item[1], 1)))

        # Gộp các mảnh span nằm trên cùng một dòng ngang (chênh lệch y0 < 3pt)
        merged_visual_lines: list[tuple[str, bool, float]] = []
        last_y: Optional[float] = None

        for y0, _, l_text, l_bold, l_size in page_lines:
            if last_y is not None and abs(y0 - last_y) <= 3.0 and merged_visual_lines:
                prev_text, prev_bold, prev_size = merged_visual_lines[-1]
                merged_visual_lines[-1] = (
                    clean_heading_text(f"{prev_text} {l_text}"),
                    prev_bold or l_bold,
                    max(prev_size, l_size),
                )
            else:
                merged_visual_lines.append((l_text, l_bold, l_size))
                last_y = y0

        for v_text, v_bold, v_size in merged_visual_lines:
            candidate_blocks.append(
                CandidateBlock(
                    text=v_text,
                    is_bold=v_bold,
                    font_size=v_size,
                    page_number=disp_page,
                    paragraph_index=running_idx,
                    style_level=None,
                )
            )
            running_idx += 1

    median_size = (
        float(statistics.median(all_font_sizes))
        if all_font_sizes
        else BODY_DEFAULT_FONT_SIZE_PT
    )

    headings = parse_headings_from_blocks(candidate_blocks, median_body_font_size=median_size)
    logger.info("Đã trích xuất %d đề mục từ nội dung PDF (Lớp 2).", len(headings))
    return headings


def process_pdf_file(input_path: Path, output_dir: Optional[Path] = None) -> tuple[Path, Path, Path]:
    """
    Thực thi toàn bộ Luồng B cho một tệp PDF (<Base_Name>.pdf).
    Trả về tuple 3 tệp đầu ra bắt buộc:
    1. [Mục Lục] <Base_Name>.docx
    2. [Mục Lục] <Base_Name>.pdf
    3. <Base_Name> (in ấn).pdf
    """
    input_path = input_path.resolve()
    base_name = input_path.stem
    target_dir = (output_dir or input_path.parent).resolve()
    target_dir.mkdir(parents=True, exist_ok=True)

    toc_docx_path = target_dir / f"[Mục Lục] {base_name}.docx"
    toc_pdf_path = target_dir / f"[Mục Lục] {base_name}.pdf"
    final_print_pdf_path = target_dir / f"{base_name} (in ấn).pdf"

    logger.info("=== [LUỒNG B - PDF] Bắt đầu xử lý: %s ===", input_path.name)

    content_pdf = fitz.open(str(input_path))
    try:
        # Bước 1: Kiểm tra & xử lý số trang hiện trạng ở vùng Header/Footer
        has_existing_numbers, page_number_map = detect_existing_page_numbers(content_pdf)
        if has_existing_numbers:
            logger.info(
                "Phát hiện PDF ĐÃ CÓ SẴN số trang (ví dụ trang đầu = %d). Giữ nguyên 100%% số trang gốc.",
                page_number_map.get(0, 1),
            )
        else:
            logger.info(
                "PDF CHƯA CÓ số trang. Tiến hành đánh số trang tự động (từ 1) vào Chính giữa chân trang."
            )
            page_number_map = stamp_page_numbers_on_pdf(content_pdf)

        # Bước 2: Trích xuất danh sách Mục lục (Cấp độ, Tên đề mục đã ghép dòng, Số trang)
        headings = extract_headings_from_pdf(content_pdf, page_number_map)

        # Bước 3: Tạo tệp Word Mục lục trung gian `[Mục Lục] <Base_Name>.docx` & xuất `[Mục Lục] <Base_Name>.pdf`
        build_standalone_toc_docx(
            base_name=base_name,
            headings=headings,
            output_docx_path=toc_docx_path,
        )
        logger.info("Đã tạo tệp Word mục lục rời: %s", toc_docx_path.name)

        update_fields_and_export_pdf(
            docx_path=toc_docx_path,
            pdf_path=toc_pdf_path,
            update_toc_fields=False,  # Tệp mục lục rời Luồng B không đánh số trang
        )
        logger.info("Đã tạo tệp PDF mục lục rời: %s", toc_pdf_path.name)

        # Bước 4: Gộp `[Mục Lục] <Base_Name>.pdf` lên trước trang đầu tiên của PDF nội dung
        merged_pdf = fitz.open()
        toc_pdf_doc = fitz.open(str(toc_pdf_path))
        try:
            merged_pdf.insert_pdf(toc_pdf_doc)
            merged_pdf.insert_pdf(content_pdf)
            merged_pdf.save(str(final_print_pdf_path), garbage=3, deflate=True)
            logger.info(
                "Đã gộp hoàn chỉnh tệp PDF in ấn (%d trang): %s",
                len(merged_pdf),
                final_print_pdf_path.name,
            )
        finally:
            toc_pdf_doc.close()
            merged_pdf.close()

        return toc_docx_path, toc_pdf_path, final_print_pdf_path

    finally:
        content_pdf.close()
