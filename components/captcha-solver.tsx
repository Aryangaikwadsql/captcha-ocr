"use client"

import type React from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Tesseract from "tesseract.js"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Slider } from "@/components/ui/slider"
import { cn } from "@/lib/utils"

type OcrResult = {
  text: string
  confidence: number
  durationMs: number
}

export default function CaptchaSolver() {
  const [file, setFile] = useState<File | null>(null)
  const [src, setSrc] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)
  const [ocring, setOcring] = useState(false)
  const [result, setResult] = useState<OcrResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Preprocessing state
  const [grayscale, setGrayscale] = useState(true)
  const [invert, setInvert] = useState(false)
  const [thresholdEnabled, setThresholdEnabled] = useState(true)
  const [threshold, setThreshold] = useState(160)
  const [scale, setScale] = useState(2) // Upscale for OCR clarity

  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Load selected file
  useEffect(() => {
    if (!file) {
      setSrc(null)
      return
    }
    const reader = new FileReader()
    reader.onload = () => setSrc(reader.result as string)
    reader.readAsDataURL(file)
  }, [file])

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) {
      setFile(f)
      setResult(null)
      setError(null)
    }
  }

  // Draw and preprocess image to canvas
  const drawToCanvas = useCallback(async () => {
    if (!src || !canvasRef.current) return
    setProcessing(true)
    setError(null)
    try {
      const img = new Image()
      img.crossOrigin = "anonymous"
      img.onload = () => {
        const w = Math.max(1, Math.floor(img.width * scale))
        const h = Math.max(1, Math.floor(img.height * scale))
        const canvas = canvasRef.current!
        const ctx = canvas.getContext("2d", { willReadFrequently: true })
        if (!ctx) {
          setError("Canvas not supported")
          setProcessing(false)
          return
        }
        canvas.width = w
        canvas.height = h
        // Draw scaled
        ctx.imageSmoothingEnabled = false
        ctx.drawImage(img, 0, 0, w, h)

        const imageData = ctx.getImageData(0, 0, w, h)
        const data = imageData.data

        // Grayscale
        if (grayscale || thresholdEnabled) {
          for (let i = 0; i < data.length; i += 4) {
            const r = data[i]
            const g = data[i + 1]
            const b = data[i + 2]
            const l = Math.round(0.299 * r + 0.587 * g + 0.114 * b)
            data[i] = l
            data[i + 1] = l
            data[i + 2] = l
          }
        }

        // Threshold
        if (thresholdEnabled) {
          for (let i = 0; i < data.length; i += 4) {
            const v = data[i] // grayscale channel
            const bin = v > threshold ? 255 : 0
            data[i] = bin
            data[i + 1] = bin
            data[i + 2] = bin
          }
        }

        // Invert
        if (invert) {
          for (let i = 0; i < data.length; i += 4) {
            data[i] = 255 - data[i]
            data[i + 1] = 255 - data[i + 1]
            data[i + 2] = 255 - data[i + 2]
          }
        }

        ctx.putImageData(imageData, 0, 0)
        setProcessing(false)
      }
      img.onerror = () => {
        setError("Failed to load image")
        setProcessing(false)
      }
      img.src = src
    } catch (err: any) {
      setError(err?.message || "Failed to preprocess image")
      setProcessing(false)
    }
  }, [src, grayscale, invert, thresholdEnabled, threshold, scale])

  // Re-render processing when settings change
  useEffect(() => {
    void drawToCanvas()
  }, [drawToCanvas])

  const processedDataUrl = useMemo(() => {
    const canvas = canvasRef.current
    if (!canvas) return null
    try {
      return canvas.toDataURL("image/png")
    } catch {
      return null
    }
  }, [processing, src, grayscale, invert, thresholdEnabled, threshold, scale])

  const runOcr = async () => {
    if (!processedDataUrl) {
      setError("No processed image available")
      return
    }
    setOcring(true)
    setError(null)
    setResult(null)
    const started = performance.now()
    try {
      const { data } = await Tesseract.recognize(processedDataUrl, "eng", {
        // Restrict charset to common CAPTCHA characters
        tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
        // Treat image as a single text line
        tessedit_pageseg_mode: "7",
        user_defined_dpi: "300",
      } as any)

      const text = (data?.text || "").trim().replace(/\s+/g, "")
      // Confidence: average word confidence if available; fallback to overall
      let confidence = typeof data?.confidence === "number" ? data.confidence : 0
      if (Array.isArray(data?.words) && data.words.length > 0) {
        const avg = data.words.reduce((acc: number, w: any) => acc + (w?.confidence || 0), 0) / data.words.length
        confidence = isFinite(avg) ? avg : confidence
      }

      const durationMs = Math.round(performance.now() - started)
      setResult({ text, confidence, durationMs })
    } catch (err: any) {
      setError(err?.message || "OCR failed")
    } finally {
      setOcring(false)
    }
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    const f = e.dataTransfer.files?.[0]
    if (f) {
      setFile(f)
      setResult(null)
      setError(null)
    }
  }

  const prevent = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  return (
    <Card className="border border-border">
      <CardHeader>
        <CardTitle className="text-lg">Image</CardTitle>
        <CardDescription>Upload a CAPTCHA image and tweak preprocessing.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        <div
          onDrop={handleDrop}
          onDragOver={prevent}
          onDragEnter={prevent}
          onDragLeave={prevent}
          className={cn(
            "rounded-md border border-dashed p-4 transition",
            "flex items-center justify-center text-center",
            file ? "border-border" : "border-muted-foreground/30",
          )}
          aria-label="Image dropzone"
        >
          <div className="w-full">
            <Input type="file" accept="image/*" onChange={onFileChange} />
            <p className="mt-2 text-xs text-muted-foreground">Drag & drop an image here or click to choose a file.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <Label className="mb-2 block">Preview</Label>
            <div className="rounded-md border bg-muted p-2">
              <canvas ref={canvasRef} className="h-auto w-full" aria-label="Processed CAPTCHA canvas" />
            </div>
          </div>

          <div className="grid gap-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="grayscale">Grayscale</Label>
              <Switch id="grayscale" checked={grayscale} onCheckedChange={setGrayscale} />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="invert">Invert</Label>
              <Switch id="invert" checked={invert} onCheckedChange={setInvert} />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="threshold">Threshold</Label>
              <Switch id="threshold" checked={thresholdEnabled} onCheckedChange={setThresholdEnabled} />
            </div>

            <div className={cn("grid gap-2", thresholdEnabled ? "opacity-100" : "opacity-50")}>
              <Label>Threshold value: {threshold}</Label>
              <Slider
                min={0}
                max={255}
                step={1}
                value={[threshold]}
                onValueChange={(v) => setThreshold(v[0] ?? threshold)}
                disabled={!thresholdEnabled}
              />
            </div>

            <div className="grid gap-2">
              <Label>Scale: {scale}x</Label>
              <Slider min={1} max={4} step={1} value={[scale]} onValueChange={(v) => setScale(v[0] ?? scale)} />
            </div>

            <div className="pt-2">
              <Button className="w-full" onClick={runOcr} disabled={!src || processing || ocring}>
                {ocring ? "Running OCR..." : "Run OCR (Tesseract.js)"}
              </Button>
            </div>
          </div>
        </div>

        {error && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        {result && (
          <div className="rounded-md border bg-card p-4">
            <h3 className="mb-2 text-sm font-medium">Result</h3>
            <div className="grid grid-cols-1 gap-2 text-sm md:grid-cols-3">
              <div>
                <span className="text-muted-foreground">Text</span>
                <div className="font-mono text-base">{result.text || "—"}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Confidence</span>
                <div>{Math.round(result.confidence)}%</div>
              </div>
              <div>
                <span className="text-muted-foreground">Duration</span>
                <div>{result.durationMs} ms</div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
