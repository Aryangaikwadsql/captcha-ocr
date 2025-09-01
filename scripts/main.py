# Orchestrator: choose between local CRNN, EasyOCR/Tesseract baselines, and OpenRouter API
# Includes concise justification for Python vs JS/C++ and confidence explanation.

import os
from typing import Dict, Any

from scripts.infer import predict_local
from scripts.easyocr_baseline import predict_easyocr
from scripts.tesseract_baseline import predict_tesseract
from scripts.openrouter_client import call_openrouter


def solve_captcha_local(image_path: str, weights_path: str, device: str = "cpu") -> Dict[str, Any]:
    """
    Local PyTorch model (CRNN) inference.
    Returns: {"text": str, "confidence": float, "debug": {...}}
    """
    return predict_local(image_path, weights_path, device=device)


def solve_captcha_easyocr(image_path: str) -> Dict[str, Any]:
    """
    EasyOCR baseline (no training required). Good for quick evaluation.
    """
    return predict_easyocr(image_path)


def solve_captcha_tesseract(image_path: str) -> Dict[str, Any]:
    """
    Tesseract baseline (install required). Often OK for simple CAPTCHAs.
    """
    return predict_tesseract(image_path)


def solve_captcha_openrouter(image_path: str, model: str = "openai/gpt-4o-mini") -> Dict[str, Any]:
    """
    OpenRouter remote inference. Requires OPENROUTER_API_KEY in env.
    Returns: {"text": str, "confidence": float, "raw": ...}
    """
    return call_openrouter(image_path, model=model)


def choose_best(*results: Dict[str, Any]) -> Dict[str, Any]:
    """
    Simple ensemble selector: pick the result with highest confidence.
    In production, consider cross-checks and charset/length validation.
    """
    best = {"text": "", "confidence": 0.0}
    for r in results:
        if r and r.get("confidence", 0.0) > best["confidence"]:
            best = r
    return best


# Why Python (vs JS and C++), briefly:
# - Python: Richest CV/ML ecosystem (OpenCV, PyTorch/TensorFlow, EasyOCR), fastest R&D iteration, abundant tooling/datasets.
# - JavaScript: Great for UI and glue code; training and low-level CV pipelines are less mature and slower to iterate.
# - C++: Best raw performance for production inference (e.g., ONNX/TensorRT), but slower to develop/research; typical flow is prototype/train in Python, export and serve via C++/Rust for high throughput.

# Confidence:
# - Local CRNN: average per-character softmax probabilities after greedy CTC collapse (0–1).
# - EasyOCR: returns confidence; we use it directly.
# - Tesseract: no direct confidence on this path, treat as 0.0 or calibrate externally.
# - OpenRouter: ask model to return a confidence; optionally validate against charset/length or cross-check with local OCR.


if __name__ == "__main__":
    # Example usage with environment variables:
    #   CAPTCHA_IMAGE_PATH=/path/to/captcha.png
    #   CRNN_WEIGHTS_PATH=weights/crnn.pth
    img = os.environ.get("CAPTCHA_IMAGE_PATH", "")
    weights = os.environ.get("CRNN_WEIGHTS_PATH", "weights/crnn.pth")
    if not img:
        print("Please set CAPTCHA_IMAGE_PATH to the path of a CAPTCHA image.")
    else:
        local_res = {}
        try:
            local_res = solve_captcha_local(img, weights)
        except Exception as e:
            print(f"[local model] skipped: {e}")

        easy_res = {}
        try:
            easy_res = solve_captcha_easyocr(img)
        except Exception as e:
            print(f"[easyocr] skipped: {e}")

        tess_res = {}
        try:
            tess_res = solve_captcha_tesseract(img)
        except Exception as e:
            print(f"[tesseract] skipped: {e}")

        openrouter_res = {}
        try:
            openrouter_res = solve_captcha_openrouter(img)
        except Exception as e:
            print(f"[openrouter] skipped: {e}")

        best = choose_best(local_res, easy_res, tess_res, openrouter_res)
        print(best)
