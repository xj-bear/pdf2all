"""
PDF to Excel converter module.
Uses pdfplumber to extract tables from PDF (no Java required).
Includes OCR support for image-based tables using RapidOCR (pure Python, no external dependencies).
"""
import os
import pdfplumber
import pandas as pd
import fitz  # PyMuPDF
from PIL import Image
import io
import numpy as np
import concurrent.futures
import multiprocessing

# OCR support using RapidOCR (pure Python, no Tesseract needed)
try:
    from rapidocr import RapidOCR
    OCR_AVAILABLE = True
except ImportError:
    OCR_AVAILABLE = False


def process_single_page_ocr(args):
    """
    Process a single page with OCR.
    Args must be a tuple (pdf_path, page_num) to be pickleable for multiprocessing.
    """
    pdf_path, page_num = args
    
    try:
        # Re-initialize OCR engine in each process
        ocr = RapidOCR()
        
        doc = fitz.open(pdf_path)
        if page_num < 0 or page_num >= len(doc):
            doc.close()
            return None
            
        page = doc[page_num]

        # Render page to image at higher resolution for better OCR
        mat = fitz.Matrix(2, 2)  # 2x zoom for better quality
        pix = page.get_pixmap(matrix=mat)

        # Convert to PIL Image
        img_data = pix.tobytes("png")
        img = Image.open(io.BytesIO(img_data))

        # Convert to numpy array for RapidOCR
        img_array = np.array(img)
        
        # Run OCR
        result = ocr(img_array)
        doc.close()

        if result is None or len(result) == 0:
            return None

        # RapidOCR returns: (text_boxes, scores) or list of [box, text, score]
        ocr_results = result[0] if isinstance(result, tuple) else result

        if not ocr_results:
            return None

        # Group text by lines based on y position (top of bounding box)
        lines = {}
        for item in ocr_results:
            if isinstance(item, (list, tuple)) and len(item) >= 2:
                # Format: [box_points, text, score] or similar
                box = item[0]  # [[x1,y1], [x2,y2], [x3,y3], [x4,y4]]
                text = item[1] if len(item) > 1 else ""

                if not text or not text.strip():
                    continue

                # Get top-left y coordinate for line grouping
                if isinstance(box, (list, tuple)) and len(box) >= 4:
                    top_y = min(box[0][1], box[1][1]) if isinstance(box[0], (list, tuple)) else box[1]
                    left_x = min(box[0][0], box[3][0]) if isinstance(box[0], (list, tuple)) else box[0]
                else:
                    continue

                # Group by approximate line (within 20 pixels)
                line_key = int(top_y) // 25 * 25
                if line_key not in lines:
                    lines[line_key] = []
                lines[line_key].append({
                    'text': text.strip(),
                    'left': left_x
                })

        if not lines:
            return None

        # Sort lines by y position
        sorted_lines = sorted(lines.items())

        # Detect columns based on x positions
        all_lefts = []
        for _, words in sorted_lines:
            for word in words:
                all_lefts.append(word['left'])

        if not all_lefts:
            return None

        # Cluster x positions to find columns
        all_lefts = sorted(set(all_lefts))
        col_positions = [all_lefts[0]]
        for left in all_lefts[1:]:
            if left - col_positions[-1] > 80:  # New column if gap > 80px
                col_positions.append(left)

        # Build table rows
        table_data = []
        for _, words in sorted_lines:
            # Sort words by x position
            words = sorted(words, key=lambda w: w['left'])
            row = [''] * len(col_positions)
            for word in words:
                # Find which column this word belongs to
                col_idx = 0
                for i, col_pos in enumerate(col_positions):
                    if word['left'] >= col_pos - 40:
                        col_idx = i
                if col_idx < len(row):
                    if row[col_idx]:
                        row[col_idx] += ' ' + word['text']
                    else:
                        row[col_idx] = word['text']
            if any(cell.strip() for cell in row):
                table_data.append(row)

        if len(table_data) > 1:  # Need at least header + 1 data row
            # Use first row as header
            headers = table_data[0] if table_data[0] else [f"Col{i+1}" for i in range(len(col_positions))]
            df = pd.DataFrame(table_data[1:], columns=headers)
            return {
                "page": page_num + 1,
                "data": df,
                "source": "ocr"
            }
            
        return None
        
    except Exception as e:
        # If OCR fails for this page, return None
        return None


def extract_tables_with_ocr(pdf_path: str, pages_to_process: list) -> list:
    """
    Extract tables from PDF using OCR for image-based content.
    Uses RapidOCR which is pure Python and requires no external dependencies.
    Parallelized for performance.

    Args:
        pdf_path: Path to the PDF file
        pages_to_process: List of page indices to process

    Returns:
        List of extracted tables with page info
    """
    if not OCR_AVAILABLE:
        return []

    tables = []
    
    # Prepare arguments for parallel processing
    process_args = [(pdf_path, page_num) for page_num in pages_to_process]
    
    # Use ProcessPoolExecutor for parallel processing
    # Limit workers to avoid memory issues, but at least 2
    max_workers = min(multiprocessing.cpu_count(), 4)
    
    with concurrent.futures.ProcessPoolExecutor(max_workers=max_workers) as executor:
        results = list(executor.map(process_single_page_ocr, process_args))
        
    # Filter out None results
    for result in results:
        if result:
            tables.append(result)
            
    return tables


def convert(pdf_path: str, output_path: str | None = None, pages: str = "all", use_ocr: bool = False) -> dict:
    """
    Convert PDF tables to Excel format.

    Args:
        pdf_path: Path to the input PDF file
        output_path: Optional output path. If not provided, uses same directory as PDF.
        pages: Pages to extract tables from. Default is "all".
        use_ocr: Whether to use OCR for image-based tables. Default is False (faster).

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
            output_path = f"{base_name}.xlsx"

        # Ensure output directory exists
        output_dir = os.path.dirname(output_path)
        if output_dir and not os.path.exists(output_dir):
            os.makedirs(output_dir)

        tables = []

        # Extract tables from PDF using pdfplumber
        with pdfplumber.open(pdf_path) as pdf:
            # Determine which pages to process
            if pages == "all":
                pages_to_process = list(range(len(pdf.pages)))
            else:
                # Parse page numbers (e.g., "1,2,3" or "1-3")
                pages_to_process = []
                for part in str(pages).split(","):
                    part = part.strip()
                    if "-" in part:
                        start, end = part.split("-")
                        pages_to_process.extend(range(int(start) - 1, int(end)))
                    else:
                        try:
                            pages_to_process.append(int(part) - 1)
                        except ValueError:
                            pass # Ignore invalid page numbers

            for page_num in pages_to_process:
                if page_num < 0 or page_num >= len(pdf.pages):
                    continue

                page = pdf.pages[page_num]
                page_tables = page.extract_tables()

                for table in page_tables:
                    if table and len(table) > 0:
                        # Convert to DataFrame
                        # Use first row as header if it looks like a header
                        df = pd.DataFrame(table[1:], columns=table[0] if table[0] else None)
                        tables.append({
                            "page": page_num + 1,
                            "data": df,
                            "source": "pdfplumber"
                        })

        # If no tables found and OCR is available and enabled, try OCR
        if not tables and use_ocr and OCR_AVAILABLE:
            try:
                # Re-determine pages_to_process for OCR (need to close pdfplumber first)
                with pdfplumber.open(pdf_path) as pdf:
                    if pages == "all":
                        pages_to_process = list(range(len(pdf.pages)))
                    else:
                        # Re-parse logic or just reuse existing pages_to_process if valid
                        pass 

                tables = extract_tables_with_ocr(pdf_path, pages_to_process)
            except Exception as e:
                # OCR failed, continue with empty tables
                print(f"OCR failed: {e}")
                pass

        if not tables:
            error_msg = "No tables found in the PDF"
            if not OCR_AVAILABLE and use_ocr:
                error_msg += ". OCR is not available - install rapidocr_onnxruntime for image-based table extraction."
            elif not use_ocr:
                error_msg += ". Try enabling OCR with use_ocr=true for image-based tables."
            return {
                "success": False,
                "error": error_msg
            }

        # Write tables to Excel (each table as a separate sheet)
        with pd.ExcelWriter(output_path, engine='openpyxl') as writer:
            for i, table_info in enumerate(tables):
                sheet_name = f"Page{table_info['page']}_Table{i + 1}"
                # Excel sheet names have a 31 character limit
                sheet_name = sheet_name[:31]
                table_info['data'].to_excel(writer, sheet_name=sheet_name, index=False)

        ocr_note = ""
        ocr_tables = sum(1 for t in tables if t.get('source') == 'ocr')
        if ocr_tables > 0:
            ocr_note = f" ({ocr_tables} table(s) extracted via OCR)"

        return {
            "success": True,
            "output_path": output_path,
            "message": f"Successfully extracted {len(tables)} table(s) to Excel: {output_path}{ocr_note}",
            "tables_count": len(tables)
        }

    except Exception as e:
        return {
            "success": False,
            "error": f"Conversion failed: {str(e)}"
        }
