# Optional: Tesseract baseline for comparison (requires pytesseract + tesseract binary installed)
# Useful on simpler CAPTCHAs; typically needs good binarization and deskew.

from typing import Dict, Any
import pytesseract  # type: ignore
from scripts.preprocess import preprocess_pipeline


def predict_tesseract(image_path: str) -> Dict[str, Any]:
    prep = preprocess_pipeline(image_path, method="otsu")
    # Tesseract works better with non-inverted text; invert if necessary
    bin_for_ocr = 255 - prep["deskew"]
    # Restrict character set to improve accuracy
    custom_oem_psm_config = r'--oem 1 --psm 7 -c tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    text = pytesseract.image_to_string(bin_for_ocr, config=custom_oem_psm_config)
    text = text.strip().replace(" ", "")
    # Tesseract doesn't provide a direct confidence here;  set a heuristic placeholder or 0.0
    return {"text": text, "confidence": 0.0, "debug": {"note": "Tesseract no direct confidence in this path"}}
