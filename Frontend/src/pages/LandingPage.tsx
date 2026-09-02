import type { CSSProperties, ReactNode } from 'react'
import { Button } from '../components/ui/button'
import {
  Camera,
  TextAa,
  PencilSimple,
  FilePdf,
  User,
  ClockCounterClockwise,
  Images,
  Lock,
} from '../components/icons'

interface LandingPageProps {
  onGetStarted: () => void
  onLogin: () => void
}

function PhoneFrame({
  src,
  alt,
  priority = false,
}: {
  src: string
  alt: string
  priority?: boolean
}) {
  return (
    <div className="mx-auto w-full max-w-[300px] rounded-[2.6rem] border-[10px] border-[#1c1917] bg-[#1c1917] p-1 shadow-[0_30px_60px_-20px_rgba(33,29,25,0.35)]">
      <div className="relative overflow-hidden rounded-[2rem] bg-surface-page">
        <div className="absolute left-1/2 top-2 z-10 h-1.5 w-16 -translate-x-1/2 rounded-full bg-black/25" />
        <img
          src={src}
          alt={alt}
          width={640}
          height={1376}
          className="block h-auto w-full"
          loading={priority ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : 'auto'}
          decoding="async"
        />
      </div>
    </div>
  )
}

/** CSS-only entrance (keyframe `rise` in base.css) — keeps framer-motion
 *  out of the pre-login bundle. */
function Rise({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  return (
    <div className="rise" style={{ '--rise-delay': `${delay}ms` } as CSSProperties}>
      {children}
    </div>
  )
}

const STEPS = [
  { n: '01', verb: 'Scan', icon: <Camera size={22} />, body: 'Photograph a form or drop in an image or PDF. Up to 15 pages.' },
  { n: '02', verb: 'Read', icon: <TextAa size={22} />, body: 'OCR pulls out the text on device, or through your own server if you run one.' },
  { n: '03', verb: 'Fill', icon: <PencilSimple size={22} />, body: 'Snappy finds the blanks and completes them from your saved profile.' },
]

const FEATURES = [
  { icon: <FilePdf size={18} />, title: 'Images and PDFs', body: 'Multi-page documents, camera or upload.' },
  { icon: <PencilSimple size={18} />, title: 'Field detection', body: 'Real PDF form fields plus on-device layout analysis.' },
  { icon: <User size={18} />, title: 'Reusable profile', body: 'Save your details once, reuse on every form.' },
  { icon: <ClockCounterClockwise size={18} />, title: 'Scan history', body: 'Search, rename, and revisit past scans.' },
  { icon: <Images size={18} />, title: 'Before and after', body: 'Compare the original and the filled copy side by side.' },
  { icon: <Lock size={18} />, title: 'Yours by default', body: 'Nothing leaves the device unless you save it.' },
]

export default function LandingPage({ onGetStarted, onLogin }: LandingPageProps) {
  return (
    <div data-landing className="theme-light w-full min-h-[100dvh] bg-surface-page text-text">
      <header className="sticky top-0 z-30 border-b border-border bg-surface-page/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <div className="flex items-center gap-2">
            <img src="/icon.svg" alt="" className="h-6 w-6" />
            <span className="font-display text-lg font-semibold tracking-tight">Snappy</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onLogin}>Log in</Button>
            <Button size="sm" onClick={onGetStarted}>Get started</Button>
          </div>
        </div>
      </header>

      {/* Hero: asymmetric split */}
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-5 pt-14 pb-20 md:grid-cols-12 md:pt-20">
        <div className="md:col-span-7">
          <h1
            className="rise font-display text-4xl font-semibold leading-[1.08] tracking-tight md:text-6xl"
          >
            Fill any paper form
            <br />
            from your phone.
          </h1>
          <p
            className="rise mt-5 max-w-[42ch] text-lg leading-relaxed text-text-muted"
            style={{ '--rise-delay': '80ms' } as CSSProperties}
          >
            Snap a document, pull out the text, and let Snappy complete it from your saved details.
            Works offline.
          </p>
          <div
            className="rise mt-8 flex flex-wrap gap-3"
            style={{ '--rise-delay': '160ms' } as CSSProperties}
          >
            <Button size="lg" onClick={onGetStarted}>Get started</Button>
            <Button size="lg" variant="outline" onClick={onLogin}>Log in</Button>
          </div>
        </div>
        <div className="rise md:col-span-5" style={{ '--rise-delay': '200ms' } as CSSProperties}>
          <PhoneFrame src="/landing/app-scan.webp" alt="Snappy showing a scanned membership form ready to fill" priority />
        </div>
      </section>

      {/* How it works: numbered process row */}
      <section className="border-y border-border bg-surface-sunken">
        <div className="mx-auto max-w-6xl px-5 py-16">
          <Rise>
            <h2 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">
              Three steps, about a minute
            </h2>
          </Rise>
          <div className="mt-10 grid gap-10 md:grid-cols-3 md:gap-0">
            {STEPS.map((s, i) => (
              <Rise key={s.n} delay={i * 80}>
                <div className="md:px-8 md:[&:not(:first-child)]:border-l md:[&:not(:first-child)]:border-border">
                  <div className="flex items-center gap-3">
                    <span className="font-display text-3xl font-semibold text-accent">{s.n}</span>
                    <span className="grid size-9 place-items-center rounded-full bg-accent-soft text-accent">
                      {s.icon}
                    </span>
                  </div>
                  <h3 className="mt-4 font-display text-lg font-semibold">{s.verb}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-text-muted">{s.body}</p>
                </div>
              </Rise>
            ))}
          </div>
        </div>
      </section>

      {/* Privacy band: centered stack */}
      <section className="mx-auto max-w-3xl px-5 py-20 text-center">
        <Rise>
          <h2 className="font-display text-2xl font-semibold tracking-tight md:text-4xl">
            Your documents stay with you
          </h2>
          <p className="mx-auto mt-4 max-w-[52ch] text-lg leading-relaxed text-text-muted">
            OCR and field detection run on your device. Scans are only stored when you save them to
            history, and you can point Snappy at your own OCR server if you prefer.
          </p>
        </Rise>
        <Rise delay={100}>
          <div className="mt-12">
            <PhoneFrame src="/landing/app-home.webp" alt="Snappy home screen with the camera scanner" />
          </div>
        </Rise>
      </section>

      {/* Feature grid: 2x3 */}
      <section className="border-t border-border bg-surface-sunken">
        <div className="mx-auto max-w-5xl px-5 py-16">
          <Rise>
            <h2 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">
              What is in the box
            </h2>
          </Rise>
          <div className="mt-10 grid gap-x-10 gap-y-8 sm:grid-cols-2">
            {FEATURES.map((f, i) => (
              <Rise key={f.title} delay={(i % 2) * 60}>
                <div className="flex gap-3">
                  <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
                    {f.icon}
                  </span>
                  <div>
                    <h3 className="font-semibold">{f.title}</h3>
                    <p className="mt-0.5 text-sm leading-relaxed text-text-muted">{f.body}</p>
                  </div>
                </div>
              </Rise>
            ))}
          </div>
        </div>
      </section>

      {/* CTA band */}
      <section className="bg-accent text-text-on-accent">
        <div className="mx-auto flex max-w-4xl flex-col items-center gap-6 px-5 py-20 text-center">
          <Rise>
            <h2 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">
              Stop retyping the same details
            </h2>
          </Rise>
          <Rise delay={80}>
            <Button
              size="lg"
              onClick={onGetStarted}
              className="bg-surface-raised text-accent hover:bg-surface-raised/90"
            >
              Get started
            </Button>
          </Rise>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-5 py-8 text-sm text-text-muted sm:flex-row">
          <div className="flex items-center gap-2">
            <img src="/icon.svg" alt="" className="h-5 w-5" />
            <span className="font-display font-semibold text-text">Snappy</span>
          </div>
          <div className="flex items-center gap-5">
            <button onClick={onLogin} className="hover:text-text">Log in</button>
            <span>&copy; {new Date().getFullYear()} Snappy</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
