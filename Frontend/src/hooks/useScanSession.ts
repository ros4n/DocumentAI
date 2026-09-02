import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { toast } from 'sonner'

import { analyzeForm, analyzeDetectedFields } from '../lib/formFill'
import type { FillDecision, FormAnalysis } from '../lib/formFill'
import { detectFieldsWithImage } from '../lib/fieldDetect'
import type { DetectionWithImage } from '../lib/fieldDetect'
import type { DetectedField } from '../lib/types'
import { renderFilledForm } from '../lib/renderFill'
import { hasProfileData, loadProfile } from '../lib/profile'
import {
  apiCreateScan,
  apiSetScanFilled,
  getSession,
} from '../lib/api'
import type { ScanRecord } from '../lib/api'
import {
  dataUrlToFile,
  extractTextFromImage,
  extractTextFromPdf,
  getPdfFirstPage,
} from '../lib/ocr'
import type { OcrResult } from '../lib/ocr'
import { downscaleDataUrl } from '../lib/image'
import { defaultScanName } from '../lib/scanFormat'
import { preprocessScan } from '../lib/preprocess'
import type { PreprocessMeta, PreprocessResult } from '../lib/preprocess'

export type FullscreenImageState = {
  originalSrc: string
  originalAlt: string
  filledSrc: string
  filledAlt: string
  title: string
  subtitle: string
}

type Edit = FillDecision & { include: boolean }

interface Options {
  /** Append newly-created scans to the shared history list. */
  onScanCreated: (record: ScanRecord) => void
  /** Reflect server-side updates (filled image saved) into the shared list. */
  onScanUpdated: (record: ScanRecord) => void
  /** Profile is empty — the shell should route the user to the Profile tab. */
  onNeedProfile: () => void
}

/**
 * Owns the capture → OCR → field-detect → fill → result flow. Pulled out of
 * HomePage so typing in an unrelated tab (e.g. history search) no longer
 * re-renders the camera view.
 */
export function useScanSession({ onScanCreated, onScanUpdated, onNeedProfile }: Options) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pdfInputRef = useRef<HTMLInputElement>(null)
  /** Original source bytes for the field-detection pipeline (PDF → Tier 0). */
  const sourceFileRef = useRef<File | null>(null)
  const sourceTypeRef = useRef<'image' | 'pdf'>('image')

  const [streamActive, setStreamActive] = useState(false)
  const [cameraError, setCameraError] = useState('')
  /** Raw pixels straight off the camera / upload. Kept for the "Original"
   *  toggle and as the crop source. */
  const [captured, setCaptured] = useState<string | null>(null)
  /** Cleaned scan from the pre-processor (perspective, deskew, contrast). */
  const [enhanced, setEnhanced] = useState<string | null>(null)
  const [enhanceMeta, setEnhanceMeta] = useState<PreprocessMeta | null>(null)
  const [enhancing, setEnhancing] = useState(false)
  const [useEnhanced, setUseEnhanced] = useState(true)
  /** In-flight enhancement — OCR / fill await this so they run on the clean image. */
  const enhancePromiseRef = useRef<Promise<PreprocessResult> | null>(null)

  const [ocrBusy, setOcrBusy] = useState(false)
  const [ocrStatus, setOcrStatus] = useState('')
  const [ocrResult, setOcrResult] = useState<OcrResult | null>(null)

  const [fillBusy, setFillBusy] = useState(false)
  const [fillStatus, setFillStatus] = useState('')
  const [analysis, setAnalysis] = useState<FormAnalysis | null>(null)
  const [edits, setEdits] = useState<Edit[]>([])
  const [detection, setDetection] = useState<DetectionWithImage | null>(null)
  const [filledImage, setFilledImage] = useState<string | null>(null)
  const [fillSkipped, setFillSkipped] = useState<string[]>([])
  const [filledSaved, setFilledSaved] = useState(false)
  const [activeScanId, setActiveScanId] = useState<number | null>(null)
  /** The exact image the current fill session detected fields on — the
   *  renderer and the before/after must use this, not the raw capture. */
  const [renderImage, setRenderImage] = useState<string | null>(null)

  const [cropOpen, setCropOpen] = useState(false)
  const [resultOpen, setResultOpen] = useState(false)
  const [fullscreenImage, setFullscreenImage] = useState<FullscreenImageState | null>(null)

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  const saveScanToHistory = async (
    preview: string,
    result: OcrResult,
    scanType: 'image' | 'pdf',
    source: 'camera' | 'upload' | 'pdf'
  ) => {
    const session = getSession()
    if (!session) return
    try {
      const record = await apiCreateScan(session.token, {
        scan_type: scanType,
        source,
        name: defaultScanName(new Date().toISOString()),
        preview_image: preview,
        ocr_text: result.text,
        ocr_engine: result.engine,
        pages: result.pages,
      })
      setActiveScanId(record.id)
      onScanCreated(record)
    } catch {
      toast('Scan saved on device only (server offline)')
    }
  }

  const resetEnhance = () => {
    enhancePromiseRef.current = null
    setEnhanced(null)
    setEnhanceMeta(null)
    setEnhancing(false)
  }

  /** Kick off (and remember) a background clean-up pass for an image capture. */
  const runEnhance = (originalDataUrl: string) => {
    resetEnhance()
    setEnhancing(true)
    const p = preprocessScan(originalDataUrl)
    enhancePromiseRef.current = p
    p.then((res) => {
      // ignore if a newer capture superseded this one
      if (enhancePromiseRef.current !== p) return
      setEnhanced(res.dataUrl)
      setEnhanceMeta(res.meta)
      setEnhancing(false)
      if (res.meta.blurry) {
        toast('This scan looks blurry — retake for a sharper read')
      }
    }).catch(() => {
      if (enhancePromiseRef.current !== p) return
      setEnhancing(false)
    })
  }

  /** The image OCR / detection / rendering should run on: the cleaned scan
   *  when enhancement is on and finished, otherwise the raw capture.
   *  Awaits an in-flight enhancement so downstream never races it. */
  const resolveScanImage = async (): Promise<string> => {
    if (!useEnhanced) return captured ?? ''
    if (enhanced) return enhanced
    const pending = enhancePromiseRef.current
    if (pending) {
      try {
        const res = await pending
        return res.dataUrl
      } catch {
        /* fall through to raw */
      }
    }
    return captured ?? ''
  }

  const startCamera = async () => {
    setCameraError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) videoRef.current.srcObject = stream
      setStreamActive(true)
    } catch {
      setStreamActive(false)
      setCameraError('Camera unavailable. Upload an image instead.')
    }
  }

  const capture = () => {
    const video = videoRef.current
    if (!video || !streamActive) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')!.drawImage(video, 0, 0)
    sourceFileRef.current = null
    sourceTypeRef.current = 'image'
    const shot = canvas.toDataURL('image/jpeg', 0.92)
    setCaptured(shot)
    runEnhance(shot)
  }

  const handleUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    sourceFileRef.current = file
    sourceTypeRef.current = 'image'
    const reader = new FileReader()
    reader.onload = () => {
      const shot = reader.result as string
      setCaptured(shot)
      runEnhance(shot)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const saveScan = () => {
    if (!captured) return
    const a = document.createElement('a')
    a.href = captured
    a.download = `snappy-scan-${Date.now()}.jpg`
    a.click()
    toast('Scan saved')
  }

  const shareScan = async () => {
    if (!captured) return
    const blob = await (await fetch(captured)).blob()
    const file = new File([blob], 'scan.jpg', { type: 'image/jpeg' })
    if (navigator.share) {
      try {
        await navigator.share({ files: [file], title: 'Snappy scan' })
      } catch {
        /* user cancelled */
      }
    } else {
      try {
        await navigator.clipboard.writeText(captured)
        toast('Image copied to clipboard')
      } catch {
        toast('Sharing not supported on this device')
      }
    }
  }

  const retake = () => {
    sourceFileRef.current = null
    sourceTypeRef.current = 'image'
    setCaptured(null)
    resetEnhance()
  }

  const recropped = (cropped: string) => {
    setCaptured(cropped)
    runEnhance(cropped)
  }

  const extractFromCapture = async () => {
    if (!captured || ocrBusy) return
    setOcrBusy(true)
    setOcrStatus(enhancing ? 'Cleaning up the scan…' : 'Reading text…')
    try {
      const img = await resolveScanImage()
      setOcrStatus('Reading text…')
      const result = await extractTextFromImage(img)
      setOcrResult(result)
      if (result.serverError) toast('Server failed — used on-device OCR')
      try {
        const preview = await downscaleDataUrl(img, 480)
        await saveScanToHistory(preview, result, 'image', streamActive ? 'camera' : 'upload')
      } catch {
        /* history save is best-effort */
      }
    } catch (err) {
      toast((err as Error).message)
    } finally {
      setOcrBusy(false)
      setOcrStatus('')
    }
  }

  const handlePdfUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || ocrBusy) return
    sourceFileRef.current = file
    sourceTypeRef.current = 'pdf'
    setOcrBusy(true)
    setOcrStatus('Loading PDF…')
    try {
      const result = await extractTextFromPdf(file, (page, total) => {
        setOcrStatus(`Reading page ${page} of ${total}…`)
      })
      setOcrResult(result)
      if (result.serverError) toast('Server failed — used on-device OCR')
      try {
        const firstPage = await getPdfFirstPage(file)
        const preview = await downscaleDataUrl(firstPage, 480)
        await saveScanToHistory(preview, result, 'pdf', 'pdf')
      } catch {
        /* history save is best-effort */
      }
    } catch (err) {
      toast((err as Error).message)
    } finally {
      setOcrBusy(false)
      setOcrStatus('')
    }
  }

  const startFill = async () => {
    if (!captured || fillBusy) return
    const profile = loadProfile()
    if (!hasProfileData(profile)) {
      toast('Save your details in the Profile tab first')
      onNeedProfile()
      return
    }
    setFillBusy(true)
    setFillStatus(enhancing ? 'Cleaning up the scan…' : 'Detecting fields…')
    try {
      let file = sourceFileRef.current
      let inputType = sourceTypeRef.current
      let sessionImage = captured
      if (!file || inputType === 'image') {
        sessionImage = await resolveScanImage()
        file = dataUrlToFile(sessionImage, 'scan.jpg')
        inputType = 'image'
      }
      setRenderImage(sessionImage)
      setFillStatus('Detecting fields…')
      const result = await detectFieldsWithImage(file, inputType, (stage) => {
        setFillStatus(stage)
      })

      if (
        result.detection.fields.length === 0 &&
        result.detection.tierUsed !== 'acroform'
      ) {
        setFillStatus('Analyzing form…')
        const legacy = await analyzeForm(sessionImage, profile)
        setAnalysis(legacy)
        setEdits(legacy.decisions.map((d) => ({ ...d, include: true })))
        if (legacy.error) toast('AI failed — used on-device matching')
        return
      }

      setDetection(result)
    } catch (err) {
      toast((err as Error).message)
    } finally {
      setFillBusy(false)
      setFillStatus('')
    }
  }

  const confirmDetectedFields = async (fields: DetectedField[]) => {
    if (!detection) return
    setDetection(null)
    setFillBusy(true)
    setFillStatus('Matching profile values…')
    try {
      const merged = { ...detection.detection, fields }
      const result = await analyzeDetectedFields(merged, loadProfile())
      setAnalysis(result)
      setEdits(result.decisions.map((d) => ({ ...d, include: true })))
      if (result.error) toast('AI failed — used keyword matching')
    } catch (err) {
      toast((err as Error).message)
    } finally {
      setFillBusy(false)
      setFillStatus('')
    }
  }

  const applyFill = async () => {
    const base = renderImage ?? captured
    if (!analysis || !base) return
    setFillBusy(true)
    setFillStatus('Rendering filled form…')
    try {
      const cleanDecisions: FillDecision[] = edits
        .filter((d) => d.include)
        .map(({ fieldId, value, checked, confidence }) => ({
          fieldId,
          value,
          checked,
          confidence,
        }))
      const filled = await renderFilledForm(base, analysis.fields, cleanDecisions)
      setFilledImage(filled.dataUrl)
      setFillSkipped(filled.skipped)
      setFilledSaved(false)
      setResultOpen(true)
    } catch (err) {
      toast((err as Error).message)
    } finally {
      setFillBusy(false)
      setFillStatus('')
    }
  }

  const saveFilledToHistory = async () => {
    if (!filledImage || filledSaved) return
    const session = getSession()
    if (!session) {
      toast('Log in to save scans to history')
      return
    }
    setFillBusy(true)
    setFillStatus('Saving filled form…')
    try {
      const storedImage = await downscaleDataUrl(filledImage, 1600, 0.85)
      if (activeScanId) {
        const updated = await apiSetScanFilled(session.token, activeScanId, storedImage)
        onScanUpdated(updated)
      } else {
        const preview = captured ? await downscaleDataUrl(captured, 480) : ''
        const record = await apiCreateScan(session.token, {
          scan_type: 'image',
          source: streamActive ? 'camera' : 'upload',
          name: defaultScanName(new Date().toISOString()),
          preview_image: preview,
          filled_image: storedImage,
        })
        setActiveScanId(record.id)
        onScanCreated(record)
      }
      setFilledSaved(true)
      toast('Filled scan saved to history')
    } catch {
      toast('Could not save — server offline')
    } finally {
      setFillBusy(false)
      setFillStatus('')
    }
  }

  const updateEdit = (fieldId: string, patch: Partial<Edit>) => {
    setEdits((prev) => prev.map((d) => (d.fieldId === fieldId ? { ...d, ...patch } : d)))
  }

  const selectGroupOption = (group: string, fieldId: string | null) => {
    if (!analysis) return
    setEdits((prev) =>
      prev.map((d) => {
        const f = analysis.fields.find((x) => x.id === d.fieldId)
        if (f?.group !== group) return d
        const selected = d.fieldId === fieldId
        return {
          ...d,
          checked: selected,
          value: '',
          include: selected ? true : d.include,
          confidence: selected ? Math.max(d.confidence, 0.7) : d.confidence,
        }
      })
    )
  }

  const toggleGroup = (group: string, include: boolean) => {
    if (!analysis) return
    setEdits((prev) =>
      prev.map((x) => {
        const f2 = analysis.fields.find((y) => y.id === x.fieldId)
        if (f2?.group !== group) return x
        return { ...x, include }
      })
    )
  }

  const closeFillFlow = () => {
    setAnalysis(null)
    setEdits([])
    setDetection(null)
    setFilledImage(null)
    setFillSkipped([])
    setFilledSaved(false)
    setResultOpen(false)
    setRenderImage(null)
  }

  return {
    refs: { videoRef, fileInputRef, pdfInputRef },
    capture: {
      streamActive,
      cameraError,
      captured,
      setCaptured: recropped,
      startCamera,
      takePhoto: capture,
      handleUpload,
      handlePdfUpload,
      retake,
      saveScan,
      shareScan,
      // scan clean-up
      enhancing,
      enhanceMeta,
      useEnhanced,
      hasEnhanced: !!enhanced,
      toggleEnhanced: () => setUseEnhanced((v) => !v),
      /** what's shown in the captured preview */
      preview: useEnhanced && enhanced ? enhanced : captured,
    },
    ocr: {
      ocrBusy,
      ocrStatus,
      ocrResult,
      setOcrResult,
      extractFromCapture,
    },
    fill: {
      fillBusy,
      fillStatus,
      analysis,
      edits,
      detection,
      filledImage,
      fillSkipped,
      filledSaved,
      resultOpen,
      renderImage,
      startFill,
      confirmDetectedFields,
      applyFill,
      saveFilledToHistory,
      updateEdit,
      selectGroupOption,
      toggleGroup,
      closeFillFlow,
      dismissDetection: () => setDetection(null),
    },
    crop: { cropOpen, openCrop: () => setCropOpen(true), closeCrop: () => setCropOpen(false) },
    fullscreenImage,
    openFullscreenImage: setFullscreenImage,
    closeFullscreenImage: () => setFullscreenImage(null),
  }
}
