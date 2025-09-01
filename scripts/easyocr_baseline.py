# Optional: EasyOCR baseline for comparison
# Pros: Quick to set up, decent accuracy on simple CAPTCHAs, returns per-word confidence.
# Cons: May struggle with heavy obfuscation or overlapping characters.

from typing import Dict, Any
import easyocr

from scripts.preprocess import preprocess_pipeline


def predict_easyocr(image_path: str, lang_list=("en",)) -> Dict[str, Any]:
    prep = preprocess_pipeline(image_path, method="otsu")
    reader = easyocr.Reader(lang_list, gpu=False, verbose=False)
    # Work directly on deskewed binary for clarity (EasyOCR can accept grayscale arrays)
    results = reader.readtext(prep["deskew"])
    # results: list of (bbox, text, conf)

    if not results:
        return {"text": "", "confidence": 0.0, "debug": {"segments": prep["char_boxes"]}}

    best = max(results, key=lambda r: r[2])
    text = best[1]
    conf = float(best[2])  # already 0-1
    return {"text": text, "confidence": conf, "debug": {"segments": prep["char_boxes"]}}
