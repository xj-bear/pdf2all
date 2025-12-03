"""
PDF to JPG converter module.
Converts each PDF page to a JPG image using PyMuPDF.
"""
import os
import fitz  # PyMuPDF


def convert(pdf_path: str, output_path: str | None = None, dpi: int = 72) -> dict:
    """
    Convert PDF pages to JPG images.

    Args:
        pdf_path: Path to the input PDF file
        output_path: Optional output directory or file path pattern.
                    If not provided, uses same directory as PDF.
        dpi: Image resolution. Default is 72 for web standard.

    Returns:
        dict with status, output_paths, and message
    """
    try:
        if not os.path.exists(pdf_path):
            return {
                "success": False,
                "error": f"PDF file not found: {pdf_path}"
            }

        # Determine output directory and filename pattern
        if not output_path:
            base_name = os.path.splitext(pdf_path)[0]
            output_dir = os.path.dirname(pdf_path) or "."
            file_prefix = os.path.basename(base_name)
        elif os.path.isdir(output_path) or output_path.endswith(os.sep):
            output_dir = output_path
            file_prefix = os.path.splitext(os.path.basename(pdf_path))[0]
        else:
            output_dir = os.path.dirname(output_path) or "."
            file_prefix = os.path.splitext(os.path.basename(output_path))[0]

        # Ensure output directory exists
        if not os.path.exists(output_dir):
            os.makedirs(output_dir)

        # Open PDF with PyMuPDF
        doc = fitz.open(pdf_path)
        page_count = len(doc)

        if page_count == 0:
            doc.close()
            return {
                "success": False,
                "error": "PDF has no pages"
            }

        output_paths = []

        # Calculate zoom factor based on DPI (72 is default PDF DPI)
        zoom = dpi / 72.0
        matrix = fitz.Matrix(zoom, zoom)

        # Convert each page to JPG
        for i in range(page_count):
            page = doc[i]
            pix = page.get_pixmap(matrix=matrix)

            if page_count == 1:
                img_path = os.path.join(output_dir, f"{file_prefix}.jpg")
            else:
                img_path = os.path.join(output_dir, f"{file_prefix}_{i + 1}.jpg")

            # Save as JPEG
            pix.save(img_path)
            output_paths.append(img_path)

        doc.close()

        return {
            "success": True,
            "output_paths": output_paths,
            "message": f"Successfully converted {page_count} page(s) to JPG",
            "pages_count": page_count
        }

    except Exception as e:
        return {
            "success": False,
            "error": f"Conversion failed: {str(e)}"
        }
