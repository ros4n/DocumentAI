import { useState } from 'react'
import { toast } from 'sonner'

import {
  getServerUrl,
  setServerUrl,
  getServerKey,
  setServerKey,
  testOcrServer,
} from '../lib/ocr'
import {
  getLlmConfig,
  listModels,
  setLlmConfig,
  testConnection,
} from '../lib/llm'
import type { LlmConfig } from '../lib/llm'

/** Owns the OCR / AI engine settings dialog: form state, connection tests,
 *  model listing, persistence. */
export function useEngineSettings() {
  const [open, setOpen] = useState(false)
  const [serverUrlInput, setServerUrlInput] = useState(getServerUrl())
  const [serverKeyInput, setServerKeyInput] = useState(getServerKey())
  const [llm, setLlm] = useState<LlmConfig>(getLlmConfig)

  const [ocrTesting, setOcrTesting] = useState(false)
  const [ocrTestOk, setOcrTestOk] = useState(false)
  const [ocrTestMsg, setOcrTestMsg] = useState('')

  const [llmTesting, setLlmTesting] = useState(false)
  const [llmTestOk, setLlmTestOk] = useState(false)
  const [llmTestMsg, setLlmTestMsg] = useState('')

  const [modelOptions, setModelOptions] = useState<string[]>([])
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelsError, setModelsError] = useState('')

  const openSettings = () => {
    setServerUrlInput(getServerUrl())
    setServerKeyInput(getServerKey())
    setLlm(getLlmConfig())
    setOpen(true)
  }

  const saveSettings = () => {
    setServerUrl(serverUrlInput)
    setServerKey(serverKeyInput)
    setLlmConfig(llm)
    setOpen(false)
    toast('Settings saved')
  }

  const loadModels = async () => {
    setModelsLoading(true)
    setModelsError('')
    try {
      setModelOptions(await listModels(llm))
    } catch (err) {
      setModelsError((err as Error).message)
    } finally {
      setModelsLoading(false)
    }
  }

  const testLlm = async () => {
    setLlmTesting(true)
    setLlmTestOk(false)
    setLlmTestMsg('')
    try {
      const reply = await testConnection(llm)
      setLlmTestOk(true)
      setLlmTestMsg(
        reply.includes('OK') ? 'Connected — model replied OK' : `Connected — reply: ${reply}`
      )
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
      setOcrTestMsg(
        reply.includes('OK') ? 'Connected — server replied OK' : `Connected — reply: ${reply}`
      )
    } catch (err) {
      setOcrTestOk(false)
      setOcrTestMsg((err as Error).message)
    } finally {
      setOcrTesting(false)
    }
  }

  const engine: 'server' | 'on-device' = serverUrlInput ? 'server' : 'on-device'

  return {
    open,
    close: () => setOpen(false),
    openSettings,
    saveSettings,
    engine,
    serverUrlInput,
    setServerUrlInput,
    serverKeyInput,
    setServerKeyInput,
    llm,
    setLlm,
    ocrTesting,
    ocrTestOk,
    ocrTestMsg,
    testOcr,
    llmTesting,
    llmTestOk,
    llmTestMsg,
    testLlm,
    modelOptions,
    modelsLoading,
    modelsError,
    loadModels,
  }
}
