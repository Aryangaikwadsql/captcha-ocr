# AI CAPTCHA Recognition – Design, Training, Inference, and Scalability

1) Preprocessing (OpenCV)
- Grayscale → Median denoise (salt-and-pepper removal)
- Thresholding: Otsu (global) or Adaptive mean (illumination-robust)
- Morphology: Opening (noise removal), Closing (gap filling)
- Deskew via minAreaRect angle → warpAffine
- Resize to fixed height (32 px), pad width; Normalize to [0, 1]
- Optional segmentation: contour-based boxes for diagnostics

2) Model (CRNN + CTC, PyTorch)
- CNN produces feature maps along width; BiLSTM decodes sequence into per-timestep logits.
- CTC enables alignment-free training (no explicit char segmentation).
- Training tips:
  - Encode labels with provided vocabulary (A–Z, 0–9).
  - Loss: CTCLoss(blank=NUM_CLASSES-1, zero_infinity=True).
  - Augmentations: elastic distortions, affine jitter, background speckle, lines/arcs, color jitter.
  - Monitor CER/WER; early stopping; mix precision for speed.
  - Export to TorchScript or ONNX for production.

3) Inference Pipeline
- Preprocess → Normalize → (B,1,32,W) → CRNN → (T,B,C) logits
- Greedy CTC decoding; remove repeats and blanks.
- Confidence:
  - Local: Average max softmax probability for each emitted character (after collapsing repeats).
  - EasyOCR: Use detector-provided confidence.
  - Tesseract: No direct confidence in this simple path (calibrate externally or via n-best).
  - OpenRouter: Request “text” and “confidence” in structured JSON and validate outputs.

4) OpenRouter Integration
- Endpoint: https://openrouter.ai/api/v1/chat/completions (OpenAI-compatible)
- Headers: Authorization: Bearer OPENROUTER_API_KEY, HTTP-Referer, X-Title, Content-Type: application/json
- Body: Provide system/user prompts; include image as data URL; set response_format=json_object and temperature=0.

5) Python vs JavaScript vs C++
- Python: Fastest iteration with mature ML/CV stacks (OpenCV, PyTorch/TensorFlow, EasyOCR/Tesseract bindings).
- JavaScript: Ideal for web integration and light inference; fewer GPU-accelerated training toolchains.
- C++: Maximum performance for real-time serving when exporting ONNX/TensorRT; higher engineering overhead.

6) Production Scalability
- Performance:
  - Batch by width buckets to reduce padding; mixed precision (FP16).
  - Export to ONNX and serve via TensorRT/OpenVINO; consider C++/Rust microservice.
- Reliability:
  - Maintain per-style models; route based on visual signatures (font, background pattern).
  - Implement a reject/low-confidence path → human review or alternate model/provider.
- Cost & Ops:
  - Cache by image hash; rate-limit OpenRouter; retries with backoff.
  - Telemetry: log predictions, confidences, processing time; drift detection.
  - Secret management: OPENROUTER_API_KEY via environment variables; rotate regularly.

7) Quick Start
- Local: Put a CAPTCHA at path P, a CRNN weights file at weights/crnn.pth, then:
  - Set env: CAPTCHA_IMAGE_PATH=P; CRNN_WEIGHTS_PATH=weights/crnn.pth
  - Run scripts/main.py
- Remote: Set OPENROUTER_API_KEY; call solve_captcha_openrouter(image_path).
