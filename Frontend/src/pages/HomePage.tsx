import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { toast } from 'sonner'
import ProfilePage from './ProfilePage'
import TabBar from '../components/TabBar'
import CaptureView from '../components/CaptureView'
import type { Tab } from '../components/TabBar'
import ScansLibrary from '../components/ScansLibrary'
import HistoryList from '../components/HistoryList'
import FullscreenImageViewer from '../components/FullscreenImageViewer'
import CropImage from '../components/CropImage'
import OcrResultDialog from '../components/dialogs/OcrResultDialog'
import ReviewFillsDialog from '../components/dialogs/ReviewFillsDialog'
import FillResultDialog from '../components/dialogs/FillResultDialog'
import ScanDetailDialog from '../components/dialogs/ScanDetailDialog'
import EngineSettingsDialog from '../components/dialogs/EngineSettingsDialog'
import { Avatar, AvatarFallback } from '../components/ui/avatar'
import { analyzeForm } from '../lib/formFill'
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
  getServerKey,
  setServerKey,
  testOcrServer,
} from '../lib/ocr'
import type { OcrResult } from '../lib/ocr'
import { downscaleDataUrl } from '../lib/image'
import { defaultScanName } from '../lib/scanFormat'

interface HomePageProps {
  onLogout: () => void
}

type FullscreenImageState = {
  originalSrc: string
  originalAlt: string
  filledSrc: string
  filledAlt: string
  title: string
  subtitle: string
}

const TAB_INDEX: Record<Tab, number> = { home: 0, scans: 1, history: 2, profile: 3 }

const tabVariants = {
  initial: (dir: number) => ({ opacity: 0, x: dir * 26 }),
  animate: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] as const },
  },
  exit: (dir: number) => ({
    opacity: 0,
    x: dir * -18,
    transition: { duration: 0.16 },
  }),
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
  const [tabDir, setTabDir] = useState(0)
  const [ocrBusy, setOcrBusy] = useState(false)
  const [ocrStatus, setOcrStatus] = useState('')
  const [ocrResult, setOcrResult] = useState<OcrResult | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [serverUrlInput, setServerUrlInput] = useState(getServerUrl())
  const [serverKeyInput, setServerKeyInput] = useState(getServerKey())
  const [ocrTesting, setOcrTesting] = useState(false)
  const [ocrTestOk, setOcrTestOk] = useState(false)
  const [ocrTestMsg, setOcrTestMsg] = useState('')
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

  const changeTab = (next: Tab) => {
    if (next === tab) return
    setTabDir(TAB_INDEX[next] - TAB_INDEX[tab])
    setTab(next)
  }

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
      changeTab('profile')
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
    setFilledImage(null)
    setFillSkipped([])
    setFilledSaved(false)
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
    setServerKeyInput(getServerKey())
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
    setServerKey(serverKeyInput)
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

  const testOcr = async () => {
    setOcrTesting(true)
    setOcrTestOk(false)
    setOcrTestMsg('')
    try {
      const reply = await testOcrServer()
      setOcrTestOk(true)
      setOcrTestMsg(reply.includes('OK') ? 'Connected — server replied OK' : `Connected — reply: ${reply}`)
    } catch (err) {
      setOcrTestOk(false)
      setOcrTestMsg((err as Error).message)
    } finally {
      setOcrTesting(false)
    }
  }

  const engine: 'server' | 'on-device' = serverUrlInput ? 'server' : 'on-device'

  const filteredScans = scans.filter((s) => {
    const q = historySearch.trim().toLowerCase()
    if (q && !s.ocr_text.toLowerCase().includes(q)) return false
    if (historyType && s.scan_type !== historyType) return false
    if (historyStatus === 'filled' && !s.filled_at) return false
    if (historyStatus === 'ocr' && s.filled_at) return false
    return true
  })

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

  return (
    <div className="home-page">
      <header className="home-header">
        <div className="home-user">
          <Avatar size="lg" className="avatar">
            <AvatarFallback>{avatarLetter}</AvatarFallback>
          </Avatar>
          <div>
            <p className="greeting">Hey {firstName || 'there'}</p>
            <div className="home-brand">
              <img className="home-logo" src="/icon.svg" alt="" />
              <p className="home-title">Snappy Scanner</p>
            </div>
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
        <AnimatePresence mode="wait" custom={tabDir} initial={false}>
          <motion.div
            key={tab}
            className="tab-panel"
            custom={tabDir}
            variants={tabVariants}
            initial="initial"
            animate="animate"
            exit="exit"
          >
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

                <CaptureView
                  videoRef={videoRef}
                  fileInputRef={fileInputRef}
                  pdfInputRef={pdfInputRef}
                  streamActive={streamActive}
                  cameraError={cameraError}
                  captured={captured}
                  ocrBusy={ocrBusy}
                  fillBusy={fillBusy}
                  fillStatus={fillStatus}
                  ocrStatus={ocrStatus}
                  onStartCamera={startCamera}
                  onCapture={capture}
                  onRetake={retake}
                  onSaveScan={saveScan}
                  onShareScan={shareScan}
                  onCrop={() => setCropOpen(true)}
                  onExtractText={extractFromCapture}
                  onStartFill={startFill}
                  onImageUpload={handleUpload}
                  onPdfUpload={handlePdfUpload}
                />
              </>
            )}

            {tab === 'scans' && (
              <ScansLibrary
                scans={scans}
                filtered={filteredScans}
                search={historySearch}
                onSearch={setHistorySearch}
                status={historyStatus}
                onStatus={setHistoryStatus}
                type={historyType}
                onType={setHistoryType}
                onSelect={(s) => setScanDetail(s)}
                onDelete={deleteScan}
                onNewScan={() => changeTab('home')}
              />
            )}

            {tab === 'history' && (
              <HistoryList
                scans={scans}
                filtered={filteredScans}
                onSelect={(s) => setScanDetail(s)}
                onNewScan={() => changeTab('home')}
              />
            )}

            {tab === 'profile' && <ProfilePage showToast={showToast} onLogout={onLogout} />}
          </motion.div>
        </AnimatePresence>
      </main>

      {ocrResult && (
        <OcrResultDialog
          result={ocrResult}
          onClose={() => setOcrResult(null)}
          onCopy={copyText}
          onDownload={downloadText}
        />
      )}

      {analysis && !resultOpen && (
        <ReviewFillsDialog
          analysis={analysis}
          edits={edits}
          onUpdateEdit={updateEdit}
          onSelectGroupOption={selectGroupOption}
          onToggleGroup={toggleGroup}
          onCancel={closeFillFlow}
          onApply={applyFill}
        />
      )}

      {resultOpen && filledImage && (
        <FillResultDialog
          analysis={analysis}
          originalSrc={captured ?? ''}
          filledImage={filledImage}
          fillSkipped={fillSkipped}
          filledSaved={filledSaved}
          fillBusy={fillBusy}
          onClose={closeFillFlow}
          onShare={async () => {
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
          }}
          onDownload={() => {
            if (!filledImage) return
            downloadImage(filledImage, `snappy-filled-${Date.now()}.jpg`)
            showToast('Filled form saved')
          }}
          onSaveToHistory={saveFilledToHistory}
          onInspect={
            captured && filledImage
              ? () =>
                  openFullscreenImage({
                    originalSrc: captured,
                    originalAlt: 'Original form',
                    filledSrc: filledImage,
                    filledAlt: 'Filled form',
                    title: 'Form preview',
                    subtitle: 'Inspect the original and filled versions side by side',
                  })
              : undefined
          }
        />
      )}

      {scanDetail && (
        <ScanDetailDialog
          scan={scanDetail}
          nameDraft={nameDraft}
          onNameDraft={setNameDraft}
          onRename={renameScan}
          onDelete={deleteScan}
          onDownloadImage={downloadImage}
          onClose={() => setScanDetail(null)}
          onInspect={
            scanDetail.filled_image
              ? () =>
                  openFullscreenImage({
                    originalSrc: scanDetail.preview_image,
                    originalAlt: 'Original scan',
                    filledSrc: scanDetail.filled_image,
                    filledAlt: 'Filled form',
                    title: scanDetail.name,
                    subtitle: 'Inspect the scan and filled result in full screen',
                  })
              : undefined
          }
        />
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
        <EngineSettingsDialog
          serverUrl={serverUrlInput}
          onServerUrl={setServerUrlInput}
          serverKey={serverKeyInput}
          onServerKey={setServerKeyInput}
          llm={llm}
          onLlm={setLlm}
          modelOptions={modelOptions}
          modelsLoading={modelsLoading}
          modelsError={modelsError}
          onLoadModels={loadModels}
          ocrTesting={ocrTesting}
          ocrTestOk={ocrTestOk}
          ocrTestMsg={ocrTestMsg}
          onTestOcr={testOcr}
          llmTesting={llmTesting}
          llmTestOk={llmTestOk}
          llmTestMsg={llmTestMsg}
          onTestLlm={testLlm}
          engineLabel={engine === 'server' ? 'Unlimited-OCR server' : 'On-device (Tesseract)'}
          onClose={() => setSettingsOpen(false)}
          onSave={saveSettings}
        />
      )}

      <TabBar tab={tab} onTabChange={changeTab} />
    </div>
  )
}
