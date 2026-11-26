"""
Entry Point (CLI) của Hệ thống Tự động hóa Tạo Mục lục & Đánh số trang Tài liệu (VI/EN).
Hỗ trợ xử lý 1 tệp đơn lẻ (.doc, .docx, .pdf) hoặc xử lý hàng loạt (batch processing) cả thư mục.
"""

import argparse
import logging
import sys
from pathlib import Path
from typing import Optional

from config import OUTPUT_PREFIXES, OUTPUT_SUFFIXES, SUPPORTED_EXTENSIONS
from processors.pdf_processor import process_pdf_file
from processors.word_processor import process_word_file


def setup_logging(verbose: bool = False) -> None:
    """Cấu hình hiển thị log rõ ràng ra màn hình console (UTF-8)."""
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s | %(levelname)-7s | %(message)s",
        datefmt="%H:%M:%S",
    )


def is_generated_output_file(file_path: Path) -> bool:
    """
    Kiểm tra xem tệp tin có phải là tệp kết quả đầu ra của lần chạy trước
    hoặc tệp tạm của MS Word (~$...) hay không để tránh xử lý lặp lại khi chạy Batch.
    """
    name = file_path.name
    if name.startswith("~$"):
        return True
    for prefix in OUTPUT_PREFIXES:
        if name.startswith(prefix):
            return True
    for suffix in OUTPUT_SUFFIXES:
        if name.endswith(suffix):
            return True
    return False


def collect_target_files(input_path: Path, recursive: bool = False) -> list[Path]:
    """Thu thập danh sách các tệp .doc, .docx, .pdf hợp lệ từ đường dẫn đầu vào."""
    if input_path.is_file():
        if input_path.suffix.lower() not in SUPPORTED_EXTENSIONS:
            raise ValueError(
                f"Định dạng tệp '{input_path.suffix}' không được hỗ trợ. "
                f"Chỉ hỗ trợ: {', '.join(SUPPORTED_EXTENSIONS)}"
            )
        return [input_path]

    if input_path.is_dir():
        iterator = input_path.rglob("*") if recursive else input_path.iterdir()
        files: list[Path] = []
        for p in sorted(iterator):
            if (
                p.is_file()
                and p.suffix.lower() in SUPPORTED_EXTENSIONS
                and not is_generated_output_file(p)
            ):
                files.append(p)
        return files

    raise FileNotFoundError(f"Đường dẫn không tồn tại: {input_path}")


def dispatch_single_file(file_path: Path, output_dir: Optional[Path] = None) -> list[Path]:
    """Phân luồng tự động (Luồng A cho Word, Luồng B cho PDF) dựa trên phần mở rộng tệp."""
    ext = file_path.suffix.lower()
    if ext in (".doc", ".docx"):
        out_docx, out_pdf = process_word_file(file_path, output_dir=output_dir)
        return [out_docx, out_pdf]
    if ext == ".pdf":
        toc_docx, toc_pdf, merged_pdf = process_pdf_file(file_path, output_dir=output_dir)
        return [toc_docx, toc_pdf, merged_pdf]
    raise ValueError(f"Định dạng không hỗ trợ: {ext}")


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="doc_toc_automator",
        description="Hệ thống Tự động hóa Tạo Mục lục & Đánh số trang Tài liệu Word/PDF (VI/EN).",
    )
    parser.add_argument(
        "input_path",
        type=str,
        help="Đường dẫn tới 1 tệp tin (.doc, .docx, .pdf) hoặc 1 thư mục cần xử lý hàng loạt.",
    )
    parser.add_argument(
        "-o",
        "--output-dir",
        type=str,
        default=None,
        help="Thư mục lưu kết quả đầu ra (mặc định: lưu cùng thư mục với tệp gốc).",
    )
    parser.add_argument(
        "-r",
        "--recursive",
        action="store_true",
        help="Quét đệ quy các thư mục con khi truyền vào một thư mục.",
    )
    parser.add_argument(
        "-v",
        "--verbose",
        action="store_true",
        help="Hiển thị thông tin log chi tiết (DEBUG).",
    )
    return parser


def main(argv: Optional[list[str]] = None) -> int:
    parser = build_arg_parser()
    args = parser.parse_args(argv)
    setup_logging(verbose=args.verbose)
    logger = logging.getLogger("main")

    input_path = Path(args.input_path).resolve()
    output_dir = Path(args.output_dir).resolve() if args.output_dir else None

    try:
        target_files = collect_target_files(input_path, recursive=args.recursive)
    except Exception as exc:
        logger.error("Lỗi đầu vào: %s", exc)
        return 1

    if not target_files:
        logger.warning("Không tìm thấy tệp (.doc, .docx, .pdf) nào cần xử lý tại: %s", input_path)
        return 0

    logger.info("Tìm thấy %d tệp cần xử lý.", len(target_files))
    success_count = 0
    failed_files: list[tuple[Path, str]] = []

    for idx, file_path in enumerate(target_files, start=1):
        logger.info("[%d/%d] Đang xử lý: %s", idx, len(target_files), file_path.name)
        try:
            outputs = dispatch_single_file(file_path, output_dir=output_dir)
            success_count += 1
            for out_p in outputs:
                logger.info("   -> Đầu ra: %s", out_p)
        except Exception as exc:
            logger.exception("Lỗi khi xử lý tệp '%s': %s", file_path.name, exc)
            failed_files.append((file_path, str(exc)))

    logger.info("============================================================")
    logger.info(
        "HOÀN TẤT: Thành công %d/%d tệp.",
        success_count,
        len(target_files),
    )
    if failed_files:
        logger.warning("Danh sách %d tệp gặp lỗi:", len(failed_files))
        for f_path, err in failed_files:
            logger.warning(" - %s: %s", f_path.name, err)
        return 2

    return 0


if __name__ == "__main__":
    sys.exit(main())
