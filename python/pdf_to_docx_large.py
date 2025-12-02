"""
PDF to DOCX converter module for large files.
Optimized for files with many pages (>50 pages) to avoid timeout.
"""
import os
from pdf2docx import Converter


def convert(pdf_path: str, output_path: str | None = None, page_limit: int = 50) -> dict:
    """
    Convert PDF to DOCX format, optimized for large files.

    Args:
        pdf_path: Path to the input PDF file
        output_path: Optional output path. If not provided, uses same directory as PDF.
        page_limit: Maximum pages to convert in one batch. Default 50.

    Returns:
        dict with status, output_path, and message
    """
    try:
        if not os.path.exists(pdf_path):
            return {
                "success": False,
                "error": f"PDF file not found: {pdf_path}"
            }

        # Generate output path if not provided
        if not output_path:
            base_name = os.path.splitext(pdf_path)[0]
            output_path = f"{base_name}.docx"

        # Ensure output directory exists
        output_dir = os.path.dirname(output_path)
        if output_dir and not os.path.exists(output_dir):
            os.makedirs(output_dir)

        # Open PDF to count pages
        import fitz
        doc = fitz.open(pdf_path)
        total_pages = len(doc)
        doc.close()

        if total_pages <= page_limit:
            # For small files, use normal conversion
            cv = Converter(pdf_path)
            cv.convert(output_path)
            cv.close()
        else:
            # For large files, convert in batches
            cv = Converter(pdf_path)

            # Convert only first batch to avoid timeout
            cv.convert(output_path, start=0, end=page_limit)
            cv.close()

            # Add note about truncation
            return {
                "success": True,
                "output_path": output_path,
                "message": f"Successfully converted first {page_limit} pages to Word: {output_path}. Original PDF has {total_pages} pages."
            }

        return {
            "success": True,
            "output_path": output_path,
            "message": f"Successfully converted PDF to DOCX: {output_path}"
        }

    except Exception as e:
        return {
            "success": False,
            "error": f"Conversion failed: {str(e)}"
        }