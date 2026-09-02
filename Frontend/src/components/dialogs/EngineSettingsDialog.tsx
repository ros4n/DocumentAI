import type { ReactNode } from 'react'
import { Button } from '../ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog'
import { Switch } from '../ui/switch'
import { StatusPill, DialogActions } from './_shared'
import type { LlmConfig } from '../../lib/llm'

interface EngineSettingsDialogProps {
  serverUrl: string
  onServerUrl: (v: string) => void
  serverKey: string
  onServerKey: (v: string) => void
  llm: LlmConfig
  onLlm: (llm: LlmConfig) => void
  modelOptions: string[]
  modelsLoading: boolean
  modelsError: string
  onLoadModels: () => void
  ocrTesting: boolean
  ocrTestOk: boolean
  ocrTestMsg: string
  onTestOcr: () => void
  llmTesting: boolean
  llmTestOk: boolean
  llmTestMsg: string
  onTestLlm: () => void
  engineLabel: string
  onClose: () => void
  onSave: () => void
}

const inputCls =
  'h-10 w-full rounded-lg border border-border bg-surface-raised px-3 text-sm text-text outline-none transition-colors placeholder:text-text-faint focus:border-accent'

function Hint({ children }: { children: ReactNode }) {
  return <p className="text-xs leading-relaxed text-text-muted">{children}</p>
}

function TestMsg({ ok, children }: { ok: boolean; children: ReactNode }) {
  return <span className={`text-xs ${ok ? 'text-success' : 'text-danger'}`}>{children}</span>
}

export default function EngineSettingsDialog({
  serverUrl,
  onServerUrl,
  serverKey,
  onServerKey,
  llm,
  onLlm,
  modelOptions,
  modelsLoading,
  modelsError,
  onLoadModels,
  ocrTesting,
  ocrTestOk,
  ocrTestMsg,
  onTestOcr,
  llmTesting,
  llmTestOk,
  llmTestMsg,
  onTestLlm,
  engineLabel,
  onClose,
  onSave,
}: EngineSettingsDialogProps) {
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="wm-dialog">
        <DialogHeader className="text-left">
          <DialogTitle>Engine settings</DialogTitle>
          <div className="pt-1">
            <StatusPill tone={engineLabel.toLowerCase().includes('server') ? 'ok' : 'neutral'}>
              {engineLabel}
            </StatusPill>
          </div>
        </DialogHeader>

        <div className="flex flex-col gap-2.5">
          <label htmlFor="ocr-url" className="text-xs font-medium text-text-muted">
            OCR server URL (vLLM / SGLang)
          </label>
          <input
            id="ocr-url"
            className={inputCls}
            value={serverUrl}
            onChange={(e) => onServerUrl(e.target.value)}
            placeholder="http://192.168.1.50:8000"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
          <Hint>
            Point to a server running <code className="font-mono">Unlimited-OCR</code>. Leave empty to
            always use on-device OCR.
          </Hint>
          <input
            className={inputCls}
            value={serverKey}
            onChange={(e) => onServerKey(e.target.value)}
            placeholder="API key (optional, sent as Bearer token)"
            type="password"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={onTestOcr}
              loading={ocrTesting}
              disabled={ocrTesting || !serverUrl.trim()}
            >
              Test connection
            </Button>
            {ocrTestMsg && <TestMsg ok={ocrTestOk}>{ocrTestMsg}</TestMsg>}
          </div>
        </div>

        <div className="my-1 h-px bg-border" />

        <div className="flex flex-col gap-2.5">
          <label htmlFor="llm-url" className="text-xs font-medium text-text-muted">
            AI assistant (OpenAI-compatible)
          </label>
          <input
            id="llm-url"
            className={inputCls}
            value={llm.url}
            onChange={(e) => onLlm({ ...llm, url: e.target.value })}
            placeholder="https://api.openai.com/v1"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
          <input
            className={inputCls}
            value={llm.apiKey}
            onChange={(e) => onLlm({ ...llm, apiKey: e.target.value })}
            placeholder="API key (stored on this device)"
            type="password"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
          <input
            className={inputCls}
            value={llm.model}
            onChange={(e) => onLlm({ ...llm, model: e.target.value })}
            placeholder="Model, e.g. gpt-4o-mini"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={onLoadModels}
              loading={modelsLoading}
              disabled={modelsLoading || !llm.url.trim()}
            >
              List available models
            </Button>
            {modelsError && <TestMsg ok={false}>{modelsError}</TestMsg>}
          </div>
          {modelOptions.length > 0 && (
            <select
              className={inputCls}
              value={llm.model}
              onChange={(e) => onLlm({ ...llm, model: e.target.value })}
            >
              <option value="">Choose a model…</option>
              {modelOptions.map((id) => (
                <option key={id} value={id}>{id}</option>
              ))}
            </select>
          )}
          <label className="flex items-center gap-2.5">
            <Switch checked={llm.vision} onCheckedChange={(c) => onLlm({ ...llm, vision: c })} />
            <span className="text-xs text-text-muted">
              Vision-capable (can read the form image directly)
            </span>
          </label>
          <Hint>
            Used to understand the form and choose values. Falls back to keyword matching when empty
            or unreachable.
          </Hint>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={onTestLlm}
              loading={llmTesting}
              disabled={llmTesting || !llm.url.trim()}
            >
              Test connection
            </Button>
            {llmTestMsg && <TestMsg ok={llmTestOk}>{llmTestMsg}</TestMsg>}
          </div>
        </div>

        <DialogActions>
          <Button onClick={onSave}>Save</Button>
        </DialogActions>
      </DialogContent>
    </Dialog>
  )
}
