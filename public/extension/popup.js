;(async () => {
  const btnStart = document.getElementById("btn-start")
  const btnOCR = document.getElementById("btn-ocr")
  const btnCopy = document.getElementById("btn-copy")
  const btnClear = document.getElementById("btn-clear")
  const canvas = document.getElementById("crop-canvas")
  const ctx = canvas.getContext("2d")
  const ocrText = document.getElementById("ocr-text")
  const elConfidence = document.getElementById("confidence")
  const elDuration = document.getElementById("duration")

  let imgDataUrl = null

  function resetState() {
    canvas.width = 0
    canvas.height = 0
    imgDataUrl = null
    ocrText.value = ""
    elConfidence.textContent = "Confidence: —"
    elDuration.textContent = "Time: —"
    btnOCR.disabled = true
    btnCopy.disabled = true
  }

  btnClear.addEventListener("click", resetState)

  btnStart.addEventListener("click", async () => {
    resetState()
    try {
      const [tab] = await window.chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab?.id) return
      await window.chrome.tabs.sendMessage(tab.id, { type: "START_CROP" })
    } catch (e) {
      console.log("[v0] start crop error:", e)
    }
  })

  window.chrome.runtime.onMessage.addListener(async (message) => {
    if (message?.type !== "CROP_DONE") return
    const rect = message.rect // {x,y,w,h,dpr}

    try {
      const dataUrl = await window.chrome.tabs.captureVisibleTab(undefined, { format: "png" })
      const img = new Image()
      img.onload = () => {
        const sx = Math.max(0, Math.round(rect.x * rect.dpr))
        const sy = Math.max(0, Math.round(rect.y * rect.dpr))
        const sw = Math.max(1, Math.round(rect.w * rect.dpr))
        const sh = Math.max(1, Math.round(rect.h * rect.dpr))
        canvas.width = sw
        canvas.height = sh
        ctx.clearRect(0, 0, sw, sh)
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh)
        imgDataUrl = canvas.toDataURL("image/png")
        btnOCR.disabled = false
      }
      img.crossOrigin = "anonymous"
      img.src = dataUrl
    } catch (e) {
      console.log("[v0] capture crop error:", e)
    }
  })

  btnOCR.addEventListener("click", async () => {
    if (!imgDataUrl) return
    btnOCR.disabled = true
    const start = performance.now()

    try {
      // OCR.space (demo key). For production, replace with your own key.
      const fd = new FormData()
      fd.append("apikey", "helloworld")
      fd.append("base64Image", imgDataUrl)
      fd.append("language", "eng")
      fd.append("isOverlayRequired", "false")
      fd.append("scale", "true")
      fd.append("OCREngine", "2")
      fd.append("detectOrientation", "true")

      const res = await fetch("https://api.ocr.space/parse/image", { method: "POST", body: fd })
      const json = await res.json()
      const elapsed = Math.round(performance.now() - start)

      if (!json || json.IsErroredOnProcessing) {
        throw new Error(
          Array.isArray(json?.ErrorMessage) ? json.ErrorMessage.join(", ") : json?.ErrorMessage || "OCR failed",
        )
      }

      const parsed = json.ParsedResults?.[0]
      const text = (parsed?.ParsedText || "").trim()
      const conf = typeof parsed?.MeanConfidence === "number" ? parsed.MeanConfidence : null

      ocrText.value = text
      elConfidence.textContent = `Confidence: ${conf !== null ? conf + "%" : "n/a"}`
      elDuration.textContent = `Time: ${elapsed} ms`
      btnCopy.disabled = !text
    } catch (e) {
      console.log("[v0] OCR error:", e)
      ocrText.value = `OCR error: ${e?.message || e}`
      elConfidence.textContent = "Confidence: —"
      elDuration.textContent = "Time: —"
    } finally {
      btnOCR.disabled = false
    }
  })

  btnCopy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(ocrText.value || "")
    } catch (e) {
      console.log("[v0] clipboard error:", e)
    }
  })
})()
