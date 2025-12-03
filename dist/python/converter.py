#!/usr/bin/env python3
"""
PDF Converter - Unified CLI entry point.
Receives JSON input and returns JSON output.

Usage:
    python converter.py '{"action":"pdf_to_docx","pdf_path":"/path/to/file.pdf"}'
"""
import sys
import os
import json
from PyPDF2 import PdfReader

# Import converter modules
import pdf_to_docx
import pdf_to_excel
import pdf_to_ppt
import pdf_to_jpg
import pdf_to_jpg_fast

# Maximum file size: 100MB
MAX_FILE_SIZE = 100 * 1024 * 1024


def check_pdf_validity(pdf_path: str) -> tuple[dict | None, str]:
    """
    Check if PDF file is valid, not encrypted, and within size limit.

    For Cherry Studio compatibility: tries to resolve relative paths and common upload directories.

    Returns:
        (error_dict, resolved_path): error dict or None, and resolved file path
    """
    original_path = pdf_path

    # Cherry Studio compatibility: try to resolve the file path
    if not os.path.exists(pdf_path):
        # Try common Cherry Studio upload directories and relative paths
        possible_paths = [
            pdf_path,  # Original path
            os.path.join(os.getcwd(), pdf_path),  # Current working directory
            os.path.join(os.getcwd(), "uploads", pdf_path),  # Common upload directory
            os.path.join(os.getcwd(), "files", pdf_path),  # Another common directory
            os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "test", pdf_path),  # Test directory
        ]

        # Try each possible path
        resolved_path = None
        for path in possible_paths:
            if os.path.exists(path):
                resolved_path = path
                break

        if resolved_path is None:
            return ({"success": False, "error": f"File not found: {pdf_path}. Searched in: {', '.join(possible_paths[:3])}..."}, original_path)

        # Update the path to the resolved one for further processing
        pdf_path = resolved_path

    # Check file size
    file_size = os.path.getsize(pdf_path)
    if file_size > MAX_FILE_SIZE:
        size_mb = file_size / (1024 * 1024)
        return ({
            "success": False,
            "error": f"File size ({size_mb:.1f}MB) exceeds maximum limit (100MB)"
        }, pdf_path)

    # Check if PDF is encrypted or corrupted
    try:
        reader = PdfReader(pdf_path)
        if reader.is_encrypted:
            return ({
                "success": False,
                "error": "PDF is encrypted and cannot be converted. Please provide an unencrypted PDF."
            }, pdf_path)
        # Try to access pages to verify PDF is not corrupted
        _ = len(reader.pages)
    except Exception as e:
        error_msg = str(e).lower()
        if "encrypt" in error_msg:
            return ({
                "success": False,
                "error": "PDF is encrypted and cannot be converted. Please provide an unencrypted PDF."
            }, pdf_path)
        return ({
            "success": False,
            "error": f"PDF appears to be corrupted or invalid: {str(e)}"
        }, pdf_path)

    return (None, pdf_path)


def process_request(request: dict) -> dict:
    """
    Process a conversion request.

    Args:
        request: dict with 'action', 'pdf_path', and optional 'output_path'

    Returns:
        dict with conversion result
    """
    action = request.get("action")
    pdf_path = request.get("pdf_path")
    output_path = request.get("output_path")

    if not action:
        return {"success": False, "error": "Missing 'action' parameter"}

    if not pdf_path:
        return {"success": False, "error": "Missing 'pdf_path' parameter"}

    # Validate PDF file and get resolved path
    validation_error, resolved_pdf_path = check_pdf_validity(pdf_path)
    if validation_error:
        return validation_error

    # Use resolved path for conversion
    pdf_path = resolved_pdf_path

    # Route to appropriate converter
    converters = {
        "pdf_to_docx": pdf_to_docx.convert,
        "pdf_to_excel": pdf_to_excel.convert,
        "pdf_to_ppt": pdf_to_ppt.convert,
        "pdf_to_jpg": pdf_to_jpg.convert,
        "pdf_to_jpg_fast": pdf_to_jpg_fast.convert,
    }

    converter = converters.get(action)
    if not converter:
        return {
            "success": False,
            "error": f"Unknown action: {action}. Available actions: {', '.join(converters.keys())}"
        }

    # Execute conversion
    try:
        # Special handling for specific converters with extra parameters
        if action == "pdf_to_docx" and request.get("fast_mode"):
            result = converter(pdf_path, output_path, fast_mode=True)
        elif action == "pdf_to_excel":
            pages = request.get("pages", "all")
            use_ocr = request.get("use_ocr", False)  # Default to False for speed
            result = converter(pdf_path, output_path, pages=pages, use_ocr=use_ocr)
        elif action == "pdf_to_ppt" and request.get("dpi"):
            result = converter(pdf_path, output_path, request.get("dpi"))
        elif action == "pdf_to_jpg":
            # Use fast version for large files or when specified
            dpi = request.get("dpi", 72)
            quality = request.get("quality", 85)

            # For files > 10MB or DPI < 72, use fast version
            import os
            file_size = os.path.getsize(pdf_path)
            if file_size > 10 * 1024 * 1024 or dpi < 72:
                result = pdf_to_jpg_fast.convert(pdf_path, output_path, dpi, quality)
            else:
                result = converter(pdf_path, output_path, dpi)
        else:
            result = converter(pdf_path, output_path)
        return result
    except Exception as e:
        return {
            "success": False,
            "error": f"Conversion failed: {str(e)}"
        }


def main():
    """
    Main entry point.
    """
    # Read JSON from stdin
    input_data = sys.stdin.read().strip()

    if not input_data:
        result = {"success": False, "error": "No input provided"}
    else:
        try:
            request = json.loads(input_data)
            result = process_request(request)
        except json.JSONDecodeError:
            result = {"success": False, "error": "Invalid JSON input"}
        except Exception as e:
            result = {"success": False, "error": f"Unexpected error: {str(e)}"}

    # Output JSON result
    print(json.dumps(result))


if __name__ == "__main__":
    main()