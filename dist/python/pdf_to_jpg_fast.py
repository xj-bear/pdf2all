"""
PDF to JPG converter module with fast mode.
Optimized for large files and Cherry Studio compatibility.
"""
import os
import fitz  # PyMuPDF
from PIL import Image
import io
import sys


def convert(pdf_path: str, output_path: str | None = None, dpi: int = 72, quality: int = 85) -> dict:
    """
    Convert PDF pages to JPG images with optimization options.

    Args:
        pdf_path: Path to the input PDF file
        output_path: Optional output directory or file path pattern. If not provided, saves alongside the PDF.
        dpi: Image resolution (36-300 DPI). Lower values = faster conversion. Default: 72 (web standard)
        quality: JPEG quality (1-95). Lower values = smaller files, faster conversion. Default: 85

    Returns:
        dict with status, output_paths, and message
    """
    try:
        if not os.path.exists(pdf_path):
            return {
                "success": False,
                "error": f"PDF file not found: {pdf_path}"
            }

        # Open PDF
        doc = fitz.open(pdf_path)
        page_count = len(doc)

        if page_count == 0:
            doc.close()
            return {
                "success": False,
                "error": "PDF has no pages"
            }

        # Generate output directory and file pattern if not provided
        if not output_path:
            base_name = os.path.splitext(pdf_path)[0]
            output_dir = os.path.dirname(pdf_path)
            output_pattern = os.path.join(output_dir, f"{os.path.basename(base_name)}_page_{{}}.jpg")
        elif os.path.isdir(output_path):
            # If output_path is a directory, use it with default pattern
            base_name = os.path.splitext(os.path.basename(pdf_path))[0]
            output_pattern = os.path.join(output_path, f"{base_name}_page_{{}}.jpg")
        else:
            # If output_path contains placeholder, use it as pattern
            if "{}" in output_path:
                output_pattern = output_path
            else:
                # If it's a file path, extract directory and create pattern
                output_dir = os.path.dirname(output_path)
                base_name = os.path.splitext(os.path.basename(output_path))[0]
                output_pattern = os.path.join(output_dir, f"{base_name}_page_{{}}.jpg")

        # Ensure output directory exists
        output_dir = os.path.dirname(output_pattern.format(1))
        if output_dir and not os.path.exists(output_dir):
            os.makedirs(output_dir)

        # Calculate zoom factor based on DPI
        zoom = dpi / 72.0
        matrix = fitz.Matrix(zoom, zoom)

        # Process pages with optimizations
        output_paths = []
        batch_size = 5  # Process 5 pages at a time for progress feedback

        for i in range(page_count):
            try:
                page = doc[i]

                # Optimize rendering for speed
                pix = page.get_pixmap(
                    matrix=matrix,
                    alpha=False,  # No alpha channel for faster processing
                    colorspace=fitz.csRGB,
                    annots=False  # Skip annotations for speed
                )

                # Convert to PIL Image and save as JPG with compression
                img_data = pix.tobytes("png")
                img = Image.open(io.BytesIO(img_data))

                # Convert to RGB if needed
                if img.mode != 'RGB':
                    img = img.convert('RGB')

                # Save as JPG with specified quality
                output_file = output_pattern.format(i + 1)
                img.save(output_file, 'JPEG', quality=quality, optimize=True)
                output_paths.append(output_file)

                # Print progress for large files
                if (i + 1) % batch_size == 0 or i == page_count - 1:
                    print(f"[INFO] Converted {i + 1}/{page_count} pages to JPG", file=sys.stderr, flush=True)

                # Clean up
                pix = None
                img = None

            except Exception as e:
                # If a page fails, continue with next page
                print(f"[WARNING] Failed to convert page {i+1}: {str(e)}", file=sys.stderr, flush=True)
                continue

        doc.close()

        if not output_paths:
            return {
                "success": False,
                "error": "No pages were successfully converted"
            }

        return {
            "success": True,
            "output_paths": output_paths,
            "message": f"Successfully converted {len(output_paths)} page(s) to JPG images",
            "pages_converted": len(output_paths),
            "total_pages": page_count
        }

    except Exception as e:
        return {
            "success": False,
            "error": f"Conversion failed: {str(e)}"
        }