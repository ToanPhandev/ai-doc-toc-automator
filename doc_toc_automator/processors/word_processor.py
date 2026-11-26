"""
Xử lý LUỒNG A: Đầu vào là tệp Word (<Base_Name>.doc hoặc <Base_Name>.docx).
Quy trình:
1. Nếu là .doc -> Tự động convert sang .docx.
2. Nhận diện đề mục thông minh (Lớp 1: Style Heading, Lớp 2: Regex + In đậm/Cỡ chữ) & Ghép dòng tiêu đề.
3. Gán Style Heading 1, Heading 2 (giữ chuẩn font Times New Roman).
4. Chèn Mục lục tự động (TOC Field) tại Trang 1 + Ngắt trang đẩy nội dung gốc sang Trang 2.
5. Đánh số trang tự động từ 1 tại Chính giữa chân trang (Footer - Center).
6. Cập nhật Fields.Update() và xuất 2 tệp đầu ra:
   - <Base_Name>_muc_luc.docx
   - <Base_Name> (in ấn).pdf
"""

import logging
import statistics
import tempfile
from pathlib import Path
from typing import Optional

from docx import Document
from docx.text.paragraph import Paragraph

from config import BODY_DEFAULT_FONT_SIZE_PT, TOC_LEVEL1_FONT_SIZE_PT, TOC_LEVEL2_FONT_SIZE_PT
from processors.toc_builder import (
    add_center_footer_page_number,
    configure_heading_and_toc_styles,
    insert_toc_at_page_one,
    set_run_font_times_new_roman,
)
from utils.heading_parser import CandidateBlock, clean_heading_text, parse_headings_from_blocks
from utils.office_bridge import convert_doc_to_docx, update_fields_and_export_pdf

logger = logging.getLogger(__name__)


def _extract_paragraph_bold_and_size(
    para: Paragraph,
    default_size: float = BODY_DEFAULT_FONT_SIZE_PT,
) -> tuple[bool, float]:
    """
    Kiểm tra một đoạn văn trong Word có in đậm hay không và lấy cỡ chữ đại diện (pt).
    Xét cả thuộc tính trực tiếp trên Run lẫn thuộc tính kế thừa từ Style.
    """
    non_empty_runs = [r for r in para.runs if r.text and r.text.strip()]
    style_bold = bool(para.style and para.style.font and para.style.font.bold)
    style_size: Optional[float] = None
    if para.style and para.style.font and para.style.font.size:
        style_size = float(para.style.font.size.pt)

    if not non_empty_runs:
        return style_bold, style_size or default_size

    # Đoạn được coi là in đậm nếu tất cả các run có chữ đều in đậm (hoặc style in đậm)
    bold_chars = 0
    total_chars = 0
    sizes: list[float] = []

    for r in non_empty_runs:
        char_len = len(r.text.strip())
        total_chars += char_len
        is_run_bold = r.bold if r.bold is not None else style_bold
        if is_run_bold:
            bold_chars += char_len

        if r.font and r.font.size:
            sizes.append(float(r.font.size.pt))
        elif style_size is not None:
            sizes.append(style_size)

    is_bold = (total_chars > 0 and (bold_chars / total_chars) >= 0.7) or style_bold
    font_size = max(sizes) if sizes else (style_size or default_size)
    return is_bold, font_size


def _get_style_heading_level(para: Paragraph) -> Optional[int]:
    """Kiểm tra đoạn văn có đang mang style Heading 1/2/3 sẵn hay không."""
    if not para.style or not para.style.name:
        return None
    s_name = para.style.name.strip().lower()
    if s_name in ("heading 1", "tiêu đề 1"):
        return 1
    if s_name in ("heading 2", "heading 3", "tiêu đề 2", "tiêu đề 3"):
        return 2
    return None


def _remove_paragraph(para: Paragraph) -> None:
    """Xóa một đoạn văn khỏi cây XML của tài liệu Word (dùng sau khi đã ghép tiêu đề 2 dòng)."""
    p_element = para._element
    parent = p_element.getparent()
    if parent is not None:
        parent.remove(p_element)


def process_word_file(input_path: Path, output_dir: Optional[Path] = None) -> tuple[Path, Path]:
    """
    Thực thi toàn bộ Luồng A cho một tệp .doc hoặc .docx.
    Trả về tuple (đường_dẫn_docx_mục_lục, đường_dẫn_pdf_in_ấn).
    """
    input_path = input_path.resolve()
    base_name = input_path.stem
    target_dir = (output_dir or input_path.parent).resolve()
    target_dir.mkdir(parents=True, exist_ok=True)

    output_docx_path = target_dir / f"{base_name}_muc_luc.docx"
    output_pdf_path = target_dir / f"{base_name} (in ấn).pdf"

    logger.info("=== [LUỒNG A - WORD] Bắt đầu xử lý: %s ===", input_path.name)

    temp_converted_docx: Optional[Path] = None
    working_docx_path = input_path

    try:
        # Bước 1: Chuyển đổi định dạng cũ (.doc -> .docx) nếu cần
        if input_path.suffix.lower() == ".doc":
            tmp_dir = Path(tempfile.mkdtemp(prefix="doc_toc_"))
            temp_converted_docx = tmp_dir / f"{base_name}.docx"
            working_docx_path = convert_doc_to_docx(input_path, temp_converted_docx)

        doc = Document(str(working_docx_path))
        configure_heading_and_toc_styles(doc)

        # Bước 2: Thu thập thông tin các đoạn văn để nhận diện đề mục
        paragraphs = list(doc.paragraphs)
        font_sizes: list[float] = []
        raw_blocks: list[CandidateBlock] = []

        # Ước lượng số trang tương đối trước khi chèn TOC (trang 1 cho TOC nên nội dung bắt đầu từ trang 2)
        estimated_page = 2
        approx_chars_on_page = 0

        for idx, para in enumerate(paragraphs):
            text = clean_heading_text(para.text)
            has_hard_break = any(
                "w:br" in r._element.xml and 'w:type="page"' in r._element.xml
                for r in para.runs
            )
            if has_hard_break and approx_chars_on_page > 0:
                estimated_page += 1
                approx_chars_on_page = 0

            if not text:
                continue

            is_bold, f_size = _extract_paragraph_bold_and_size(para)
            style_lvl = _get_style_heading_level(para)
            font_sizes.append(f_size)

            raw_blocks.append(
                CandidateBlock(
                    text=text,
                    is_bold=is_bold,
                    font_size=f_size,
                    page_number=estimated_page,
                    paragraph_index=idx,
                    style_level=style_lvl,
                )
            )

            approx_chars_on_page += len(text) + 45
            if approx_chars_on_page >= 2400:
                estimated_page += 1
                approx_chars_on_page = 0

        median_size = (
            float(statistics.median(font_sizes))
            if font_sizes
            else BODY_DEFAULT_FONT_SIZE_PT
        )

        # Phân tích đề mục theo chiến lược 2 lớp + Ghép dòng tiêu đề
        headings = parse_headings_from_blocks(raw_blocks, median_body_font_size=median_size)
        logger.info("Nhận diện được %d đề mục trong tệp Word.", len(headings))

        # Gán Style Heading 1 / Heading 2 và thực hiện ghép dòng tiêu đề bị ngắt
        paragraphs_to_remove: list[Paragraph] = []
        for item in headings:
            if 0 <= item.paragraph_index < len(paragraphs):
                target_para = paragraphs[item.paragraph_index]
                style_name = "Heading 1" if item.level == 1 else "Heading 2"
                target_para.style = doc.styles[style_name]

                # Nếu tiêu đề được ghép từ 2 đoạn liên tiếp (VD: 'CHƯƠNG I' + 'CHẾ ĐỘ CHÍNH TRỊ')
                if 0 <= item.merged_next_index < len(paragraphs):
                    next_para = paragraphs[item.merged_next_index]
                    target_para.clear()
                    r_merged = target_para.add_run(item.title)
                    f_pt = TOC_LEVEL1_FONT_SIZE_PT if item.level == 1 else TOC_LEVEL2_FONT_SIZE_PT
                    set_run_font_times_new_roman(r_merged, size_pt=f_pt, bold=True)
                    paragraphs_to_remove.append(next_para)
                else:
                    # Đảm bảo giữ chuẩn font Times New Roman cho đoạn Heading
                    for r in target_para.runs:
                        f_pt = (
                            float(r.font.size.pt)
                            if (r.font and r.font.size)
                            else (TOC_LEVEL1_FONT_SIZE_PT if item.level == 1 else TOC_LEVEL2_FONT_SIZE_PT)
                        )
                        set_run_font_times_new_roman(r, size_pt=f_pt, bold=True)

        for p_rem in paragraphs_to_remove:
            _remove_paragraph(p_rem)

        # Bước 3: Chèn Mục lục tự động tại Trang 1 + Ngắt trang đẩy nội dung sang Trang 2
        insert_toc_at_page_one(doc, base_name=base_name, headings=headings)

        # Bước 4: Đánh số trang tự động liên tục từ 1 ở Chính giữa chân trang (Footer - Center)
        add_center_footer_page_number(doc)

        # Lưu tệp Word đầu ra <Base_Name>_muc_luc.docx
        doc.save(str(output_docx_path))
        logger.info("Đã lưu tệp Word có mục lục: %s", output_docx_path.name)

        # Bước 5: Cập nhật Fields.Update() và xuất sang PDF <Base_Name> (in ấn).pdf
        update_fields_and_export_pdf(
            docx_path=output_docx_path,
            pdf_path=output_pdf_path,
            update_toc_fields=True,
        )
        logger.info("Đã xuất tệp PDF in ấn: %s", output_pdf_path.name)

        return output_docx_path, output_pdf_path

    finally:
        if temp_converted_docx is not None and temp_converted_docx.exists():
            try:
                temp_converted_docx.unlink()
                temp_converted_docx.parent.rmdir()
            except Exception:
                pass
