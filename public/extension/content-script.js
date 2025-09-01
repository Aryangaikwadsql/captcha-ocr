;(() => {
  let overlay = null
  let box = null
  let startX = 0
  let startY = 0
  let active = false
  const chrome = window.chrome // Declare the chrome variable

  function createOverlay() {
    if (overlay) removeOverlay()

    overlay = document.createElement("div")
    overlay.setAttribute("role", "dialog")
    overlay.setAttribute("aria-label", "Crop overlay")
    Object.assign(overlay.style, {
      position: "fixed",
      inset: "0",
      zIndex: "2147483647",
      cursor: "crosshair",
      background: "rgba(0,0,0,0.25)",
    })

    const hint = document.createElement("div")
    hint.textContent = "Drag to select an area. Press Esc to cancel."
    Object.assign(hint.style, {
      position: "fixed",
      top: "12px",
      left: "50%",
      transform: "translateX(-50%)",
      background: "#111827",
      color: "#ffffff",
      padding: "6px 10px",
      fontSize: "12px",
      borderRadius: "6px",
      pointerEvents: "none",
    })
    overlay.appendChild(hint)

    box = document.createElement("div")
    Object.assign(box.style, {
      position: "fixed",
      border: "2px dashed #ffffff",
      background: "rgba(255,255,255,0.15)",
      left: "0px",
      top: "0px",
      width: "0px",
      height: "0px",
    })
    overlay.appendChild(box)

    document.documentElement.appendChild(overlay)

    overlay.addEventListener("mousedown", onMouseDown, { capture: true })
    window.addEventListener("mousemove", onMouseMove, { capture: true })
    window.addEventListener("mouseup", onMouseUp, { capture: true })
    window.addEventListener("keydown", onKeyDown, { capture: true })
  }

  function removeOverlay() {
    if (overlay) {
      overlay.removeEventListener("mousedown", onMouseDown, { capture: true })
      window.removeEventListener("mousemove", onMouseMove, { capture: true })
      window.removeEventListener("mouseup", onMouseUp, { capture: true })
      window.removeEventListener("keydown", onKeyDown, { capture: true })
      overlay.remove()
      overlay = null
    }
    box = null
    active = false
  }

  function onMouseDown(e) {
    if (e.button !== 0) return
    active = true
    startX = e.clientX
    startY = e.clientY
    updateBox(startX, startY, 0, 0)
    e.preventDefault()
    e.stopPropagation()
  }

  function onMouseMove(e) {
    if (!active) return
    const endX = e.clientX
    const endY = e.clientY
    const x = Math.min(startX, endX)
    const y = Math.min(startY, endY)
    const w = Math.abs(endX - startX)
    const h = Math.abs(endY - startY)
    updateBox(x, y, w, h)
    e.preventDefault()
    e.stopPropagation()
  }

  function onMouseUp(e) {
    if (!active) return
    active = false

    const rect = getBoxRect()
    if (rect.w < 2 || rect.h < 2) {
      removeOverlay()
      return
    }

    chrome.runtime.sendMessage({
      type: "CROP_DONE",
      rect: {
        x: rect.x,
        y: rect.y,
        w: rect.w,
        h: rect.h,
        dpr: window.devicePixelRatio || 1,
      },
    })

    removeOverlay()
    e.preventDefault()
    e.stopPropagation()
  }

  function onKeyDown(e) {
    if (e.key === "Escape") {
      removeOverlay()
      e.preventDefault()
      e.stopPropagation()
    }
  }

  function updateBox(x, y, w, h) {
    if (!box) return
    box.style.left = x + "px"
    box.style.top = y + "px"
    box.style.width = w + "px"
    box.style.height = h + "px"
  }

  function getBoxRect() {
    if (!box) return { x: 0, y: 0, w: 0, h: 0 }
    return {
      x: Number.parseFloat(box.style.left) || 0,
      y: Number.parseFloat(box.style.top) || 0,
      w: Number.parseFloat(box.style.width) || 0,
      h: Number.parseFloat(box.style.height) || 0,
    }
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "START_CROP") createOverlay()
  })
})()
