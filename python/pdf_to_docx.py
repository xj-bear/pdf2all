"""
PDF to DOCX converter module.
Uses pdf2docx library to preserve formatting, tables, and images.
"""
import os
from pdf2docx import Converter


def convert(pdf_path: str, output_path: str | None = None, fast_mode: bool = False) -> dict:
    """
    Convert PDF to DOCX format.

    Args:
        pdf_path: Path to the input PDF file
        output_path: Optional output path. If not provided, uses same directory as PDF.
        fast_mode: If True, uses faster but less accurate conversion settings

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

        # Convert PDF to DOCX with performance options
        cv = Converter(pdf_path)

        if fast_mode:
            # Fast mode: use multi-processing for better performance
            import multiprocessing
            cpu_count = min(multiprocessing.cpu_count(), 4)  # Limit to 4 cores max
            cv.convert(output_path, start=0, end=None, pages=None,
                      multi_processing=True, cpu_count=cpu_count)
        else:
            # Normal mode: full conversion with all features
            cv.convert(output_path)

        cv.close()

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