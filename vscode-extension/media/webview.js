;(() => {
  const vscode = window.acquireVsCodeApi()

  const fileInput = document.getElementById("fileInput")
  const btnReset = document.getElementById("btnReset")
  const btnOcr = document.getElementById("btnOcr")
  const btnCopy = document.getElementById("btnCopy")
  const output = document.getElementById("output")
  const confEl = document.getElementById("conf")
  const durEl = document.getElementById("dur")
  const canvas = document.getElementById("canvas")
  const hint = document.getElementById("hint")

  // New controls
  const thr = document.getElementById("thr")
  const thrVal = document.getElementById("thrVal")
  const scale = document.getElementById("scale")
  const scaleVal = document.getElementById("scaleVal")

  const ctx = canvas.getContext("2d")
  let imageBitmapObj = null
  let hasImage = false

  // Crop rectangle state
  let isDragging = false
  let startX = 0,
    startY = 0,
    endX = 0,
    endY = 0

  // Debounce timer
  let ocrTimer = null
  function scheduleOcr() {
    if (!hasImage) return
    clearTimeout(ocrTimer)
    ocrTimer = setTimeout(() => runOcrNow(), 450)
  }

  function getThresholdVal() {
    const v = Number(thr?.value ?? 160)
    return Number.isFinite(v) ? Math.max(0, Math.min(255, v)) : 160
  }
  function getScaleVal() {
    const v = Number(scale?.value ?? 2)
    return Number.isFinite(v) ? Math.max(1, Math.min(4, v)) : 2
  }

  async function loadImageFromFile(file) {
    if (!file) return
    const bmp = await createImageBitmap(file)
    imageBitmapObj = bmp
    drawImageToCanvas()
    hasImage = true
    hint.style.display = "none"
    btnReset.disabled = false
    btnOcr.disabled = false

    // Default select full image and run OCR
    selectFullImageRegion()
    scheduleOcr()
  }

  function drawImageToCanvas() {
    if (!imageBitmapObj) return
    const dpr = window.devicePixelRatio || 1
    const viewWidth = canvas.clientWidth || canvas.width
    const viewHeight = canvas.clientHeight || canvas.height
    canvas.width = Math.floor(viewWidth * dpr)
    canvas.height = Math.floor(viewHeight * dpr)

    // Fit image into canvas while preserving aspect
    const scale = Math.min(canvas.width / imageBitmapObj.width, canvas.height / imageBitmapObj.height)
    const drawW = Math.floor(imageBitmapObj.width * scale)
    const drawH = Math.floor(imageBitmapObj.height * scale)
    const offsetX = Math.floor((canvas.width - drawW) / 2)
    const offsetY = Math.floor((canvas.height - drawH) / 2)

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = "high"
    ctx.drawImage(imageBitmapObj, offsetX, offsetY, drawW, drawH)
    canvas._drawInfo = { offsetX, offsetY, drawW, drawH, dpr }
  }

  function redrawWithOverlay() {
    drawImageToCanvas()
    if (!hasImage) return
    const x = Math.min(startX, endX)
    const y = Math.min(startY, endY)
    const w = Math.abs(endX - startX)
    const h = Math.abs(endY - startY)

    const dpr = window.devicePixelRatio || 1
    ctx.save()
    ctx.strokeStyle = "#2563eb"
    ctx.lineWidth = 2 * dpr
    ctx.setLineDash([6 * dpr, 4 * dpr])
    ctx.strokeRect(x, y, w, h)
    ctx.restore()

    ctx.save()
    ctx.fillStyle = "rgba(0,0,0,0.2)"
    ctx.fillRect(0, 0, canvas.width, Math.min(y, canvas.height))
    ctx.fillRect(0, y, Math.min(x, canvas.width), Math.max(h, 0))
    ctx.fillRect(x + w, y, canvas.width - (x + w), Math.max(h, 0))
    ctx.fillRect(0, y + h, canvas.width, canvas.height - (y + h))
    ctx.restore()
  }

  function withinImage(x, y) {
    if (!canvas._drawInfo) return false
    const { offsetX, offsetY, drawW, drawH } = canvas._drawInfo
    return x >= offsetX && x <= offsetX + drawW && y >= offsetY && y <= offsetY + drawH
  }

  function clientToCanvas(evt) {
    const rect = canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    const x = Math.floor((evt.clientX - rect.left) * dpr)
    const y = Math.floor((evt.clientY - rect.top) * dpr)
    return { x, y }
  }

  canvas.addEventListener("mousedown", (e) => {
    if (!hasImage) return
    const { x, y } = clientToCanvas(e)
    if (!withinImage(x, y)) return
    isDragging = true
    startX = endX = x
    startY = endY = y
    redrawWithOverlay()
  })

  canvas.addEventListener("mousemove", (e) => {
    if (!isDragging) return
    const { x, y } = clientToCanvas(e)
    endX = x
    endY = y
    redrawWithOverlay()
  })

  window.addEventListener("mouseup", (e) => {
    if (!isDragging) return
    const { x, y } = clientToCanvas(e)
    endX = x
    endY = y
    isDragging = false
    redrawWithOverlay()
    // Auto-run OCR after crop
    scheduleOcr()
  })

  // File input
  fileInput.addEventListener("change", (e) => {
    const file = e.target.files?.[0]
    if (file) loadImageFromFile(file)
  })

  // Drag & drop
  canvas.addEventListener("dragover", (e) => e.preventDefault())
  canvas.addEventListener("drop", (e) => {
    e.preventDefault()
    const file = e.dataTransfer?.files?.[0]
    if (file && file.type.startsWith("image/")) loadImageFromFile(file)
  })

  // Paste
  window.addEventListener("paste", (e) => {
    const items = e.clipboardData?.items || []
    for (const item of items) {
      if (item.type.indexOf("image") >= 0) {
        const file = item.getAsFile()
        if (file) loadImageFromFile(file)
      }
    }
  })

  // Reset
  btnReset.addEventListener("click", () => {
    if (!hasImage) return
    startX = startY = endX = endY = 0
    output.value = ""
    confEl.textContent = "—"
    durEl.textContent = "—"
    redrawWithOverlay()
  })

  // Sliders update text + auto-run
  thr?.addEventListener("input", () => {
    if (thrVal) thrVal.textContent = String(getThresholdVal())
    scheduleOcr()
  })
  scale?.addEventListener("input", () => {
    if (scaleVal) scaleVal.textContent = `${getScaleVal().toFixed(1)}×`
    scheduleOcr()
  })

  // Run OCR (manual button still available)
  btnOcr.addEventListener("click", async () => {
    if (!hasImage) return
    runOcrNow()
  })

  function runOcrNow() {
    if (!hasImage) return
    const rect = normalizedRect()
    if (!rect || rect.w < 2 || rect.h < 2) {
      selectFullImageRegion()
    }
    const thrValNum = getThresholdVal()
    const scaleNum = getScaleVal()
    const cropUrl = cropToDataUrl({ threshold: thrValNum, scale: scaleNum })
    setBusy(true)
    vscode.postMessage({ type: "run-ocr", dataUrl: cropUrl, threshold: thrValNum, scale: scaleNum })
  }

  // Copy
  btnCopy.addEventListener("click", async () => {
    const text = output.value
    try {
      await navigator.clipboard.writeText(text)
      btnCopy.textContent = "Copied"
      setTimeout(() => (btnCopy.textContent = "Copy"), 1000)
    } catch {}
  })

  function setBusy(b) {
    btnOcr.disabled = b
    btnReset.disabled = b
    fileInput.disabled = b
  }

  function normalizedRect() {
    const x = Math.min(startX, endX)
    const y = Math.min(startY, endY)
    const w = Math.abs(endX - startX)
    const h = Math.abs(endY - startY)
    if (w === 0 || h === 0) return null
    return { x, y, w, h }
  }

  function selectFullImageRegion() {
    const info = canvas._drawInfo
    if (!info) return
    startX = info.offsetX
    startY = info.offsetY
    endX = info.offsetX + info.drawW
    endY = info.offsetY + info.drawH
    redrawWithOverlay()
  }

  // Crop + preprocess (scale + grayscale + threshold) to data URL
  function cropToDataUrl({ threshold = 160, scale = 2 } = {}) {
    const x = Math.min(startX, endX)
    const y = Math.min(startY, endY)
    const w = Math.max(1, Math.floor(Math.abs(endX - startX)))
    const h = Math.max(1, Math.floor(Math.abs(endY - startY)))

    // Base crop
    const base = document.createElement("canvas")
    base.width = w
    base.height = h
    const bctx = base.getContext("2d")
    bctx.drawImage(canvas, x, y, w, h, 0, 0, w, h)

    // Scale up for better OCR (optional)
    const scaledW = Math.max(1, Math.floor(w * scale))
    const scaledH = Math.max(1, Math.floor(h * scale))
    const scaled = document.createElement("canvas")
    scaled.width = scaledW
    scaled.height = scaledH
    const sctx = scaled.getContext("2d")
    sctx.imageSmoothingEnabled = true
    sctx.imageSmoothingQuality = "high"
    sctx.drawImage(base, 0, 0, w, h, 0, 0, scaledW, scaledH)

    // Grayscale + threshold
    const img = sctx.getImageData(0, 0, scaledW, scaledH)
    const data = img.data
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      // Luminance
      const y = 0.299 * r + 0.587 * g + 0.114 * b
      const v = y >= threshold ? 255 : 0
      data[i] = data[i + 1] = data[i + 2] = v
      data[i + 3] = 255
    }
    sctx.putImageData(img, 0, 0)

    return scaled.toDataURL("image/png")
  }

  window.addEventListener("message", (event) => {
    const msg = event.data
    if (msg?.type === "ocr-result") {
      const { text, confidence, durationMs } = msg.payload || {}
      output.value = text || ""
      confEl.textContent = confidence != null ? `${Number(confidence).toFixed(1)}%` : "n/a"
      durEl.textContent = durationMs != null ? `${durationMs} ms` : "—"
      btnCopy.disabled = !text
      setBusy(false)
    } else if (msg?.type === "ocr-error") {
      output.value = `Error: ${msg.message}`
      confEl.textContent = "—"
      durEl.textContent = "—"
      btnCopy.disabled = true
      setBusy(false)
    }
  })

  // Resize handling
  const ro = new ResizeObserver(() => {
    if (!hasImage) return
    drawImageToCanvas()
    if (normalizedRect()) redrawWithOverlay()
  })
  ro.observe(document.body)
})()
