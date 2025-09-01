# CAPTCHA Crop & OCR (Chrome Extension)

What it does:
- Click the extension, press “Select area”, drag a rectangle over the CAPTCHA (or any text).
- The popup shows the cropped preview.
- Click “Run OCR” to extract text via OCR.space (demo key); then “Copy text”.

Install locally:
1. Download this project (or Publish and then Download).
2. Open Chrome → chrome://extensions.
3. Enable “Developer mode” (top right).
4. Click “Load unpacked” and select the `public/extension` folder.

Permissions:
- `tabs`/`activeTab` for `captureVisibleTab` (screenshot the visible area).
- `https://api.ocr.space/*` to call the OCR API.

Notes:
- Replace the demo key in `popup.js` with your own OCR.space key for production.
- You can swap the OCR call with Tesseract.js if you want offline OCR inside the extension.
