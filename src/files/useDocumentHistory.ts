import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
    documentHistory, HISTORY_IDLE_MS, HISTORY_INTERVAL_MS,
    type HistoryReason, type HistorySession, type HistoryVersion,
} from './documentHistory.ts'

type HistoryState = { documentId: string; versions: HistoryVersion[]; error: string }
const errorMessage = (error: unknown) => error instanceof Error && error.name !== 'QuotaExceededError'
    ? error.message : 'Не удалось сохранить локальную историю. Проверьте свободное место и сохраните файл вручную.'

export function useDocumentHistory(session: HistorySession) {
    const [state, setState] = useState<HistoryState>({ documentId: '', versions: [], error: '' })
    const active = useRef(session)
    useLayoutEffect(() => { active.current = session }, [session])
    const firstEditAt = useRef<number | null>(null)

    const reportError = useCallback((id: string, error: unknown) => {
        if (active.current.id !== id) return
        setState((previous) => ({ documentId: id, versions: previous.documentId === id ? previous.versions : [], error: errorMessage(error) }))
    }, [])
    const publish = useCallback((id: string, versions: HistoryVersion[]) => {
        if (active.current.id === id) setState({ documentId: id, versions, error: '' })
    }, [])
    const checkpoint = useCallback(async (snapshot: HistorySession, reason: HistoryReason) => {
        try {
            const versions = await documentHistory.record(snapshot, reason)
            publish(snapshot.id, versions)
            return true
        } catch (error) { reportError(snapshot.id, error); return false }
    }, [publish, reportError])

    useEffect(() => {
        firstEditAt.current = null
        void checkpoint(active.current, 'session')
    }, [session.id, checkpoint])

    useEffect(() => {
        const snapshot = { ...session }
        firstEditAt.current ??= Date.now()
        const delay = Math.min(HISTORY_IDLE_MS, Math.max(0, HISTORY_INTERVAL_MS - (Date.now() - firstEditAt.current)))
        const timer = window.setTimeout(() => {
            firstEditAt.current = null
            void checkpoint(snapshot, 'edit')
        }, delay)
        return () => window.clearTimeout(timer)
    }, [session, checkpoint])

    useEffect(() => {
        const flush = () => { void checkpoint({ ...active.current }, 'edit') }
        const onVisibility = () => { if (document.visibilityState === 'hidden') flush() }
        window.addEventListener('pagehide', flush)
        document.addEventListener('visibilitychange', onVisibility)
        return () => {
            window.removeEventListener('pagehide', flush)
            document.removeEventListener('visibilitychange', onVisibility)
        }
    }, [checkpoint])

    const restore = useCallback(async (snapshot: HistorySession, target: HistoryVersion) => {
        try { publish(snapshot.id, await documentHistory.restore(snapshot, target)); return true }
        catch (error) { reportError(snapshot.id, error); return false }
    }, [publish, reportError])
    const aiEdit = useCallback(async (snapshot: HistorySession, source: string) => {
        try { publish(snapshot.id, await documentHistory.recordAiEdit(snapshot, source)) }
        catch (error) { reportError(snapshot.id, error) }
    }, [publish, reportError])

    return {
        versions: state.documentId === session.id ? state.versions : [],
        loading: state.documentId !== session.id,
        error: state.documentId === session.id ? state.error : '',
        checkpoint, restore, aiEdit, reportError,
    }
}
