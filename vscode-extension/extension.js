const vscode = require("vscode")

class CaptchaOcrProvider {
  getTreeItem(element) {
    return element
  }

  getChildren(element) {
    if (!element) {
      const item = new vscode.TreeItem("CAPTCHA OCR Cropper", vscode.TreeItemCollapsibleState.None)
      item.command = {
        command: "captcha-ocr.open",
        title: "Open Cropper"
      }
      item.iconPath = new vscode.ThemeIcon("eye")
      return [item]
    }
    return []
  }
}

function activate(context) {
  const provider = new CaptchaOcrProvider()
  vscode.window.registerTreeDataProvider('captchaOcrView', provider)

  const disposable = vscode.commands.registerCommand("captcha-ocr.open", async () => {
    const panel = vscode.window.createWebviewPanel(
      "captchaOcrCropper",
      "CAPTCHA OCR Cropper",
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "media")],
      },
    )

    const webview = panel.webview
    const mediaRoot = vscode.Uri.joinPath(context.extensionUri, "media")
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, "webview.js"))
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, "webview.css"))
    const nonce = getNonce()

    panel.webview.html = getWebviewHtml({ webview, styleUri, scriptUri, nonce })

    webview.onDidReceiveMessage(async (msg) => {
      if (msg?.type === "run-ocr") {
        try {
          const config = vscode.workspace.getConfiguration()
          const apiKey = config.get("captchaOcr.ocrSpaceApiKey") || "helloworld"
          const language = config.get("captchaOcr.language") || "eng"
          const engine = config.get("captchaOcr.engine") || 2
          const threshold = msg.threshold || 160
          const scale = msg.scale || 2.0

          const startedAt = Date.now()
          const res = await callOcrSpace({
            apiKey,
            base64DataUrl: msg.dataUrl,
            language,
            engine,
            threshold,
            scale,
          })
          const durationMs = Date.now() - startedAt

          webview.postMessage({ type: "ocr-result", payload: { ...res, durationMs } })
        } catch (err) {
          webview.postMessage({ type: "ocr-error", message: String(err?.message || err) })
        }
      }
    })
  })

  context.subscriptions.push(disposable)
}

function deactivate() {}

module.exports = { activate, deactivate }

/**
 * Call OCR.space using x-www-form-urlencoded to avoid FormData compatibility issues.
 */
async function callOcrSpace({ apiKey, base64DataUrl, language = "eng", engine = 2 }) {
  const endpoint = "https://api.ocr.space/parse/image"
  const body = new URLSearchParams({
    base64Image: base64DataUrl, // includes the data URL prefix from the webview
    language: String(language),
    OCREngine: String(engine),
    scale: "true",
    isOverlayRequired: "true",
  })

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      apikey: apiKey,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`OCR API error: ${res.status} ${res.statusText} ${text}`)
  }
  const data = await res.json()

  if (data.IsErroredOnProcessing) {
    const msg = Array.isArray(data.ErrorMessage) ? data.ErrorMessage[0] : data.ErrorMessage || "OCR processing error"
    throw new Error(msg)
  }
  const parsed = (data.ParsedResults && data.ParsedResults[0]) || {}
  const text = (parsed.ParsedText || "").trim()

  let confidence = undefined
  if (Array.isArray(parsed?.WordConfidences) && parsed.WordConfidences.length > 0) {
    const vals = parsed.WordConfidences.map(Number).filter((v) => !Number.isNaN(v))
    if (vals.length > 0) {
      confidence = vals.reduce((a, b) => a + b, 0) / vals.length
    }
  }

  return { text, confidence, raw: data }
}

function getWebviewHtml({ webview, styleUri, scriptUri, nonce }) {
  const csp = [
    "default-src 'none'",
    `img-src ${webview.cspSource} data:`,
    `style-src ${webview.cspSource} 'nonce-${nonce}'`,
    `script-src ${webview.cspSource} 'nonce-${nonce}'`,
    "connect-src https://api.ocr.space",
    "font-src 'none'",
  ].join("; ")

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link nonce="${nonce}" rel="stylesheet" href="${styleUri}">
  <title>CAPTCHA OCR Cropper</title>
</head>
<body>
  <header class="header">
    <h1 class="title">CAPTCHA OCR</h1>
    <p class="subtitle">Load or paste an image, drag to crop — OCR runs instantly</p>
    <p class="note">Tip: If recognition is wrong, adjust Threshold and Scale below. OCR will re-run automatically.</p>
  </header>

  <main class="container">
    <section class="controls">
      <label class="file-label">
        <input id="fileInput" type="file" accept="image/*" />
        <span>Choose image</span>
      </label>

      <div class="control-group">
        <label for="thr">Threshold: <span id="thrVal">160</span></label>
        <input id="thr" type="range" min="0" max="255" value="160" />
      </div>

      <div class="control-group">
        <label for="scale">Scale: <span id="scaleVal">2.0×</span></label>
        <input id="scale" type="range" min="1" max="4" step="0.5" value="2" />
      </div>

      <button id="btnReset" class="btn secondary" disabled>Reset</button>
      <button id="btnOcr" class="btn primary" disabled>Run OCR</button>
    </section>

    <section class="canvas-wrap">
      <canvas id="canvas" width="800" height="400" aria-label="Image canvas"></canvas>
      <div id="hint" class="hint">Drop image or paste from clipboard. Drag to draw a crop.</div>
    </section>

    <section class="result">
      <div class="result-row">
        <label>Text</label>
        <textarea id="output" rows="3" readonly placeholder="Result appears here"></textarea>
      </div>
      <div class="result-row meta">
        <div>Confidence: <span id="conf">—</span></div>
        <div>Duration: <span id="dur">—</span></div>
        <button id="btnCopy" class="btn" disabled>Copy</button>
      </div>
    </section>
  </main>

  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`
}

function getNonce() {
  let text = ""
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length))
  }
  return text
}
