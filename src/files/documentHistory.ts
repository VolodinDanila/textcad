import type { TextCadFileHandle } from './textCadFile.ts'

export const HISTORY_LIMITS = { versions: 100, documentBytes: 5 * 1024 * 1024, totalBytes: 25 * 1024 * 1024, documents: 100 }
export const HISTORY_IDLE_MS = 1500
export const HISTORY_INTERVAL_MS = 10000

export type HistoryReason = 'session' | 'new' | 'open' | 'edit' | 'checkpoint' | 'save' | 'before-ai' | 'ai' | 'before-restore' | 'restore'
export const HISTORY_LABELS: Record<HistoryReason, string> = {
    session: 'Начало сеанса', new: 'Новый документ', open: 'Открытие файла', edit: 'Правка Source',
    checkpoint: 'Контрольная точка', save: 'Сохранение файла', 'before-ai': 'До изменения ИИ', ai: 'Изменение ИИ',
    'before-restore': 'До восстановления', restore: 'Восстановление версии',
}
export type HistoryVersion = { id: string; documentId: string; createdAt: number; reason: HistoryReason; source: string; bytes: number }
export type HistoryDocument = { id: string; name: string; updatedAt: number; bytes: number; savedDigest?: string; savedDigests?: string[]; handle?: TextCadFileHandle | null }
export type HistorySession = { id: string; name: string; source: string }

const isAutomatic = (reason: HistoryReason) => reason === 'edit' || reason === 'session'
export const historyBytes = (source: string) => new TextEncoder().encode(source).byteLength

/** Coalesce identical consecutive contents and retain deliberate checkpoints first. */
export function appendHistoryVersion(versions: HistoryVersion[], candidate: HistoryVersion) {
    if (candidate.bytes > HISTORY_LIMITS.documentBytes) throw new Error('Source больше 5 МБ: локальная версия не сохранена. Сохраните файл вручную.')
    const next = [...versions].sort((a, b) => a.createdAt - b.createdAt)
    const last = next.at(-1)
    if (last?.source === candidate.source) {
        if (isAutomatic(last.reason) && !isAutomatic(candidate.reason)) next[next.length - 1] = { ...last, reason: candidate.reason }
    } else next.push(candidate)
    let bytes = next.reduce((sum, version) => sum + version.bytes, 0)
    while (next.length > HISTORY_LIMITS.versions || bytes > HISTORY_LIMITS.documentBytes) {
        const automatic = next.findIndex((version, index) => index < next.length - 1 && isAutomatic(version.reason))
        const index = automatic >= 0 ? automatic : 0
        bytes -= next[index].bytes
        next.splice(index, 1)
    }
    return next
}

export function historyEvictions(documents: HistoryDocument[], activeId: string) {
    let bytes = documents.reduce((sum, item) => sum + item.bytes, 0)
    let count = documents.length
    const ids: string[] = []
    for (const item of documents.filter((doc) => doc.id !== activeId).sort((a, b) => a.updatedAt - b.updatedAt)) {
        if (bytes <= HISTORY_LIMITS.totalBytes && count <= HISTORY_LIMITS.documents) break
        ids.push(item.id); bytes -= item.bytes; count -= 1
    }
    return ids
}

const requestResult = <T>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Не удалось прочитать историю.'))
})
const transactionDone = (transaction: IDBTransaction) => new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(transaction.error ?? new Error('Не удалось сохранить историю.'))
    transaction.onerror = () => reject(transaction.error ?? new Error('Не удалось сохранить историю.'))
})

/** Stable native handles distinguish equal filenames in different folders. */
export async function matchHistoryDocument(documents: HistoryDocument[], name: string, digest: string, handle: TextCadFileHandle | null) {
    if (handle?.isSameEntry) {
        for (const document of documents) {
            if (!document.handle) continue
            try { if (await handle.isSameEntry(document.handle)) return document } catch { /* Fall back only for records without usable native handles. */ }
        }
    }
    const candidates = documents.filter((doc) => doc.name === name && (doc.savedDigest === digest || doc.savedDigests?.includes(digest)) && (!handle || !doc.handle))
    // Upload-only browsers expose neither path nor persistent handle. Do not guess if ambiguous.
    return candidates.length === 1 ? candidates[0] : undefined
}

class DocumentHistoryStore {
    private database: Promise<IDBDatabase> | undefined
    private queue: Promise<unknown> = Promise.resolve()

    private open() {
        if (!this.database) this.database = new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open('textcad-file-history', 1)
            request.onupgradeneeded = () => {
                const db = request.result
                db.createObjectStore('documents', { keyPath: 'id' })
                db.createObjectStore('versions', { keyPath: 'id' }).createIndex('documentId', 'documentId')
            }
            request.onerror = () => { this.database = undefined; reject(request.error) }
            request.onblocked = () => { this.database = undefined; reject(new Error('Закройте другие вкладки TextCAD, чтобы открыть хранилище истории.')) }
            request.onsuccess = () => {
                const db = request.result
                db.onversionchange = () => { db.close(); this.database = undefined }
                resolve(db)
            }
        })
        return this.database
    }

    private serial<T>(action: () => Promise<T>): Promise<T> {
        const result = this.queue.then(action, action)
        this.queue = result.catch(() => undefined)
        return result
    }

    private async documents() {
        const db = await this.open()
        return requestResult(db.transaction('documents').objectStore('documents').getAll()) as Promise<HistoryDocument[]>
    }

    private removeDocument(transaction: IDBTransaction, id: string) {
        transaction.objectStore('documents').delete(id)
        const store = transaction.objectStore('versions')
        const cursor = store.index('documentId').openKeyCursor(IDBKeyRange.only(id))
        cursor.onsuccess = () => {
            if (!cursor.result) return
            store.delete(cursor.result.primaryKey)
            cursor.result.continue()
        }
    }

    /** Read and update in one transaction, also serializing edits from other tabs. */
    private async recordNow(session: HistorySession, entries: Array<{ source: string; reason: HistoryReason }>, file?: { digest: string; handle: TextCadFileHandle | null }, forkFromId?: string) {
        const db = await this.open()
        const tx = db.transaction(['documents', 'versions'], 'readwrite')
        const done = transactionDone(tx)
        // Attach rejection handling before awaiting requests (a quota error can abort early).
        void done.catch(() => undefined)
        try {
            const docs = tx.objectStore('documents')
            const store = tx.objectStore('versions')
            const [all, previous, ancestors] = await Promise.all([
                requestResult(docs.getAll()) as Promise<HistoryDocument[]>,
                requestResult(store.index('documentId').getAll(session.id)) as Promise<HistoryVersion[]>,
                forkFromId ? requestResult(store.index('documentId').getAll(forkFromId)) as Promise<HistoryVersion[]> : Promise.resolve([]),
            ])
            let next = previous.length ? previous : ancestors.map((version) => ({ ...version, id: crypto.randomUUID(), documentId: session.id }))
            let timestamp = Math.max(Date.now(), ...next.map((version) => version.createdAt + 1))
            for (const entry of entries) {
                next = appendHistoryVersion(next, { id: crypto.randomUUID(), documentId: session.id, createdAt: timestamp++, reason: entry.reason, source: entry.source, bytes: historyBytes(entry.source) })
            }
            const oldMeta = all.find((item) => item.id === session.id)
            const metadata: HistoryDocument = { ...oldMeta, id: session.id, name: session.name, updatedAt: Date.now(), bytes: next.reduce((sum, version) => sum + version.bytes, 0) }
            if (file) {
                metadata.savedDigest = file.digest; metadata.handle = file.handle
                metadata.savedDigests = [...new Set([...(oldMeta?.savedDigests ?? []), file.digest])].slice(-HISTORY_LIMITS.versions)
            }
            const retained = new Set(next.map((version) => version.id))
            for (const version of previous) if (!retained.has(version.id)) store.delete(version.id)
            for (const version of next) store.put(version)
            docs.put(metadata)
            for (const id of historyEvictions([...all.filter((item) => item.id !== session.id), metadata], session.id)) this.removeDocument(tx, id)
            await done
            return next.sort((a, b) => b.createdAt - a.createdAt)
        } catch (error) {
            try { tx.abort() } catch { /* The transaction may already have aborted. */ }
            throw error
        }
    }

    record(session: HistorySession, reason: HistoryReason) {
        return this.serial(() => this.recordNow(session, [{ source: session.source, reason }]))
    }

    restore(session: HistorySession, target: HistoryVersion) {
        if (session.id !== target.documentId) return Promise.reject(new Error('Эта версия относится к другому документу.'))
        return this.serial(() => this.recordNow(session, [
            { source: session.source, reason: 'before-restore' }, { source: target.source, reason: 'restore' },
        ]))
    }

    recordAiEdit(session: HistorySession, source: string) {
        return this.serial(() => this.recordNow(session, [
            { source: session.source, reason: 'before-ai' }, { source, reason: 'ai' },
        ]))
    }

    async fileSession(name: string, source: string, handle: TextCadFileHandle | null, reason: 'open' | 'save', preferredId?: string, forkFromId?: string) {
        const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source)))].map((byte) => byte.toString(16).padStart(2, '0')).join('')
        return this.serial(async () => {
            const existing = await matchHistoryDocument(await this.documents(), name, digest, handle)
            const id = preferredId ?? existing?.id ?? crypto.randomUUID()
            await this.recordNow({ id, name, source }, [{ source, reason }], { digest, handle }, existing ? undefined : forkFromId)
            return id
        })
    }
}

export const documentHistory = new DocumentHistoryStore()
