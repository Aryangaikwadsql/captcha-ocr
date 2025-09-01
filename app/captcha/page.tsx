import CaptchaSolver from "@/components/captcha-solver"

export default function CaptchaPage() {
  return (
    <main className="min-h-dvh w-full bg-background">
      <section className="mx-auto w-full max-w-xl px-4 py-10">
        <header className="mb-6">
          <h1 className="text-pretty text-2xl font-semibold tracking-tight">CAPTCHA Solver</h1>
          <p className="text-sm text-muted-foreground">
            Upload an image, preprocess it, and run on-device OCR (Tesseract.js).
          </p>
        </header>
        <CaptchaSolver />
      </section>
    </main>
  )
}
