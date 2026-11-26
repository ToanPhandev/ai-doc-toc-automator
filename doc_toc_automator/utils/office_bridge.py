"""
Cầu nối tương tác với Microsoft Word COM (pywin32) hoặc LibreOffice (--headless).
Thực hiện các tác vụ:
1. Chuyển đổi .doc (Word 97-2003) -> .docx
2. Cập nhật toàn bộ trường dữ liệu (Fields.Update / TablesOfContents.Update)
3. Xuất tài liệu .docx sang .pdf chuẩn in ấn.
Có cơ chế Fallback sang PyMuPDF (fitz) nếu máy không cài đặt MS Word hoặc LibreOffice.
"""

import logging
import os
import platform
import shutil
import subprocess
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# Hằng số định dạng của MS Word COM
WD_FORMAT_XML_DOCUMENT = 12  # .docx
WD_FORMAT_PDF = 17  # .pdf


def _find_libreoffice_binary() -> Optional[str]:
    """Tìm đường dẫn thực thi của LibreOffice (soffice) trên hệ thống."""
    for cmd in ("soffice", "libreoffice"):
        found = shutil.which(cmd)
        if found:
            return found

    if platform.system() == "Windows":
        candidates = [
            r"C:\Program Files\LibreOffice\program\soffice.exe",
            r"C:\Program Files (x86)\LibreOffice\program\soffice.exe",
        ]
        for path in candidates:
            if os.path.isfile(path):
                return path
    return None


def _has_ms_word_com() -> bool:
    """Kiểm tra hệ thống Windows có sẵn pywin32 và Microsoft Word COM hay không."""
    if platform.system() != "Windows":
        return False
    try:
        import win32com.client  # type: ignore
        import pythoncom  # type: ignore

        pythoncom.CoInitialize()
        try:
            word = win32com.client.DispatchEx("Word.Application")
            word.Quit()
            return True
        finally:
            pythoncom.CoUninitialize()
    except Exception:
        return False


def convert_doc_to_docx(doc_path: Path, output_docx_path: Optional[Path] = None) -> Path:
    """
    Chuyển đổi tệp .doc (Word 97-2003) sang .docx.
    Ưu tiên MS Word COM trên Windows, sau đó đến LibreOffice headless.
    """
    doc_path = doc_path.resolve()
    if output_docx_path is None:
        output_docx_path = doc_path.with_suffix(".docx")
    else:
        output_docx_path = output_docx_path.resolve()

    logger.info("Đang chuyển đổi tệp .doc sang .docx: %s", doc_path.name)

    # 1. Thử dùng MS Word COM
    if platform.system() == "Windows":
        try:
            import pythoncom  # type: ignore
            import win32com.client  # type: ignore

            pythoncom.CoInitialize()
            word = None
            doc = None
            try:
                word = win32com.client.DispatchEx("Word.Application")
                word.Visible = False
                word.DisplayAlerts = 0
                doc = word.Documents.Open(
                    str(doc_path),
                    ConfirmConversions=False,
                    ReadOnly=True,
                    AddToRecentFiles=False,
                )
                doc.SaveAs2(str(output_docx_path), FileFormat=WD_FORMAT_XML_DOCUMENT)
                logger.info("Đã chuyển đổi .doc -> .docx qua MS Word COM: %s", output_docx_path.name)
                return output_docx_path
            finally:
                if doc is not None:
                    try:
                        doc.Close(False)
                    except Exception:
                        pass
                if word is not None:
                    try:
                        word.Quit()
                    except Exception:
                        pass
                pythoncom.CoUninitialize()
        except Exception as exc:
            logger.warning("MS Word COM không khả dụng khi convert .doc (%s), thử LibreOffice...", exc)

    # 2. Thử dùng LibreOffice (--headless)
    soffice = _find_libreoffice_binary()
    if soffice:
        cmd = [
            soffice,
            "--headless",
            "--convert-to",
            "docx",
            "--outdir",
            str(output_docx_path.parent),
            str(doc_path),
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, check=False)
        converted_candidate = output_docx_path.parent / f"{doc_path.stem}.docx"
        if result.returncode == 0 and converted_candidate.exists():
            if converted_candidate != output_docx_path:
                shutil.move(str(converted_candidate), str(output_docx_path))
            logger.info("Đã chuyển đổi .doc -> .docx qua LibreOffice: %s", output_docx_path.name)
            return output_docx_path
        raise RuntimeError(f"LibreOffice convert .doc thất bại: {result.stderr}")

    raise RuntimeError(
        "Không tìm thấy Microsoft Word hoặc LibreOffice để chuyển đổi định dạng .doc (Word 97-2003)."
    )


def update_fields_and_export_pdf(
    docx_path: Path,
    pdf_path: Path,
    update_toc_fields: bool = True,
) -> Path:
    """
    Mở tệp .docx, cập nhật toàn bộ trường dữ liệu (TOC, Page Number) và xuất ra tệp .pdf.
    - Ưu tiên 1: MS Word COM (win32com) -> Cập nhật chính xác Fields.Update() & TablesOfContents.Update().
    - Ưu tiên 2: LibreOffice (--headless).
    - Ưu tiên 3 (Fallback an toàn): Kết xuất PDF chuẩn A4 Unicode Tiếng Việt bằng PyMuPDF.
    """
    docx_path = docx_path.resolve()
    pdf_path = pdf_path.resolve()

    # 1. Ưu tiên MS Word COM trên Windows
    if platform.system() == "Windows":
        try:
            import pythoncom  # type: ignore
            import win32com.client  # type: ignore

            pythoncom.CoInitialize()
            word = None
            doc = None
            try:
                word = win32com.client.DispatchEx("Word.Application")
                word.Visible = False
                word.DisplayAlerts = 0

                doc = word.Documents.Open(
                    str(docx_path),
                    ConfirmConversions=False,
                    ReadOnly=False,
                    AddToRecentFiles=False,
                )

                if update_toc_fields:
                    # Cập nhật lại bố cục trang trước khi tính số trang TOC
                    doc.Repaginate()
                    doc.Fields.Update()
                    if doc.TablesOfContents.Count >= 1:
                        for i in range(1, doc.TablesOfContents.Count + 1):
                            doc.TablesOfContents(i).Update()
                    # Cập nhật cả trường PAGE trong Header/Footer của mọi Section
                    for section in doc.Sections:
                        for footer in section.Footers:
                            footer.Range.Fields.Update()
                        for header in section.Headers:
                            header.Range.Fields.Update()
                    doc.Save()

                doc.ExportAsFixedFormat(
                    OutputFileName=str(pdf_path),
                    ExportFormat=WD_FORMAT_PDF,
                    OpenAfterExport=False,
                    OptimizeFor=0,  # wdExportOptimizeForPrint (chất lượng in ấn cao nhất)
                    CreateBookmarks=1,  # wdExportCreateHeadingBookmarks
                )
                logger.info("Đã cập nhật Fields và xuất PDF qua MS Word COM: %s", pdf_path.name)
                return pdf_path
            finally:
                if doc is not None:
                    try:
                        doc.Close(SaveChanges=False)
                    except Exception:
                        pass
                if word is not None:
                    try:
                        word.Quit()
                    except Exception:
                        pass
                pythoncom.CoUninitialize()
        except Exception as exc:
            logger.warning(
                "MS Word COM không khả dụng (%s). Chuyển sang phương án dự phòng...",
                exc,
            )

    # 2. Thử LibreOffice (--headless)
    soffice = _find_libreoffice_binary()
    if soffice:
        try:
            temp_out_dir = pdf_path.parent
            cmd = [
                soffice,
                "--headless",
                "--convert-to",
                "pdf:writer_pdf_Export",
                "--outdir",
                str(temp_out_dir),
                str(docx_path),
            ]
            result = subprocess.run(cmd, capture_output=True, text=True, check=False)
            generated_pdf = temp_out_dir / f"{docx_path.stem}.pdf"
            if result.returncode == 0 and generated_pdf.exists():
                if generated_pdf.resolve() != pdf_path.resolve():
                    if pdf_path.exists():
                        pdf_path.unlink()
                    shutil.move(str(generated_pdf), str(pdf_path))
                logger.info("Đã xuất PDF qua LibreOffice Headless: %s", pdf_path.name)
                return pdf_path
        except Exception as exc:
            logger.warning("LibreOffice xuất PDF thất bại (%s). Dùng trình dựng PDF dự phòng...", exc)

    # 3. Fallback kết xuất PDF trực tiếp bằng PyMuPDF (hỗ trợ đầy đủ Times New Roman Unicode)
    logger.info("Sử dụng bộ dựng PDF nội bộ (PyMuPDF Unicode) để xuất: %s", pdf_path.name)
    return _fallback_render_docx_to_pdf(docx_path, pdf_path, draw_page_numbers=update_toc_fields)


def _fallback_render_docx_to_pdf(
    docx_path: Path,
    pdf_path: Path,
    draw_page_numbers: bool = False,
) -> Path:
    """
    Trình dựng PDF dự phòng bằng PyMuPDF & python-docx trong trường hợp máy chạy
    không cài đặt MS Word hoặc LibreOffice. Hỗ trợ đầy đủ Times New Roman UTF-8,
    Tab Leader chấm bi (.........) và số trang căn giữa chân trang.
    """
    import fitz  # PyMuPDF
    from docx import Document

    document = Document(str(docx_path))
    pdf_doc = fitz.open()

    # Kích thước trang A4 tính bằng point (595.28 x 841.89 pt)
    page_w, page_h = fitz.paper_size("a4")
    margin_left = 85.0  # ~3.0 cm
    margin_right = 56.7  # ~2.0 cm
    margin_top = 56.7  # ~2.0 cm
    margin_bottom = 56.7  # ~2.0 cm
    usable_w = page_w - margin_left - margin_right

    # Tìm font Times New Roman trên hệ thống để hiển thị đúng tiếng Việt
    regular_font_path: Optional[str] = None
    bold_font_path: Optional[str] = None
    win_fonts = Path(r"C:\Windows\Fonts")
    if (win_fonts / "times.ttf").exists():
        regular_font_path = str(win_fonts / "times.ttf")
    if (win_fonts / "timesbd.ttf").exists():
        bold_font_path = str(win_fonts / "timesbd.ttf")

    font_reg = fitz.Font(fontfile=regular_font_path) if regular_font_path else fitz.Font("tiro")
    font_bold = fitz.Font(fontfile=bold_font_path) if bold_font_path else fitz.Font("tibo")

    def _new_page() -> fitz.Page:
        p = pdf_doc.new_page(width=page_w, height=page_h)
        if regular_font_path:
            p.insert_font(fontname="TNR", fontfile=regular_font_path)
        if bold_font_path:
            p.insert_font(fontname="TNRB", fontfile=bold_font_path)
        return p

    page = _new_page()
    y_cursor = margin_top + 16.0
    reg_name = "TNR" if regular_font_path else "tiro"
    bold_name = "TNRB" if bold_font_path else "tibo"

    for para in document.paragraphs:
        raw_text = para.text
        # Kiểm tra ngắt trang cứng trong đoạn
        has_page_break = any(
            "w:br" in run._element.xml and 'w:type="page"' in run._element.xml
            for run in para.runs
        )

        if not raw_text.strip():
            if has_page_break:
                page = _new_page()
                y_cursor = margin_top + 16.0
            else:
                y_cursor += 8.0
            continue

        is_bold = (
            (para.style and "Heading" in para.style.name)
            or any(run.bold for run in para.runs if run.text.strip())
        )
        font_obj = font_bold if is_bold else font_reg
        font_tag = bold_name if is_bold else reg_name
        fontsize = 13.5 if is_bold else 13.0
        line_height = fontsize * 1.45

        # Xử lý dòng mục lục có ký tự Tab (\t) nối với số trang ở lề phải
        if "\t" in raw_text:
            left_part, right_part = raw_text.rsplit("\t", 1)
            left_part = left_part.strip()
            right_part = right_part.strip()

            indent_x = margin_left + (17.0 if not is_bold else 0.0)
            max_title_w = usable_w - (indent_x - margin_left) - 42.0

            # Tự động ngắt dòng (wrap text) nếu tên đề mục quá dài
            words = left_part.split(" ")
            lines: list[str] = []
            current_line = ""
            for w in words:
                candidate = f"{current_line} {w}".strip() if current_line else w
                if font_obj.text_length(candidate, fontsize=fontsize) <= max_title_w:
                    current_line = candidate
                else:
                    if current_line:
                        lines.append(current_line)
                    current_line = w
            if current_line:
                lines.append(current_line)

            for idx_line, line_str in enumerate(lines):
                if y_cursor + line_height > page_h - margin_bottom:
                    page = _new_page()
                    y_cursor = margin_top + 16.0

                page.insert_text(
                    fitz.Point(indent_x, y_cursor),
                    line_str,
                    fontname=font_tag,
                    fontsize=fontsize,
                )

                # Dòng cuối cùng của đề mục: vẽ chấm bi (Tab Leader) và số trang căn phải
                if idx_line == len(lines) - 1 and right_part:
                    text_end_x = indent_x + font_obj.text_length(line_str, fontsize=fontsize) + 6.0
                    page_num_w = font_obj.text_length(right_part, fontsize=fontsize)
                    right_x = page_w - margin_right - page_num_w
                    dot_end_x = right_x - 6.0

                    if dot_end_x > text_end_x:
                        dot_unit = " ."
                        dot_w = font_reg.text_length(dot_unit, fontsize=fontsize)
                        num_dots = max(0, int((dot_end_x - text_end_x) / max(dot_w, 1.0)))
                        dots_str = dot_unit * num_dots
                        page.insert_text(
                            fitz.Point(text_end_x, y_cursor),
                            dots_str,
                            fontname=reg_name,
                            fontsize=fontsize,
                        )

                    page.insert_text(
                        fitz.Point(right_x, y_cursor),
                        right_part,
                        fontname=font_tag,
                        fontsize=fontsize,
                    )

                y_cursor += line_height
        else:
            # Đoạn văn bản thường hoặc tiêu đề căn giữa
            is_centered = para.alignment == 1  # WD_ALIGN_PARAGRAPH.CENTER
            words = raw_text.strip().split(" ")
            lines = []
            current_line = ""
            for w in words:
                candidate = f"{current_line} {w}".strip() if current_line else w
                if font_obj.text_length(candidate, fontsize=fontsize) <= usable_w:
                    current_line = candidate
                else:
                    if current_line:
                        lines.append(current_line)
                    current_line = w
            if current_line:
                lines.append(current_line)

            for line_str in lines:
                if y_cursor + line_height > page_h - margin_bottom:
                    page = _new_page()
                    y_cursor = margin_top + 16.0

                x_pos = margin_left
                if is_centered:
                    line_w = font_obj.text_length(line_str, fontsize=fontsize)
                    x_pos = margin_left + max(0.0, (usable_w - line_w) / 2.0)

                page.insert_text(
                    fitz.Point(x_pos, y_cursor),
                    line_str,
                    fontname=font_tag,
                    fontsize=fontsize,
                )
                y_cursor += line_height

        y_cursor += 4.0
        if has_page_break:
            page = _new_page()
            y_cursor = margin_top + 16.0

    # Vẽ số trang ở chính giữa chân trang nếu được yêu cầu (Luồng A fallback)
    if draw_page_numbers:
        for idx, p in enumerate(pdf_doc, start=1):
            num_str = str(idx)
            num_w = font_reg.text_length(num_str, fontsize=11.0)
            p.insert_text(
                fitz.Point((page_w - num_w) / 2.0, page_h - 28.0),
                num_str,
                fontname=reg_name,
                fontsize=11.0,
            )

    pdf_doc.save(str(pdf_path))
    pdf_doc.close()
    return pdf_path
