/**
Preprocessing utilities for CAPTCHA images.

Pipeline:
1) Load -> Grayscale -> Denoise
2) Binarize (Otsu/adaptive) -> Morphology (open/close)
3) Deskew (optional) -> Resize & normalize
4) Optional segmentation into character candidates via contours

All functions are pure and testable. They return intermediate artifacts useful for debugging.
*/

import cv2
import numpy as np
from typing import Dict, Any, List, Tuple


def load_image(path: str) -> np.ndarray:
    """Load image from disk in BGR format."""
    img = cv2.imread(path, cv2.IMREAD_COLOR)
    if img is None:
        raise FileNotFoundError(f"Could not read image at: {path}")
    return img


def to_grayscale(img_bgr: np.ndarray) -> np.ndarray:
    """Convert BGR to grayscale."""
    return cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)


def denoise(gray: np.ndarray, ksize: int = 3) -> np.ndarray:
    """Median blur to remove salt-and-pepper noise while preserving edges."""
    return cv2.medianBlur(gray, ksize)


def binarize(gray_or_denoised: np.ndarray, method: str = "otsu") -> np.ndarray:
    """
    Threshold to a binary image.
    - 'otsu': Global Otsu thresholding
    - 'adaptive': Adaptive mean thresholding (useful for uneven illumination)
    Returns binary image with foreground text in white (255).
    """
    if method == "adaptive":
        bin_img = cv2.adaptiveThreshold(
            gray_or_denoised, 255, cv2.ADAPTIVE_THRESH_MEAN_C,
            cv2.THRESH_BINARY_INV, blockSize=21, C=10
        )
    else:
        # Otsu with inversion so text is white
        _, bin_img = cv2.threshold(gray_or_denoised, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    return bin_img


def morphology(bin_img: np.ndarray, open_ksize: int = 2, close_ksize: int = 2) -> np.ndarray:
    """
    Clean small specks and bridge small gaps in strokes.
    - Opening removes small noise blobs
    - Closing fills tiny gaps
    """
    kernel_open = cv2.getStructuringElement(cv2.MORPH_RECT, (open_ksize, open_ksize))
    kernel_close = cv2.getStructuringElement(cv2.MORPH_RECT, (close_ksize, close_ksize))
    opened = cv2.morphologyEx(bin_img, cv2.MORPH_OPEN, kernel_open, iterations=1)
    closed = cv2.morphologyEx(opened, cv2.MORPH_CLOSE, kernel_close, iterations=1)
    return closed


def deskew(bin_img: np.ndarray) -> np.ndarray:
    """
    Estimate skew using image moments and rotate to deskew.
    Useful for CAPTCHAs with slight slant.
    """
    coords = np.column_stack(np.where(bin_img > 0))
    if coords.size == 0:
        return bin_img
    angle = cv2.minAreaRect(coords.astype(np.float32))[-1]
    if angle < -45:
        angle = -(90 + angle)
    else:
        angle = -angle

    (h, w) = bin_img.shape[:2]
    M = cv2.getRotationMatrix2D((w // 2, h // 2), angle, 1.0)
    rotated = cv2.warpAffine(bin_img, M, (w, h), flags=cv2.INTER_LINEAR, borderValue=0)
    return rotated


def resize_keep_aspect(bin_img: np.ndarray, target_h: int = 32, pad_value: int = 0) -> np.ndarray:
    """
    Resize to target height keeping aspect ratio; pad width to a multiple of 4 for CNNs.
    Output: single-channel uint8 image HxW.
    """
    h, w = bin_img.shape[:2]
    if h == 0 or w == 0:
        raise ValueError("Invalid image with zero dimension")
    scale = target_h / float(h)
    new_w = int(w * scale)
    resized = cv2.resize(bin_img, (new_w, target_h), interpolation=cv2.INTER_AREA)

    # Pad width to a reasonable minimum width and multiple of 4
    min_w = max(64, new_w)
    pad_w = (4 - (min_w % 4)) % 4
    final_w = min_w + pad_w
    padded = np.full((target_h, final_w), pad_value, dtype=np.uint8)
    padded[:, :new_w] = resized
    return padded


def normalize(img_uint8: np.ndarray) -> np.ndarray:
    """
    Normalize to float32 in [0,1] and add channel dimension (1, H, W).
    """
    img = img_uint8.astype(np.float32) / 255.0
    return img[None, ...]  # (1, H, W)


def segment_characters(bin_img: np.ndarray) -> List[Tuple[int, int, int, int]]:
    """
    Simple segmentation by finding connected components/contours.
    Returns list of bounding boxes (x, y, w, h) sorted left-to-right.
    Optional: diagnostic only; CRNN does not require segmentation.
    """
    contours, _ = cv2.findContours(bin_img, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    boxes = []
    h_img, w_img = bin_img.shape[:2]
    for cnt in contours:
        x, y, w, h = cv2.boundingRect(cnt)
        if h < 0.2 * h_img or w < 0.01 * w_img:
            continue
        boxes.append((x, y, w, h))
    boxes.sort(key=lambda b: b[0])
    return boxes


def preprocess_pipeline(path: str, method: str = "otsu") -> Dict[str, Any]:
    """
    Full preprocessing returning intermediate stages for inspection.
    """
    original = load_image(path)
    gray = to_grayscale(original)
    den = denoise(gray, 3)
    bin_img = binarize(den, method=method)
    morph_img = morphology(bin_img, 2, 2)
    de_skew = deskew(morph_img)
    resized = resize_keep_aspect(de_skew, 32)
    norm = normalize(resized)
    boxes = segment_characters(de_skew)

    return {
        "original_bgr": original,
        "gray": gray,
        "denoised": den,
        "binary": bin_img,
        "morph": morph_img,
        "deskew": de_skew,
        "resized_uint8": resized,
        "normalized": norm,       # (1, H, W) float32
        "char_boxes": boxes       # optional segmentation result
    }
