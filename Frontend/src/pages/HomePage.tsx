import { useEffect, useState } from 'react'
import { MotionConfig, motion } from 'framer-motion'
import { toast } from 'sonner'

import ProfilePage from './ProfilePage'
import CaptureFlow from './home/CaptureFlow'
import TabBar from '../components/TabBar'
import type { Tab } from '../components/TabBar'
import ScansLibrary from '../components/ScansLibrary'
import HistoryList from '../components/HistoryList'
import ScanDetailDialog from '../components/dialogs/ScanDetailDialog'
import EngineSettingsDialog from '../components/dialogs/EngineSettingsDialog'
import FullscreenImageViewer from '../components/FullscreenImageViewer'
import { Avatar, AvatarFallback } from '../components/ui/avatar'
import { Gear } from '../components/icons'
import {
  apiDeleteScan,
  apiListScans,
  apiRenameScan,
  getSession,
} from '../lib/api'
import type { ScanRecord } from '../lib/api'
import { useEngineSettings } from '../hooks/useEngineSettings'

interface HomePageProps {
  onLogout: () => void
}

const TAB_INDEX: Record<Tab, number> = { home: 0, scans: 1, history: 2, profile: 3 }

// Enter-only, keyed on the active tab. AnimatePresence exit is not used
// here: framer-motion 12.43 + React 19 leaves exiting children mounted
// under `mode="wait"`, which strands the previous panel on screen.
const tabTransition = { duration: 0.24, ease: [0.22, 1, 0.36, 1] as const }

export default function HomePage({ onLogout }: HomePageProps) {
  const session = getSession()
  const userName = session?.user?.name?.trim() ?? ''
  const firstName = userName.split(/\s+/)[0] ?? ''
  const avatarLetter = (userName[0] ?? 'S').toUpperCase()

  const [tab, setTab] = useState<Tab>('home')
  const [tabDir, setTabDir] = useState(0)

  const [scans, setScans] = useState<ScanRecord[]>([])
  const [scanDetail, setScanDetail] = useState<ScanRecord | null>(null)
  const [nameDraft, setNameDraft] = useState('')
  const [historySearch, setHistorySearch] = useState('')
  const [historyType, setHistoryType] = useState('')
  const [historyStatus, setHistoryStatus] = useState('')
  const [detailInspect, setDetailInspect] = useState<ScanRecord | null>(null)

  const settings = useEngineSettings()

  useEffect(() => {
    const s = getSession()
    if (!s) return
    let cancelled = false
    apiListScans(s.token)
      .then((list) => {
        if (!cancelled) setScans(list)
      })
      .catch(() => {
        if (!cancelled) toast('Could not load scan history')
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (scanDetail) setNameDraft(scanDetail.name)
  }, [scanDetail?.id, scanDetail?.name])

  const changeTab = (next: Tab) => {
    if (next === tab) return
    setTabDir(TAB_INDEX[next] - TAB_INDEX[tab])
    setTab(next)
  }

  const upsertScan = (record: ScanRecord) =>
    setScans((prev) => {
      const exists = prev.some((s) => s.id === record.id)
      return exists ? prev.map((s) => (s.id === record.id ? record : s)) : [record, ...prev]
    })

  const filteredScans = scans.filter((s) => {
    const q = historySearch.trim().toLowerCase()
    if (q && !s.ocr_text.toLowerCase().includes(q)) return false
    if (historyType && s.scan_type !== historyType) return false
    if (historyStatus === 'filled' && !s.filled_at) return false
    if (historyStatus === 'ocr' && s.filled_at) return false
    return true
  })

  const deleteScan = async (id: number) => {
    const s = getSession()
    if (!window.confirm('Delete this scan?')) return
    if (s) {
      try {
        await apiDeleteScan(s.token, id)
      } catch {
        toast('Could not delete on server')
      }
    }
    setScans((prev) => prev.filter((x) => x.id !== id))
    setScanDetail((prev) => (prev && prev.id === id ? null : prev))
  }

  const renameScan = async (id: number, name: string) => {
    const s = getSession()
    if (!s) return
    try {
      const updated = await apiRenameScan(s.token, id, name.trim())
      setScans((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))
      setScanDetail((prev) => (prev && prev.id === updated.id ? updated : prev))
    } catch {
      toast('Could not rename — server offline')
    }
  }

  const downloadImage = (dataUrl: string, name: string) => {
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = name
    a.click()
  }

  return (
    <MotionConfig reducedMotion="user">
    <div className="flex min-h-[100dvh] flex-col">
      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-border bg-surface-page/90 px-5 py-3 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <Avatar
            size="lg"
            className="grid size-10 place-items-center rounded-full bg-[image:var(--accent-grad)] text-[15px] font-bold text-text-on-accent shadow-sm"
          >
            <AvatarFallback className="bg-transparent text-inherit">{avatarLetter}</AvatarFallback>
          </Avatar>
          <div className="leading-tight">
            <p className="text-xs text-text-muted">Hey {firstName || 'there'}</p>
            <div className="flex items-center gap-1.5">
              <img className="h-[18px] w-5" src="/icon.svg" alt="" />
              <p className="font-display text-[17px] font-semibold tracking-tight">Snappy</p>
            </div>
          </div>
        </div>
        <button
          className="grid size-10 place-items-center rounded-full border border-border bg-surface-raised text-text-muted transition-colors hover:border-border-strong hover:text-accent"
          onClick={settings.openSettings}
          aria-label="OCR settings"
          title="OCR settings"
        >
          <Gear size={20} />
        </button>
      </header>

      <main className="flex flex-1 flex-col px-5 pt-2 [padding-bottom:calc(84px+env(safe-area-inset-bottom))]">
        {/* Home stays mounted so an in-progress capture and the camera
            stream survive a detour to another tab. */}
        <div className={tab === 'home' ? 'flex flex-1 flex-col' : 'hidden'}>
          <CaptureFlow
            onScanCreated={upsertScan}
            onScanUpdated={upsertScan}
            onNeedProfile={() => changeTab('profile')}
          />
        </div>

        {tab !== 'home' && (
          <motion.div
            key={tab}
            className="flex flex-1 flex-col"
            initial={{ opacity: 0, x: tabDir >= 0 ? 22 : -22 }}
            animate={{ opacity: 1, x: 0 }}
            transition={tabTransition}
          >
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

            {tab === 'profile' && <ProfilePage showToast={toast} onLogout={onLogout} />}
          </motion.div>
        )}
      </main>

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
            scanDetail.filled_image ? () => setDetailInspect(scanDetail) : undefined
          }
        />
      )}

      {detailInspect && detailInspect.filled_image && (
        <FullscreenImageViewer
          open
          onClose={() => setDetailInspect(null)}
          originalSrc={detailInspect.preview_image}
          originalAlt="Original scan"
          filledSrc={detailInspect.filled_image}
          filledAlt="Filled form"
          title={detailInspect.name}
          subtitle="Inspect the scan and filled result in full screen"
        />
      )}

      {settings.open && (
        <EngineSettingsDialog
          serverUrl={settings.serverUrlInput}
          onServerUrl={settings.setServerUrlInput}
          serverKey={settings.serverKeyInput}
          onServerKey={settings.setServerKeyInput}
          llm={settings.llm}
          onLlm={settings.setLlm}
          modelOptions={settings.modelOptions}
          modelsLoading={settings.modelsLoading}
          modelsError={settings.modelsError}
          onLoadModels={settings.loadModels}
          ocrTesting={settings.ocrTesting}
          ocrTestOk={settings.ocrTestOk}
          ocrTestMsg={settings.ocrTestMsg}
          onTestOcr={settings.testOcr}
          llmTesting={settings.llmTesting}
          llmTestOk={settings.llmTestOk}
          llmTestMsg={settings.llmTestMsg}
          onTestLlm={settings.testLlm}
          engineLabel={settings.engine === 'server' ? 'Unlimited-OCR server' : 'On-device (Tesseract)'}
          onClose={settings.close}
          onSave={settings.saveSettings}
        />
      )}

      <TabBar tab={tab} onTabChange={changeTab} />
    </div>
    </MotionConfig>
  )
}
