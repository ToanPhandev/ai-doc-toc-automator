"""
Bộ khởi tạo Trang Mục lục (TOC), Định dạng Style Heading chuẩn Times New Roman,
Tab Stop chấm bi (WD_TAB_LEADER.DOTS) và Đánh số trang Chính giữa chân trang (Footer - Center).
"""

from pathlib import Path
from typing import Sequence

from docx import Document
from docx.document import Document as DocumentObject
from docx.enum.style import WD_STYLE_TYPE
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_TAB_ALIGNMENT, WD_TAB_LEADER
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor
from docx.text.paragraph import Paragraph
from docx.text.run import Run

from config import (
    CONTENT_WIDTH_CM,
    FONT_NAME,
    HeadingItem,
    MARGIN_BOTTOM_CM,
    MARGIN_LEFT_CM,
    MARGIN_RIGHT_CM,
    MARGIN_TOP_CM,
    PAGE_HEIGHT_CM,
    PAGE_WIDTH_CM,
    TOC_LEVEL1_FONT_SIZE_PT,
    TOC_LEVEL2_FONT_SIZE_PT,
    TOC_LEVEL2_LEFT_INDENT_CM,
    TOC_TEXT_RIGHT_INDENT_CM,
    TOC_TITLE_FONT_SIZE_PT,
)


def set_run_font_times_new_roman(
    run: Run,
    size_pt: float,
    bold: bool = False,
    italic: bool = False,
) -> None:
    """Thiết lập đầy đủ thuộc tính font Times New Roman Unicode (ascii, hAnsi, cs, eastAsia) cho Run."""
    run.font.name = FONT_NAME
    run.font.size = Pt(size_pt)
    run.bold = bold
    run.italic = italic
    run.font.color.rgb = RGBColor(0, 0, 0)

    r_pr = run._element.get_or_add_rPr()
    r_fonts = r_pr.find(qn("w:rFonts"))
    if r_fonts is None:
        r_fonts = OxmlElement("w:rFonts")
        r_pr.insert(0, r_fonts)
    r_fonts.set(qn("w:ascii"), FONT_NAME)
    r_fonts.set(qn("w:hAnsi"), FONT_NAME)
    r_fonts.set(qn("w:cs"), FONT_NAME)
    r_fonts.set(qn("w:eastAsia"), FONT_NAME)


def configure_heading_and_toc_styles(doc: DocumentObject) -> None:
    """
    Chuẩn hóa các style Heading 1, Heading 2, TOC 1, TOC 2 trong tài liệu Word
    về đúng font Times New Roman (13pt - 14pt), màu đen, hỗ trợ đầy đủ tiếng Việt & tiếng Anh.
    """
    styles = doc.styles
    style_configs = [
        ("Heading 1", TOC_LEVEL1_FONT_SIZE_PT, True),
        ("Heading 2", TOC_LEVEL2_FONT_SIZE_PT, True),
        ("TOC 1", TOC_LEVEL1_FONT_SIZE_PT, True),
        ("TOC 2", TOC_LEVEL2_FONT_SIZE_PT, False),
    ]

    for style_name, font_size, is_bold in style_configs:
        try:
            style = styles[style_name]
        except KeyError:
            style = styles.add_style(style_name, WD_STYLE_TYPE.PARAGRAPH)

        style.font.name = FONT_NAME
        style.font.size = Pt(font_size)
        style.font.bold = is_bold
        style.font.color.rgb = RGBColor(0, 0, 0)

        r_pr = style._element.get_or_add_rPr()
        r_fonts = r_pr.find(qn("w:rFonts"))
        if r_fonts is None:
            r_fonts = OxmlElement("w:rFonts")
            r_pr.insert(0, r_fonts)
        r_fonts.set(qn("w:ascii"), FONT_NAME)
        r_fonts.set(qn("w:hAnsi"), FONT_NAME)
        r_fonts.set(qn("w:cs"), FONT_NAME)
        r_fonts.set(qn("w:eastAsia"), FONT_NAME)


def _format_toc_entry_paragraph(
    para: Paragraph,
    item: HeadingItem,
    tab_stop_cm: float = CONTENT_WIDTH_CM,
) -> None:
    """
    Định dạng một dòng đề mục trong Mục lục:
    [Tên đề mục] + [Tab Leader chấm bi (.........)] + [Số trang căn lề phải].
    Thiết lập right_indent cho phần chữ để khi đề mục dài bị ngắt dòng (wrap text),
    số trang luôn nằm riêng thẳng hàng ở lề phải dòng cuối.
    """
    is_l1 = item.level == 1
    font_size = TOC_LEVEL1_FONT_SIZE_PT if is_l1 else TOC_LEVEL2_FONT_SIZE_PT

    pf = para.paragraph_format
    pf.alignment = WD_ALIGN_PARAGRAPH.LEFT
    pf.left_indent = Cm(0.0 if is_l1 else TOC_LEVEL2_LEFT_INDENT_CM)
    pf.right_indent = Cm(TOC_TEXT_RIGHT_INDENT_CM)
    pf.space_before = Pt(5.0 if is_l1 else 3.0)
    pf.space_after = Pt(4.0 if is_l1 else 3.0)
    pf.line_spacing = 1.25

    pf.tab_stops.clear_all()
    pf.tab_stops.add_tab_stop(
        Cm(tab_stop_cm),
        WD_TAB_ALIGNMENT.RIGHT,
        WD_TAB_LEADER.DOTS,
    )

    run_title = para.add_run(item.title)
    set_run_font_times_new_roman(run_title, size_pt=font_size, bold=is_l1)

    run_tab_page = para.add_run(f"\t{item.page_number}")
    set_run_font_times_new_roman(run_tab_page, size_pt=font_size, bold=is_l1)


def insert_toc_at_page_one(
    doc: DocumentObject,
    base_name: str,
    headings: Sequence[HeadingItem],
) -> None:
    """
    LUỒNG A: Chèn trang Mục lục vào Trang 1 của tài liệu Word và đẩy toàn bộ nội dung gốc
    bắt đầu từ Trang 2 bằng ngắt trang (Page Break).
    Bao gồm cả trường `TOC \\o "1-3" \\h \\z \\u` tự động của Word (để Fields.Update() cập nhật)
    lẫn các dòng mục lục định dạng sẵn Tab Leader chấm bi.
    """
    if doc.paragraphs:
        anchor_p = doc.paragraphs[0]
    else:
        anchor_p = doc.add_paragraph()

    def _insert_before_anchor() -> Paragraph:
        return anchor_p.insert_paragraph_before()

    # 1. Tiêu đề trên cùng: Tên tài liệu (In hoa, in đậm, căn giữa)
    p_doc_title = _insert_before_anchor()
    p_doc_title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_doc_title.paragraph_format.space_before = Pt(0)
    p_doc_title.paragraph_format.space_after = Pt(4)
    r_doc_title = p_doc_title.add_run(base_name.strip().upper())
    set_run_font_times_new_roman(r_doc_title, size_pt=TOC_TITLE_FONT_SIZE_PT, bold=True)

    # 2. Dòng chữ "MỤC LỤC" (In hoa, in đậm, căn giữa)
    p_toc_title = _insert_before_anchor()
    p_toc_title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_toc_title.paragraph_format.space_before = Pt(0)
    p_toc_title.paragraph_format.space_after = Pt(14)
    r_toc_title = p_toc_title.add_run("MỤC LỤC")
    set_run_font_times_new_roman(r_toc_title, size_pt=TOC_TITLE_FONT_SIZE_PT, bold=True)

    # 3. Mở trường TOC Field của Word (begin -> instrText -> separate)
    p_fld_begin = _insert_before_anchor()
    p_fld_begin.paragraph_format.space_before = Pt(0)
    p_fld_begin.paragraph_format.space_after = Pt(0)
    r_begin = p_fld_begin.add_run()
    fld_char_begin = OxmlElement("w:fldChar")
    fld_char_begin.set(qn("w:fldCharType"), "begin")
    fld_char_begin.set(qn("w:dirty"), "true")

    instr_text = OxmlElement("w:instrText")
    instr_text.set(qn("xml:space"), "preserve")
    instr_text.text = ' TOC \\o "1-3" \\h \\z \\u '

    fld_char_sep = OxmlElement("w:fldChar")
    fld_char_sep.set(qn("w:fldCharType"), "separate")

    r_begin._r.append(fld_char_begin)
    r_begin._r.append(instr_text)
    r_begin._r.append(fld_char_sep)

    # 4. Điền các dòng đề mục chuẩn Tab Leader chấm bi
    if not headings:
        p_empty = _insert_before_anchor()
        p_empty.alignment = WD_ALIGN_PARAGRAPH.CENTER
        r_empty = p_empty.add_run("(Không tìm thấy đề mục tự động trong tài liệu)")
        set_run_font_times_new_roman(
            r_empty, size_pt=TOC_LEVEL2_FONT_SIZE_PT, bold=False, italic=True
        )
    else:
        for item in headings:
            p_entry = _insert_before_anchor()
            _format_toc_entry_paragraph(p_entry, item, tab_stop_cm=CONTENT_WIDTH_CM)

    # 5. Đóng trường TOC Field (end) và chèn Ngắt trang (Page Break) đẩy nội dung gốc sang Trang 2
    p_fld_end = _insert_before_anchor()
    p_fld_end.paragraph_format.space_before = Pt(0)
    p_fld_end.paragraph_format.space_after = Pt(0)
    r_end = p_fld_end.add_run()
    fld_char_end = OxmlElement("w:fldChar")
    fld_char_end.set(qn("w:fldCharType"), "end")
    r_end._r.append(fld_char_end)

    r_break = p_fld_end.add_run()
    br_el = OxmlElement("w:br")
    br_el.set(qn("w:type"), "page")
    r_break._r.append(br_el)

    # Bật cờ updateFields trong settings.xml để Word tự động làm mới khi mở
    settings_el = doc.settings.element
    if settings_el.find(qn("w:updateFields")) is None:
        update_fields = OxmlElement("w:updateFields")
        update_fields.set(qn("w:val"), "true")
        settings_el.append(update_fields)


def add_center_footer_page_number(doc: DocumentObject) -> None:
    """
    Thiết lập đánh số trang tự động liên tục bắt đầu từ 1 ngay tại Trang 1 (trang Mục lục)
    cho đến trang cuối cùng ở vị trí Chính giữa chân trang (Footer - Center).
    """
    for idx, section in enumerate(doc.sections):
        section.different_first_page_header_footer = False
        footer = section.footer
        footer.is_linked_to_previous = False

        # Thiết lập bắt đầu đếm từ 1 ở section đầu tiên
        sect_pr = section._sectPr
        pg_num_type = sect_pr.find(qn("w:pgNumType"))
        if pg_num_type is None:
            pg_num_type = OxmlElement("w:pgNumType")
            sect_pr.append(pg_num_type)
        if idx == 0:
            pg_num_type.set(qn("w:start"), "1")
        elif qn("w:start") in pg_num_type.attrib:
            del pg_num_type.attrib[qn("w:start")]

        if footer.paragraphs:
            p_ftr = footer.paragraphs[0]
            p_ftr.clear()
        else:
            p_ftr = footer.add_paragraph()

        p_ftr.alignment = WD_ALIGN_PARAGRAPH.CENTER

        run = p_ftr.add_run()
        set_run_font_times_new_roman(run, size_pt=11.0, bold=False)

        fld_begin = OxmlElement("w:fldChar")
        fld_begin.set(qn("w:fldCharType"), "begin")

        instr = OxmlElement("w:instrText")
        instr.set(qn("xml:space"), "preserve")
        instr.text = " PAGE "

        fld_sep = OxmlElement("w:fldChar")
        fld_sep.set(qn("w:fldCharType"), "separate")

        t_val = OxmlElement("w:t")
        t_val.text = "1"

        fld_end = OxmlElement("w:fldChar")
        fld_end.set(qn("w:fldCharType"), "end")

        run._r.append(fld_begin)
        run._r.append(instr)
        run._r.append(fld_sep)
        run._r.append(t_val)
        run._r.append(fld_end)


def build_standalone_toc_docx(
    base_name: str,
    headings: Sequence[HeadingItem],
    output_docx_path: Path,
) -> Path:
    """
    LUỒNG B: Khởi tạo một tệp Word mới `[Mục Lục] <Base_Name>.docx`.
    - Chuẩn khổ A4, font Times New Roman 13-14pt.
    - Thiết lập Tab Stop lề phải kèm đường dẫn chấm bi (`WD_TAB_LEADER.DOTS`).
    - Không đánh số trang trên tệp Word mục lục rời này.
    """
    doc = Document()
    configure_heading_and_toc_styles(doc)

    section = doc.sections[0]
    section.page_width = Cm(PAGE_WIDTH_CM)
    section.page_height = Cm(PAGE_HEIGHT_CM)
    section.top_margin = Cm(MARGIN_TOP_CM)
    section.bottom_margin = Cm(MARGIN_BOTTOM_CM)
    section.left_margin = Cm(MARGIN_LEFT_CM)
    section.right_margin = Cm(MARGIN_RIGHT_CM)

    # 1. Tiêu đề tên tài liệu (In hoa, in đậm, căn giữa)
    p_doc_title = doc.add_paragraph()
    p_doc_title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_doc_title.paragraph_format.space_before = Pt(0)
    p_doc_title.paragraph_format.space_after = Pt(4)
    r_doc_title = p_doc_title.add_run(base_name.strip().upper())
    set_run_font_times_new_roman(r_doc_title, size_pt=TOC_TITLE_FONT_SIZE_PT, bold=True)

    # 2. Dòng chữ "MỤC LỤC" (In hoa, in đậm, căn giữa)
    p_toc_title = doc.add_paragraph()
    p_toc_title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_toc_title.paragraph_format.space_before = Pt(0)
    p_toc_title.paragraph_format.space_after = Pt(14)
    r_toc_title = p_toc_title.add_run("MỤC LỤC")
    set_run_font_times_new_roman(r_toc_title, size_pt=TOC_TITLE_FONT_SIZE_PT, bold=True)

    # 3. Các dòng đề mục + Tab Leader chấm bi + Số trang căn phải
    if not headings:
        p_empty = doc.add_paragraph()
        p_empty.alignment = WD_ALIGN_PARAGRAPH.CENTER
        r_empty = p_empty.add_run("(Không tìm thấy đề mục tự động trong tài liệu)")
        set_run_font_times_new_roman(
            r_empty, size_pt=TOC_LEVEL2_FONT_SIZE_PT, bold=False, italic=True
        )
    else:
        for item in headings:
            p_entry = doc.add_paragraph()
            _format_toc_entry_paragraph(p_entry, item, tab_stop_cm=CONTENT_WIDTH_CM)

    output_docx_path = output_docx_path.resolve()
    output_docx_path.parent.mkdir(parents=True, exist_ok=True)
    doc.save(str(output_docx_path))
    return output_docx_path
