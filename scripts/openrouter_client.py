# OpenRouter integration using httpx. Sends the CAPTCHA image and requests a structured JSON response.
# NOTE:
# - Requires OPENROUTER_API_KEY (set in environment variables).
# - Uses the OpenAI-compatible /chat/completions endpoint.
# - We ask the model to return {"text": "...", "confidence": 0-1} and set temperature=0 for determinism.

import base64
import json
import os
from typing import Dict, Any

import httpx


OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"
# Choose a vision-capable model (availability may vary):
#   - "openai/gpt-4o-mini"
#   - "openai/gpt-4o"
#   - "google/gemini-flash-1.5" (if supported)
# Or "openrouter/auto" to let OpenRouter select.
DEFAULT_MODEL = "openai/gpt-4o-mini"


def image_to_data_url(path: str) -> str:
    with open(path, "rb") as f:
        b = f.read()
    b64 = base64.b64encode(b).decode("utf-8")
    return f"data:image/png;base64,{b64}"


def call_openrouter(image_path: str, api_key: str | None = None, model: str = DEFAULT_MODEL) -> Dict[str, Any]:
    if api_key is None:
        api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        raise RuntimeError("Missing OPENROUTER_API_KEY environment variable.")

    image_data_url = image_to_data_url(image_path)

    # Prompt the model to output strict JSON
    system = "You are an OCR assistant specialized in solving short CAPTCHAs safely."
    user_instruction = (
        "Extract the CAPTCHA text exactly as-is. "
        "Return a strict JSON object with keys 'text' (string) and 'confidence' (float 0-1). "
        "No extra commentary."
    )

    payload = {
        "model": model,
        "messages": [
            { "role": "system", "content": system },
            {
                "role": "user",
                "content": [
                    { "type": "text", "text": user_instruction },
                    { "type": "input_image", "image_url": image_data_url }
                ]
            }
        ],
        "temperature": 0,
        "response_format": { "type": "json_object" }
    }

    headers = {
        "Authorization": f"Bearer {api_key}",
        "HTTP-Referer": "https://v0.app",    # set to your app URL in production
        "X-Title": "captcha-ocr",
        "Content-Type": "application/json",
    }

    with httpx.Client(timeout=60) as client:
        resp = client.post(OPENROUTER_API_URL, headers=headers, json=payload)
        resp.raise_for_status()
        data = resp.json()

    # Parse OpenAI-style response
    try:
        content = data["choices"][0]["message"]["content"]
        parsed = json.loads(content)  # response_format=json_object should enforce JSON
        return {
            "text": parsed.get("text", ""),
            "confidence": float(parsed.get("confidence", 0.0)),
            "raw": data
        }
    except Exception:
        # Fallback if provider didn't honor JSON formatting
        return {
            "text": "",
            "confidence": 0.0,
            "raw": data
        }


# Example minimal request (reference):
#
# POST https://openrouter.ai/api/v1/chat/completions
# Headers:
#   Authorization: Bearer OPENROUTER_API_KEY
#   HTTP-Referer: https://your-app.example
#   X-Title: your-app-name
#   Content-Type: application/json
# Body:
# {
#   "model": "openai/gpt-4o-mini",
#   "messages": [
#     {"role": "system", "content": "You are an OCR assistant..."},
#     {"role": "user", "content": [
#       {"type": "text", "text": "Extract and return JSON..."},
#       {"type": "input_image", "image_url": "data:image/png;base64,...."}
#     ]}
#   ],
#   "temperature": 0,
#   "response_format": {"type": "json_object"}
# }
