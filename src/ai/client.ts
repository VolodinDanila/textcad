import type { Diagnostic } from '../dsl/index.ts'
import { localizeText, type Locale } from '../i18n/messages.ts'

export type AiChatHistoryItem = {
    role: 'user' | 'assistant'
    text: string
}

export type AiEditProposal = {
    message: string
    source: string
    changed: boolean
}

type RequestAiEditOptions = {
    message: string
    source: string
    diagnostics: Diagnostic[]
    history: AiChatHistoryItem[]
    signal?: AbortSignal
    language?: Locale
}

function formatDiagnostic(diagnostic: Diagnostic) {
    const { line, column } = diagnostic.sourceSpan.start
    return `${diagnostic.code} at ${line}:${column}: ${diagnostic.message}`
}

export async function requestAiEdit({
    message,
    source,
    diagnostics,
    history,
    signal,
    language = 'ru',
}: RequestAiEditOptions): Promise<AiEditProposal> {
    const response = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            message,
            source,
            diagnostics: diagnostics.map(formatDiagnostic),
            history: history.slice(-8),
            language,
        }),
        signal,
    })

    const body = await response.json() as Partial<AiEditProposal> & { error?: string }
    if (!response.ok) {
        throw new Error(localizeText(body.error || 'ИИ-помощник сейчас недоступен.', language))
    }
    if (
        typeof body.message !== 'string'
        || typeof body.source !== 'string'
        || typeof body.changed !== 'boolean'
    ) {
        throw new Error(localizeText('ИИ-помощник вернул некорректный ответ.', language))
    }

    return {
        message: body.message,
        source: body.source,
        changed: body.changed,
    }
}
