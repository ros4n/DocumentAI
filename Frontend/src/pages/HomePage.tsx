import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { toast } from 'sonner'
import ProfilePage from './ProfilePage'
import FullscreenImageViewer from '../components/FullscreenImageViewer'
import { ZoomableImage } from '../components/ZoomableImage'
import CropImage from '../components/CropImage'
import { Avatar, AvatarFallback } from '../components/ui/avatar'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog'
import { Input } from '../components/ui/input'
import { Switch } from '../components/ui/switch'
import { analyzeForm, suggestOptions } from '../lib/formFill'
import type { FillDecision, FormAnalysis } from '../lib/formFill'
import { renderFilledForm } from '../lib/renderFill'
import { hasProfileData, loadProfile } from '../lib/profile'
import {
  apiCreateScan,
  apiDeleteScan,
  apiListScans,
  apiRenameScan,
  apiSetScanFilled,
  getSession,
} from '../lib/api'
import type { ScanRecord } from '../lib/api'
import { getLlmConfig, llmConfigured, listModels, setLlmConfig, testConnection } from '../lib/llm'
import type { LlmConfig } from '../lib/llm'
import {
  extractTextFromImage,
  extractTextFromPdf,
  getPdfFirstPage,
  getServerUrl,
  setServerUrl,
} from '../lib/ocr'
import type { OcrResult } from '../lib/ocr'
import { downscaleDataUrl } from '../lib/image'

interface HomePageProps {
  onLogout: () => void
}

type Tab = 'home' | 'scans' | 'history' | 'profile'

type FullscreenImageState = {
  originalSrc: string
  originalAlt: string
  filledSrc: string
  filledAlt: string
  title: string
  subtitle: string
}

export default function HomePage({ onLogout }: HomePageProps) {
  const session = getSession()
  const userName = session?.user?.name?.trim() ?? ''
  const firstName = userName.split(/\s+/)[0] ?? ''
  const avatarLetter = (userName[0] ?? 'S').toUpperCase()
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pdfInputRef = useRef<HTMLInputElement>(null)
  const [streamActive, setStreamActive] = useState(false)
  const [cameraError, setCameraError] = useState('')
  const [captured, setCaptured] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('home')
  const [ocrBusy, setOcrBusy] = useState(false)
  const [ocrStatus, setOcrStatus] = useState('')
  const [ocrResult, setOcrResult] = useState<OcrResult | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [serverUrlInput, setServerUrlInput] = useState(getServerUrl())
  const [llm, setLlm] = useState<LlmConfig>(getLlmConfig)
  const [llmTesting, setLlmTesting] = useState(false)
  const [llmTestOk, setLlmTestOk] = useState(false)
  const [llmTestMsg, setLlmTestMsg] = useState('')
  const [modelOptions, setModelOptions] = useState<string[]>([])
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelsError, setModelsError] = useState('')
  const [fillBusy, setFillBusy] = useState(false)
  const [fillStatus, setFillStatus] = useState('')
  const [analysis, setAnalysis] = useState<FormAnalysis | null>(null)
  const [edits, setEdits] = useState<Array<FillDecision & { include: boolean }>>([])
  const [reviewOpen, setReviewOpen] = useState(false)
  const [filledImage, setFilledImage] = useState<string | null>(null)
  const [fillSkipped, setFillSkipped] = useState<string[]>([])
  const [scans, setScans] = useState<ScanRecord[]>([])
  const [scanDetail, setScanDetail] = useState<ScanRecord | null>(null)
  const [historySearch, setHistorySearch] = useState('')
  const [historyType, setHistoryType] = useState('')
  const [historyStatus, setHistoryStatus] = useState('')
  const [activeScanId, setActiveScanId] = useState<number | null>(null)
  const [filledSaved, setFilledSaved] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [cropOpen, setCropOpen] = useState(false)
  const [resultOpen, setResultOpen] = useState(false)
  const [fullscreenImage, setFullscreenImage] = useState<FullscreenImageState | null>(null)

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  useEffect(() => {
    const session = getSession()
    if (!session) return
    let cancelled = false
    apiListScans(session.token)
      .then((list) => {
        if (!cancelled) setScans(list)
      })
      .catch(() => {
        if (!cancelled) showToast('Could not load scan history')
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (scanDetail) setNameDraft(scanDetail.name)
  }, [scanDetail?.id, scanDetail?.name])

  const defaultScanName = (iso: string) => `Scan · ${fmtDate(iso)} ${fmtTime(iso)}`

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
      setScans((prev) => [record, ...prev])
    } catch {
      showToast('Scan saved on device only (server offline)')
    }
  }

  const startCamera = async () => {
    setCameraError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }
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
    setCaptured(canvas.toDataURL('image/jpeg', 0.92))
  }

  const handleUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setCaptured(reader.result as string)
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const showToast = (msg: string) => {
    toast(msg)
  }

  const saveScan = () => {
    if (!captured) return
    const a = document.createElement('a')
    a.href = captured
    a.download = `snappy-scan-${Date.now()}.jpg`
    a.click()
    showToast('Scan saved')
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
        showToast('Image copied to clipboard')
      } catch {
        showToast('Sharing not supported on this device')
      }
    }
  }

  const retake = () => {
    setCaptured(null)
  }

  const extractFromCapture = async () => {
    if (!captured || ocrBusy) return
    setOcrBusy(true)
    setOcrStatus('Reading text…')
    try {
      const result = await extractTextFromImage(captured)
      setOcrResult(result)
      if (result.serverError) {
        showToast('Server failed — used on-device OCR')
      }
      try {
        const preview = await downscaleDataUrl(captured, 480)
        await saveScanToHistory(preview, result, 'image', streamActive ? 'camera' : 'upload')
      } catch {
        /* history save is best-effort */
      }
    } catch (err) {
      showToast((err as Error).message)
    } finally {
      setOcrBusy(false)
      setOcrStatus('')
    }
  }

  const handlePdfUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || ocrBusy) return
    setOcrBusy(true)
    setOcrStatus('Loading PDF…')
    try {
      const result = await extractTextFromPdf(file, (page, total) => {
        setOcrStatus(`Reading page ${page} of ${total}…`)
      })
      setOcrResult(result)
      if (result.serverError) {
        showToast('Server failed — used on-device OCR')
      }
      try {
        const firstPage = await getPdfFirstPage(file)
        const preview = await downscaleDataUrl(firstPage, 480)
        await saveScanToHistory(preview, result, 'pdf', 'pdf')
      } catch {
        /* history save is best-effort */
      }
    } catch (err) {
      showToast((err as Error).message)
    } finally {
      setOcrBusy(false)
      setOcrStatus('')
    }
  }

  const startFill = async () => {
    if (!captured || fillBusy) return
    const profile = loadProfile()
    if (!hasProfileData(profile)) {
      showToast('Save your details in the Profile tab first')
      setTab('profile')
      return
    }
    setFillBusy(true)
    setFillStatus('Analyzing form…')
    try {
      const result = await analyzeForm(captured, profile)
      setAnalysis(result)
      setEdits(
        result.decisions.map((d) => ({
          ...d,
          include: true,
        }))
      )
      setReviewOpen(true)
      if (result.error) {
        showToast('AI failed — used on-device matching')
      }
    } catch (err) {
      showToast((err as Error).message)
    } finally {
      setFillBusy(false)
      setFillStatus('')
    }
  }

  const applyFill = async () => {
    if (!analysis || !captured) return
    setReviewOpen(false)
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
      const filled = await renderFilledForm(captured, analysis.fields, cleanDecisions)
      setFilledImage(filled.dataUrl)
      setFillSkipped(filled.skipped)
      setFilledSaved(false)
      setResultOpen(true)
    } catch (err) {
      showToast((err as Error).message)
    } finally {
      setFillBusy(false)
      setFillStatus('')
    }
  }

  const saveFilledToHistory = async () => {
    if (!filledImage || filledSaved) return
    const session = getSession()
    if (!session) {
      showToast('Log in to save scans to history')
      return
    }
    setFillBusy(true)
    setFillStatus('Saving filled form…')
    try {
      const storedImage = await downscaleDataUrl(filledImage, 1600, 0.85)
      if (activeScanId) {
        const updated = await apiSetScanFilled(session.token, activeScanId, storedImage)
        setScans((prev) => prev.map((s) => (s.id === updated.id ? updated : s)))
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
        setScans((prev) => [record, ...prev])
      }
      setFilledSaved(true)
      showToast('Filled scan saved to history')
    } catch {
      showToast('Could not save — server offline')
    } finally {
      setFillBusy(false)
      setFillStatus('')
    }
  }

  const updateEdit = (fieldId: string, patch: Partial<FillDecision & { include: boolean }>) => {
    setEdits((prev) =>
      prev.map((d) => (d.fieldId === fieldId ? { ...d, ...patch } : d))
    )
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

  const saveFilled = () => {
    if (!filledImage) return
    const a = document.createElement('a')
    a.href = filledImage
    a.download = `snappy-filled-${Date.now()}.jpg`
    a.click()
    showToast('Filled form saved')
  }

  const shareFilled = async () => {
    if (!filledImage) return
    const blob = await (await fetch(filledImage)).blob()
    const file = new File([blob], 'filled-form.jpg', { type: 'image/jpeg' })
    if (navigator.share) {
      try {
        await navigator.share({ files: [file], title: 'Snappy filled form' })
      } catch {
        /* user cancelled */
      }
    } else {
      try {
        await navigator.clipboard.writeText(filledImage)
        showToast('Image copied to clipboard')
      } catch {
        showToast('Sharing not supported on this device')
      }
    }
  }

  const closeFillFlow = () => {
    setAnalysis(null)
    setEdits([])
    setFilledImage(null)
    setFillSkipped([])
    setFilledSaved(false)
    setReviewOpen(false)
    setResultOpen(false)
  }

  const openFullscreenImage = (next: FullscreenImageState) => {
    setFullscreenImage(next)
  }

  const copyText = async () => {
    if (!ocrResult) return
    try {
      await navigator.clipboard.writeText(ocrResult.text)
      showToast('Text copied')
    } catch {
      showToast('Copy not supported on this device')
    }
  }

  const downloadText = () => {
    if (!ocrResult) return
    const blob = new Blob([ocrResult.text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `snappy-ocr-${Date.now()}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const openSettings = () => {
    setServerUrlInput(getServerUrl())
    setLlm(getLlmConfig())
    setSettingsOpen(true)
  }

  const loadModels = async () => {
    setModelsLoading(true)
    setModelsError('')
    try {
      const ids = await listModels(llm)
      setModelOptions(ids)
    } catch (err) {
      setModelsError((err as Error).message)
    } finally {
      setModelsLoading(false)
    }
  }

  const saveSettings = () => {
    setServerUrl(serverUrlInput)
    setLlmConfig(llm)
    setSettingsOpen(false)
    showToast('Settings saved')
  }

  const testLlm = async () => {
    setLlmTesting(true)
    setLlmTestOk(false)
    setLlmTestMsg('')
    try {
      const reply = await testConnection(llm)
      setLlmTestOk(true)
      setLlmTestMsg(reply.includes('OK') ? 'Connected — model replied OK' : `Connected — reply: ${reply}`)
    } catch (err) {
      setLlmTestOk(false)
      setLlmTestMsg((err as Error).message)
    } finally {
      setLlmTesting(false)
    }
  }

  const engine: 'server' | 'on-device' = serverUrlInput ? 'server' : 'on-device'

  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' })

  const dayLabel = (iso: string): string => {
    const d = new Date(iso)
    const now = new Date()
    const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
    const days = Math.floor((start(now) - start(d)) / 86400000)
    if (days <= 0) return 'Today'
    if (days === 1) return 'Yesterday'
    if (days <= 7) return 'This week'
    return fmtDate(iso)
  }

  const groupHistory = (items: ScanRecord[]) => {
    const order = ['Today', 'Yesterday', 'This week']
    const groups = new Map<string, ScanRecord[]>()
    for (const s of items) {
      const key = dayLabel(s.created_at)
      const arr = groups.get(key)
      if (arr) arr.push(s)
      else groups.set(key, [s])
    }
    const keys = order.filter((k) => groups.has(k))
    for (const k of [...groups.keys()].sort()) {
      if (!keys.includes(k)) keys.push(k)
    }
    return keys.map((key) => ({ label: key, items: groups.get(key)! }))
  }

  const filteredScans = scans.filter((s) => {
    const q = historySearch.trim().toLowerCase()
    if (q && !s.ocr_text.toLowerCase().includes(q)) return false
    if (historyType && s.scan_type !== historyType) return false
    if (historyStatus === 'filled' && !s.filled_at) return false
    if (historyStatus === 'ocr' && s.filled_at) return false
    return true
  })

  const scanBadge = (s: ScanRecord) =>
    s.filled_at ? (
      <Badge className="scan-badge">Filled</Badge>
    ) : (
      <Badge variant="secondary" className="scan-badge">OCR</Badge>
    )

  const deleteScan = async (id: number) => {
    const session = getSession()
    if (!window.confirm('Delete this scan?')) return
    if (session) {
      try {
        await apiDeleteScan(session.token, id)
      } catch {
        showToast('Could not delete on server')
      }
    }
    setScans((prev) => prev.filter((s) => s.id !== id))
    setScanDetail((prev) => (prev && prev.id === id ? null : prev))
  }

  const downloadImage = (dataUrl: string, name: string) => {
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = name
    a.click()
  }

  const renameScan = async (id: number, name: string) => {
    const session = getSession()
    if (!session) return
    try {
      const updated = await apiRenameScan(session.token, id, name.trim())
      setScans((prev) => prev.map((s) => (s.id === updated.id ? updated : s)))
      setScanDetail((prev) => (prev && prev.id === updated.id ? updated : prev))
    } catch {
      showToast('Could not rename — server offline')
    }
  }

  const scanCard = (s: ScanRecord) => (
    <div className="scan-card" key={s.id} onClick={() => setScanDetail(s)}>
      {s.preview_image ? (
        <img className="scan-thumb" src={s.preview_image} alt="Scan preview" />
      ) : (
        <div className="scan-thumb scan-thumb-empty">
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="4" />
            <circle cx="9" cy="9" r="2" />
            <path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />
          </svg>
        </div>
      )}
      <div className="scan-card-body">
        <div className="scan-card-top">
          <span className="scan-name">{s.name || defaultScanName(s.created_at)}</span>
          {scanBadge(s)}
        </div>
        <span className="scan-date">
          {dayLabel(s.created_at)} · {fmtTime(s.created_at)}
        </span>
      </div>
      <button
        className="icon-btn scan-card-del"
        onClick={(e) => {
          e.stopPropagation()
          deleteScan(s.id)
        }}
        aria-label="Delete scan"
        title="Delete"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
      </button>
    </div>
  )

  const emptyTab = (title: string, subtitle: string) => (
    <div className="empty-tab">
      <div className="empty-icon">
        <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="4" />
          <circle cx="9" cy="9" r="2" />
          <path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />
        </svg>
      </div>
      <h2>{title}</h2>
      <p>{subtitle}</p>
    </div>
  )

  return (
    <div className="home-page">
      <header className="home-header">
        <div className="home-user">
          <Avatar size="lg" className="avatar">
            <AvatarFallback>{avatarLetter}</AvatarFallback>
          </Avatar>
          <div>
            <p className="greeting">Hey {firstName || 'there'}</p>
            <p className="home-title">Snappy Scanner</p>
          </div>
        </div>
        <div className="header-actions">
          <button className="icon-btn" onClick={openSettings} aria-label="OCR settings" title="OCR settings">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
      </header>

      <main className="home-content">
        {tab === 'home' && (
          <>
            <div className="engine-status">
              <span className={`status-badge ${serverUrlInput ? 'ok' : ''}`}>
                {serverUrlInput ? 'OCR: Unlimited-OCR server' : 'OCR: on-device (Tesseract)'}
              </span>
              <span className={`status-badge ${llmConfigured() ? 'llm' : ''}`}>
                {llmConfigured()
                  ? `AI: ${llm.url.includes('google') ? 'Gemini' : 'configured'}`
                  : 'AI: not set up'}
              </span>
            </div>

            <div className="scanner-card">
              {captured ? (
                <div className="scan-result">
                  <img src={captured} alt="Captured scan" />
                  <div className="scan-actions">
                    <Button variant="secondary" onClick={retake} disabled={ocrBusy || fillBusy}>Retake</Button>
                    <Button variant="secondary" onClick={() => setCropOpen(true)} disabled={ocrBusy || fillBusy}>Crop</Button>
                    <Button variant="secondary" onClick={extractFromCapture} disabled={ocrBusy || fillBusy}>
                      {ocrBusy ? <span className="spinner" /> : 'Text'}
                    </Button>
                    <Button onClick={saveScan} disabled={ocrBusy || fillBusy}>Save</Button>
                    <Button onClick={shareScan} disabled={ocrBusy || fillBusy}>Share</Button>
                  </div>
                  <Button variant="secondary" className="btn-fill w-full" onClick={startFill} disabled={ocrBusy || fillBusy}>
                    {fillBusy ? (
                      <span className="fill-busy"><span className="spinner" />{fillStatus}</span>
                    ) : (
                      <>
                        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                        </svg>
                        Fill form
                      </>
                    )}
                  </Button>
                </div>
              ) : (
                <>
                  <div className={`camera-view ${streamActive ? 'active' : ''}`}>
                    <video ref={videoRef} autoPlay playsInline muted />
                    {!streamActive && (
                      <div className="camera-idle">
                        <div className="idle-camera-icon">
                          <svg viewBox="0 0 24 24" width="42" height="42" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                            <circle cx="12" cy="13" r="4" />
                          </svg>
                        </div>
                        <p>Camera is off</p>
                        {cameraError && <p className="camera-error">{cameraError}</p>}
                      </div>
                    )}
                    {streamActive && (
                      <div className="viewfinder">
                        <span className="corner tl" />
                        <span className="corner tr" />
                        <span className="corner bl" />
                        <span className="corner br" />
                        <span className="scan-line" />
                      </div>
                    )}
                  </div>

                  <div className="scanner-controls">
                    {streamActive ? (
                      <button className="shutter" onClick={capture} aria-label="Capture">
                        <span />
                      </button>
                    ) : (
                      <Button size="lg" onClick={startCamera}>
                        Enable camera
                      </Button>
                    )}
                    <button className="btn-upload" onClick={() => fileInputRef.current?.click()}>
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                      </svg>
                      Image
                    </button>
                    <button className="btn-upload" onClick={() => pdfInputRef.current?.click()}>
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="16" y1="17" x2="8" y2="17" />
                      </svg>
                      PDF
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleUpload}
                      style={{ display: 'none' }}
                    />
                    <input
                      ref={pdfInputRef}
                      type="file"
                      accept="application/pdf"
                      onChange={handlePdfUpload}
                      style={{ display: 'none' }}
                    />
                  </div>

                  <p className="scanner-hint">
                    {ocrBusy
                      ? ocrStatus
                      : streamActive
                        ? 'Line up the document and tap the shutter'
                        : 'Grant camera access, upload a photo, or a PDF to extract text'}
                  </p>
                </>
              )}
            </div>
          </>
        )}

        {tab === 'scans' && (
          <div className="library-page">
            <div className="scan-toolbar">
              <div className="search-box">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  className="search-input"
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  placeholder="Search scan text…"
                />
              </div>
              <div className="chip-row">
                {[
                  ['', 'All'],
                  ['ocr', 'OCR only'],
                  ['filled', 'Filled'],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    className={historyStatus === value ? 'chip active' : 'chip'}
                    onClick={() => setHistoryStatus(value)}
                  >
                    {label}
                  </button>
                ))}
                <span className="chip-divider" />
                {[
                  ['', 'All'],
                  ['image', 'Images'],
                  ['pdf', 'PDFs'],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    className={historyType === value ? 'chip active' : 'chip'}
                    onClick={() => setHistoryType(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {filteredScans.length > 0 ? (
              <div className="scan-grid">
                {filteredScans.map((s) => scanCard(s))}
              </div>
            ) : (
              emptyTab(
                scans.length > 0 ? 'No matching scans' : 'Scans',
                scans.length > 0
                  ? 'Try a different search or filter'
                  : 'Scan a document and it will be saved here'
              )
            )}
          </div>
        )}

        {tab === 'history' && (
          <div className="history-page">
            {filteredScans.length > 0 ? (
              <div className="history-list">
                {groupHistory(filteredScans).map((group) => (
                  <div key={group.label} className="history-group">
                    <h3>{group.label}</h3>
                    {group.items.map((s) => (
                      <button key={s.id} className="history-item" onClick={() => setScanDetail(s)}>
                        {s.preview_image ? (
                          <img className="history-thumb" src={s.preview_image} alt="Scan preview" />
                        ) : (
                          <div className="history-thumb history-thumb-empty">
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="3" y="3" width="18" height="18" rx="4" />
                              <circle cx="9" cy="9" r="2" />
                              <path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />
                            </svg>
                          </div>
                        )}
                        <div className="history-meta">
                          <div className="history-top">
                            <span className="history-title">
                              {s.name || defaultScanName(s.created_at)}
                            </span>
                            {scanBadge(s)}
                          </div>
                          <span className="history-time">
                            {fmtTime(s.created_at)} · {s.pages} page{s.pages === 1 ? '' : 's'}
                            {s.ocr_engine === 'server' ? ' · server OCR' : ''}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              emptyTab(
                scans.length > 0 ? 'No matching activity' : 'History',
                scans.length > 0
                  ? 'Try a different search or filter'
                  : 'Your scanning activity will be listed here'
              )
            )}
          </div>
        )}
        {tab === 'profile' && <ProfilePage showToast={showToast} onLogout={onLogout} />}
      </main>

      {ocrResult && !ocrBusy && (
        <Dialog open={!!ocrResult && !ocrBusy} onOpenChange={(o) => { if (!o) setOcrResult(null) }}>
          <DialogContent className="wm-dialog">
            <DialogHeader className="text-left">
              <DialogTitle>Extracted text</DialogTitle>
              {ocrResult.engine === 'server' ? (
                <span className="status-badge ok">
                  OCR: Unlimited-OCR server{ocrResult.pages > 1 ? ` · ${ocrResult.pages} pages` : ''}
                </span>
              ) : ocrResult.serverError ? (
                <span className="status-badge warn">
                  OCR: server failed — on-device fallback
                </span>
              ) : (
                <span className="status-badge">
                  OCR: on-device (Tesseract){ocrResult.pages > 1 ? ` · ${ocrResult.pages} pages` : ''}
                </span>
              )}
            </DialogHeader>
            <pre className="ocr-text">{ocrResult.text || 'No text found'}</pre>
            <div className="wm-dialog-actions">
              <Button variant="secondary" onClick={copyText}>Copy</Button>
              <Button onClick={downloadText}>Download .txt</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {reviewOpen && analysis && (
        <Dialog open={reviewOpen && !!analysis} onOpenChange={(o) => { if (!o) closeFillFlow() }}>
          <DialogContent className="wm-dialog">
            <DialogHeader className="text-left">
              <DialogTitle>Review fills</DialogTitle>
              <p className="engine-badge">
                {analysis.fields.length} field{analysis.fields.length === 1 ? '' : 's'} found
              </p>
              <div className="badge-row">
                {analysis.structureEngine === 'llm' ? (
                  <span className="status-badge llm">Fields: AI vision</span>
                ) : analysis.structureEngine === 'server' ? (
                  <span className="status-badge ok">Fields: OCR server</span>
                ) : (
                  <span className="status-badge">Fields: on-device OCR</span>
                )}
                {analysis.matchSource === 'llm' ? (
                  <span className="status-badge llm">Values: AI matching</span>
                ) : (
                  <span className="status-badge warn">Values: keyword matching</span>
                )}
              </div>
            </DialogHeader>
            <div className="review-list">
              {edits.map((d) => {
                const field = analysis.fields.find((f) => f.id === d.fieldId)
                if (!field) return null
                if (field.kind === 'checkbox' && field.group) {
                  const groupFields = edits.filter((x) => {
                    const f = analysis.fields.find((y) => y.id === x.fieldId)
                    return f?.kind === 'checkbox' && f.group === field.group
                  })
                  if (groupFields[0]?.fieldId !== d.fieldId) return null
                  const anyChecked = groupFields.some((x) => x.include && x.checked)
                  const groupIncluded = groupFields.some((x) => x.include)
                  return (
                    <div key={field.group} className="review-group-block">
                      <div className="review-group-head">
                        <p className="review-group">{field.group}</p>
                        <Switch
                          size="sm"
                          checked={groupIncluded}
                          onCheckedChange={(c) => {
                            setEdits((prev) =>
                              prev.map((x) => {
                                const f2 = analysis.fields.find((y) => y.id === x.fieldId)
                                if (f2?.group !== field.group) return x
                                return { ...x, include: c }
                              })
                            )
                          }}
                        />
                      </div>
                      <div className="option-pills">
                        {groupFields.map((gd) => {
                          const gf = analysis.fields.find((y) => y.id === gd.fieldId)
                          return (
                            <button
                              key={gd.fieldId}
                              type="button"
                              className={`option-pill ${gd.include && gd.checked ? 'selected' : ''} ${!gd.include ? 'muted' : ''}`}
                              onClick={() => selectGroupOption(field.group!, gd.fieldId)}
                            >
                              {gf?.label || 'Option'}
                            </button>
                          )
                        })}
                        <button
                          type="button"
                          className={`option-pill none ${!anyChecked && groupIncluded ? 'selected' : ''}`}
                          onClick={() => selectGroupOption(field.group!, null)}
                        >
                          None
                        </button>
                      </div>
                    </div>
                  )
                }
                return (
                  <div key={d.fieldId} className={`review-row ${d.include ? '' : 'disabled'}`}>
                    <div className="review-main">
                      <p className="review-label">
                        {field.label || 'Unlabeled field'}
                        {d.confidence === 0 && !d.value && (
                          <span className="review-nomatch">
                            {field.kind === 'checkbox'
                              ? 'not matched — tick manually'
                              : 'no match — type manually'}
                          </span>
                        )}
                      </p>
                      {field.kind === 'checkbox' ? (
                        <label className="review-checkbox">
                          <input
                            type="checkbox"
                            checked={d.include && d.checked}
                            disabled={!d.include}
                            onChange={(e) => updateEdit(d.fieldId, { checked: e.target.checked })}
                          />
                          <span>{d.include ? (d.checked ? 'Checked' : 'Unchecked') : 'Skipped'}</span>
                        </label>
                      ) : field.kind === 'date' ? (
                        <input
                          className="review-input"
                          type="date"
                          value={d.value}
                          disabled={!d.include}
                          onChange={(e) => updateEdit(d.fieldId, { value: e.target.value })}
                        />
                      ) : (
                        (() => {
                          const suggestions = suggestOptions(field, loadProfile(), field.options)
                          if (suggestions.length === 0) {
                            return (
                              <input
                                className="review-input"
                                type="text"
                                value={d.value}
                                disabled={!d.include}
                                placeholder="Type a value to fill"
                                onChange={(e) => updateEdit(d.fieldId, { value: e.target.value })}
                              />
                            )
                          }
                          const known = suggestions.includes(d.value)
                          return (
                            <div className="review-suggest">
                              <select
                                className="review-select"
                                disabled={!d.include}
                                value={known ? d.value : '__custom__'}
                                onChange={(e) => {
                                  const v = e.target.value
                                  if (v !== '__custom__') {
                                    updateEdit(d.fieldId, { value: v })
                                  }
                                }}
                              >
                                <option value="__custom__">Choose or type your own…</option>
                                {suggestions.map((o) => (
                                  <option key={o} value={o}>{o}</option>
                                ))}
                              </select>
                              <input
                                className="review-input"
                                type="text"
                                value={d.value}
                                disabled={!d.include}
                                placeholder={known ? 'Custom value…' : 'Type a value to fill'}
                                onChange={(e) => updateEdit(d.fieldId, { value: e.target.value })}
                              />
                            </div>
                          )
                        })()
                      )}
                    </div>
                    <Switch
                      size="sm"
                      checked={d.include}
                      onCheckedChange={(c) => updateEdit(d.fieldId, { include: c })}
                    />
                  </div>
                )
              })}
            </div>
            <div className="wm-dialog-actions">
              <Button variant="secondary" onClick={closeFillFlow}>Cancel</Button>
              <Button onClick={applyFill}>Apply & render</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {resultOpen && filledImage && (
        <Dialog open={resultOpen && !!filledImage} onOpenChange={(o) => { if (!o) closeFillFlow() }}>
          <DialogContent className="wm-dialog">
            <DialogHeader className="text-left">
              <DialogTitle>Filled form</DialogTitle>
              <p className="engine-badge">Compared with the original scan</p>
              <div className="badge-row">
                {analysis?.matchSource === 'llm' ? (
                  <span className="status-badge llm">Values: AI matching</span>
                ) : (
                  <span className="status-badge warn">Values: keyword matching</span>
                )}
              </div>
            </DialogHeader>
            <div className="fill-compare">
              <div className="fill-col">
                <span>Original</span>
                <ZoomableImage
                  src={captured ?? ''}
                  alt="Original form"
                  onClick={() => {
                    if (!captured || !filledImage) return
                    openFullscreenImage({
                      originalSrc: captured,
                      originalAlt: 'Original form',
                      filledSrc: filledImage,
                      filledAlt: 'Filled form',
                      title: 'Form preview',
                      subtitle: 'Inspect the original and filled versions side by side',
                    })
                  }}
                />
              </div>
              <div className="fill-col">
                <span>Filled</span>
                <ZoomableImage
                  src={filledImage ?? ''}
                  alt="Filled form"
                  onClick={() => {
                    if (!captured || !filledImage) return
                    openFullscreenImage({
                      originalSrc: captured,
                      originalAlt: 'Original form',
                      filledSrc: filledImage,
                      filledAlt: 'Filled form',
                      title: 'Form preview',
                      subtitle: 'Inspect the original and filled versions side by side',
                    })
                  }}
                />
              </div>
            </div>
            <p className="zoom-hint">Scroll to zoom · drag to pan · double-click to toggle 2×</p>
            {fillSkipped.length > 0 && (
              <p className="fill-skip-note">
                Skipped {fillSkipped.length} field{fillSkipped.length === 1 ? '' : 's'} (no clean
                blank space to write in): {fillSkipped.join(', ')}
              </p>
            )}
            <div className="wm-dialog-actions">
              <Button variant="secondary" onClick={closeFillFlow}>Done</Button>
              <Button variant="secondary" onClick={shareFilled}>Share</Button>
              <Button variant="secondary" onClick={saveFilled}>Download</Button>
              <Button onClick={saveFilledToHistory} disabled={filledSaved || fillBusy}>
                {filledSaved ? 'Saved ✓' : fillBusy ? <span className="spinner" /> : 'Save to history'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {scanDetail && (
        <Dialog open={!!scanDetail} onOpenChange={(o) => { if (!o) setScanDetail(null) }}>
          <DialogContent className="wm-dialog">
            <div className="detail-title-block">
              <Input
                className="detail-name-input w-full border-transparent bg-transparent px-0 text-lg font-semibold"
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={() => {
                  const trimmed = nameDraft.trim()
                  if (trimmed && trimmed !== scanDetail.name) {
                    renameScan(scanDetail.id, trimmed)
                  } else if (!trimmed) {
                    setNameDraft(scanDetail.name)
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                }}
                aria-label="Scan name"
              />
              <div className="badge-row">
                {scanBadge(scanDetail)}
                <span className="status-badge ok">
                  {scanDetail.scan_type === 'pdf' ? 'PDF' : 'Image'} · {scanDetail.source}
                </span>
              </div>
            </div>
            <p className="detail-date">
              {fmtDate(scanDetail.created_at)} · {fmtTime(scanDetail.created_at)}
              {scanDetail.pages > 1 ? ` · ${scanDetail.pages} pages` : ''}
            </p>
            <div className="fill-compare">
              <div className="fill-col">
                <span>Original (unfilled)</span>
                <ZoomableImage
                  src={scanDetail.preview_image}
                  alt="Original scan"
                  onClick={() => {
                    if (!scanDetail.filled_image) return
                    openFullscreenImage({
                      originalSrc: scanDetail.preview_image,
                      originalAlt: 'Original scan',
                      filledSrc: scanDetail.filled_image,
                      filledAlt: 'Filled form',
                      title: scanDetail.name,
                      subtitle: 'Inspect the scan and filled result in full screen',
                    })
                  }}
                />
              </div>
              {scanDetail.filled_image ? (
                <div className="fill-col">
                  <span>Filled</span>
                  <ZoomableImage
                    src={scanDetail.filled_image}
                    alt="Filled form"
                    onClick={() => {
                      openFullscreenImage({
                        originalSrc: scanDetail.preview_image,
                        originalAlt: 'Original scan',
                        filledSrc: scanDetail.filled_image,
                        filledAlt: 'Filled form',
                        title: scanDetail.name,
                        subtitle: 'Inspect the scan and filled result in full screen',
                      })
                    }}
                  />
                </div>
              ) : (
                <div className="fill-col">
                  <span>Filled</span>
                  <div className="detail-no-filled">
                    <p>No filled version yet.</p>
                    <p>Scan again and tap “Fill form”, then “Save to history”.</p>
                  </div>
                </div>
              )}
            </div>
            <p className="zoom-hint">Scroll to zoom · drag to pan · double-click to toggle 2×</p>
            {scanDetail.ocr_text && (
              <pre className="ocr-text detail-text">{scanDetail.ocr_text}</pre>
            )}
            <div className="wm-dialog-actions">
              <Button
                variant="destructive"
                onClick={() => deleteScan(scanDetail.id)}
              >
                Delete
              </Button>
              <Button
                variant="secondary"
                onClick={() => downloadImage(scanDetail.preview_image, `snappy-scan-${scanDetail.id}.jpg`)}
              >
                Download original
              </Button>
              {scanDetail.filled_image && (
                <Button
                  onClick={() => downloadImage(scanDetail.filled_image, `snappy-filled-${scanDetail.id}.jpg`)}
                >
                  Download filled
                </Button>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {cropOpen && captured && (
        <CropImage
          src={captured}
          onCancel={() => setCropOpen(false)}
          onCrop={(cropped) => {
            setCaptured(cropped)
            setCropOpen(false)
            showToast('Scan cropped')
          }}
        />
      )}

      {fullscreenImage && (
        <FullscreenImageViewer
          open={!!fullscreenImage}
          onClose={() => setFullscreenImage(null)}
          originalSrc={fullscreenImage.originalSrc}
          originalAlt={fullscreenImage.originalAlt}
          filledSrc={fullscreenImage.filledSrc}
          filledAlt={fullscreenImage.filledAlt}
          title={fullscreenImage.title}
          subtitle={fullscreenImage.subtitle}
        />
      )}

      {settingsOpen && (
        <Dialog open={settingsOpen} onOpenChange={(o) => { if (!o) setSettingsOpen(false) }}>
          <DialogContent className="wm-dialog">
            <DialogHeader className="text-left">
              <DialogTitle>OCR settings</DialogTitle>
              <p className="engine-badge">
                Engine: {engine === 'server' ? 'Unlimited-OCR server' : 'On-device (Tesseract)'}
              </p>
            </DialogHeader>
            <div className="settings-field">
              <label htmlFor="ocr-url">OCR server URL (vLLM / SGLang)</label>
              <Input
                id="ocr-url"
                value={serverUrlInput}
                onChange={(e) => setServerUrlInput(e.target.value)}
                placeholder="http://192.168.1.50:8000"
                inputMode="url"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
              <p className="settings-hint">
                Point to a server running baidu/Unlimited-OCR (served as{' '}
                <code>Unlimited-OCR</code>). Leave empty to always use on-device OCR.
              </p>
            </div>
            <div className="settings-divider" />
            <div className="settings-field">
              <label htmlFor="llm-url">AI assistant (OpenAI-compatible)</label>
              <Input
                id="llm-url"
                value={llm.url}
                onChange={(e) => setLlm({ ...llm, url: e.target.value })}
                placeholder="https://api.openai.com/v1"
                inputMode="url"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
              <Input
                value={llm.apiKey}
                onChange={(e) => setLlm({ ...llm, apiKey: e.target.value })}
                placeholder="API key (stored on this device)"
                type="password"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
              <Input
                value={llm.model}
                onChange={(e) => setLlm({ ...llm, model: e.target.value })}
                placeholder="Model, e.g. gpt-4o-mini"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
              <div className="model-picker">
                <Button
                  variant="secondary"
                  className="btn-test"
                  onClick={loadModels}
                  disabled={modelsLoading || !llm.url.trim()}
                >
                  {modelsLoading ? <span className="spinner" /> : 'List available models'}
                </Button>
                {modelsError && <p className="llm-test-msg fail">{modelsError}</p>}
                {modelOptions.length > 0 && (
                  <select
                    className="model-select"
                    value={llm.model}
                    onChange={(e) => setLlm({ ...llm, model: e.target.value })}
                  >
                    <option value="">Choose a model…</option>
                    {modelOptions.map((id) => (
                      <option key={id} value={id}>
                        {id}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div className="switch-inline flex items-center">
                <Switch
                  checked={llm.vision}
                  onCheckedChange={(c) => setLlm({ ...llm, vision: c })}
                />
                <p className="settings-hint">Vision-capable (can read the form image directly)</p>
              </div>
              <p className="settings-hint">
                Used to understand the form and choose values. Falls back to keyword
                matching when empty or unreachable.
              </p>
              <div className="llm-test-row">
                <Button
                  variant="secondary"
                  className="btn-test"
                  onClick={testLlm}
                  disabled={llmTesting || !llm.url.trim()}
                >
                  {llmTesting ? <span className="spinner" /> : 'Test connection'}
                </Button>
                {llmTestMsg && (
                  <span className={`llm-test-msg ${llmTestOk ? 'ok' : 'fail'}`}>
                    {llmTestMsg}
                  </span>
                )}
              </div>
            </div>
            <div className="wm-dialog-actions">
              <Button onClick={saveSettings}>Save</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      <nav className="tab-bar">
        {(
          [
            ['home', 'Home'],
            ['scans', 'Scans'],
            ['history', 'History'],
            ['profile', 'Profile'],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            className={tab === key ? 'tab-item active' : 'tab-item'}
            onClick={() => setTab(key)}
          >
            <span className="tab-icon">
              {key === 'home' && (
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                  <polyline points="9 22 9 12 15 12 15 22" />
                </svg>
              )}
              {key === 'scans' && (
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="4" />
                  <circle cx="9" cy="9" r="2" />
                  <path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />
                </svg>
              )}
              {key === 'history' && (
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              )}
              {key === 'profile' && (
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              )}
            </span>
            <span className="tab-label">{label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
