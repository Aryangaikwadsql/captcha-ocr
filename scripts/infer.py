# Inference pipeline: preprocess -> CRNN -> decode -> confidence
from typing import Dict, Any
import numpy as np
import torch

from scripts.preprocess import preprocess_pipeline
from scripts.model import load_model, greedy_ctc_decode


def numpy_to_tensor(norm_img: np.ndarray, device="cpu") -> torch.Tensor:
    """
    Convert normalized (1, H, W) float32 numpy to torch (B,1,H,W)
    """
    img = torch.from_numpy(norm_img).unsqueeze(0)  # (1,1,H,W)
    return img.to(device)


def predict_local(image_path: str, weights_path: str, device: str = "cpu") -> Dict[str, Any]:
    """
    Full local inference.
    Returns dict { text, confidence, debug: {preprocess artifacts} }
    """
    prep = preprocess_pipeline(image_path, method="otsu")
    model = load_model(weights_path, device=device)
    x = numpy_to_tensor(prep["normalized"], device=device)
    with torch.no_grad():
        logits = model(x)                # (T, B, C)
    text, confidence = greedy_ctc_decode(logits)
    return {
        "text": text,
        "confidence": float(confidence),
        "debug": {
            "char_boxes": prep["char_boxes"],
            "stages": ["gray", "denoised", "binary", "morph", "deskew", "resized_uint8"],
        }
    }
