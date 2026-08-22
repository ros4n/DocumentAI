import { Button } from '../ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog'
import { Input } from '../ui/input'
import { Switch } from '../ui/switch'
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
          <DialogTitle>OCR settings</DialogTitle>
          <p className="engine-badge">Engine: {engineLabel}</p>
        </DialogHeader>

        <div className="settings-field">
          <label htmlFor="ocr-url">OCR server URL (vLLM / SGLang)</label>
          <Input
            id="ocr-url"
            value={serverUrl}
            onChange={(e) => onServerUrl(e.target.value)}
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
          <Input
            value={serverKey}
            onChange={(e) => onServerKey(e.target.value)}
            placeholder="API key (optional, sent as Bearer token)"
            type="password"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
          <div className="model-picker">
            <Button
              variant="secondary"
              className="btn-test"
              onClick={onTestOcr}
              loading={ocrTesting}
              disabled={ocrTesting || !serverUrl.trim()}
            >
              Test connection
            </Button>
            {ocrTestMsg && (
              <span className={`llm-test-msg ${ocrTestOk ? 'ok' : 'fail'}`}>
                {ocrTestMsg}
              </span>
            )}
          </div>
        </div>

        <div className="settings-divider" />

        <div className="settings-field">
          <label htmlFor="llm-url">AI assistant (OpenAI-compatible)</label>
          <Input
            id="llm-url"
            value={llm.url}
            onChange={(e) => onLlm({ ...llm, url: e.target.value })}
            placeholder="https://api.openai.com/v1"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
          <Input
            value={llm.apiKey}
            onChange={(e) => onLlm({ ...llm, apiKey: e.target.value })}
            placeholder="API key (stored on this device)"
            type="password"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
          <Input
            value={llm.model}
            onChange={(e) => onLlm({ ...llm, model: e.target.value })}
            placeholder="Model, e.g. gpt-4o-mini"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
          <div className="model-picker">
            <Button
              variant="secondary"
              className="btn-test"
              onClick={onLoadModels}
              loading={modelsLoading}
              disabled={modelsLoading || !llm.url.trim()}
            >
              List available models
            </Button>
            {modelsError && <p className="llm-test-msg fail">{modelsError}</p>}
            {modelOptions.length > 0 && (
              <select
                className="model-select"
                value={llm.model}
                onChange={(e) => onLlm({ ...llm, model: e.target.value })}
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
              onCheckedChange={(c) => onLlm({ ...llm, vision: c })}
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
              onClick={onTestLlm}
              loading={llmTesting}
              disabled={llmTesting || !llm.url.trim()}
            >
              Test connection
            </Button>
            {llmTestMsg && (
              <span className={`llm-test-msg ${llmTestOk ? 'ok' : 'fail'}`}>
                {llmTestMsg}
              </span>
            )}
          </div>
        </div>

        <div className="wm-dialog-actions">
          <Button onClick={onSave}>Save</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
