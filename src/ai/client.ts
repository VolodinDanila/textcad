import type { Diagnostic } from '../dsl'

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
}: RequestAiEditOptions): Promise<AiEditProposal> {
    const response = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            message,
            source,
            diagnostics: diagnostics.map(formatDiagnostic),
            history: history.slice(-8),
        }),
        signal,
    })

    const body = await response.json() as Partial<AiEditProposal> & { error?: string }
    if (!response.ok) {
        throw new Error(body.error || 'ИИ-помощник сейчас недоступен.')
    }
    if (
        typeof body.message !== 'string'
        || typeof body.source !== 'string'
        || typeof body.changed !== 'boolean'
    ) {
        throw new Error('ИИ-помощник вернул некорректный ответ.')
    }

    return {
        message: body.message,
        source: body.source,
        changed: body.changed,
    }
}
