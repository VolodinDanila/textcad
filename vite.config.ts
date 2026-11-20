import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { textCadAiPlugin } from './server/textCadAiPlugin.ts'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const provider = ['agy', 'ollama', 'gemini', 'openai'].includes(env.AI_PROVIDER)
    ? env.AI_PROVIDER as 'agy' | 'ollama' | 'gemini' | 'openai'
    : 'ollama'
  const agyEffort = ['low', 'medium', 'high', 'xhigh', 'max'].includes(env.AGY_EFFORT)
    ? env.AGY_EFFORT as 'low' | 'medium' | 'high' | 'xhigh' | 'max'
    : 'low'
  const configuredAgyTimeout = Number(env.AGY_TIMEOUT_MS)
  const agyTimeoutMs = Number.isFinite(configuredAgyTimeout)
    ? Math.min(600_000, Math.max(1_000, configuredAgyTimeout))
    : 120_000

  return {
    plugins: [
      react(),
      textCadAiPlugin({
        provider,
        agy: {
          command: env.AGY_COMMAND || 'agy',
          model: env.AGY_MODEL || undefined,
          effort: agyEffort,
          timeoutMs: agyTimeoutMs,
        },
        ollamaUrl: env.OLLAMA_URL || 'http://127.0.0.1:11434',
        ollamaModel: env.OLLAMA_MODEL || 'qwen3:4b-instruct',
        geminiApiKey: env.GEMINI_API_KEY,
        geminiModel: env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
        openAiApiKey: env.OPENAI_API_KEY,
        openAiModel: env.OPENAI_MODEL || 'gpt-6.1-sol',
      }),
    ],
  }
})
