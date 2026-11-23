import assert from 'node:assert/strict'
import test from 'node:test'
import {
    appendHistoryVersion, documentHistory, historyBytes, historyEvictions, HISTORY_LIMITS, matchHistoryDocument,
    type HistoryDocument, type HistoryReason, type HistoryVersion,
} from '../../src/files/documentHistory.ts'
import type { TextCadFileHandle } from '../../src/files/textCadFile.ts'

const version = (time: number, source: string, reason: HistoryReason = 'edit'): HistoryVersion => ({
    id: `version-${time}`, documentId: 'a', createdAt: time, reason, source, bytes: historyBytes(source),
})
const metadata = (id: string, time = 0, bytes = 0): HistoryDocument => ({ id, name: 'part.textcad', updatedAt: time, bytes })

test('history stores exact source and counts UTF-8 bytes without geometry', () => {
    assert.equal(historyBytes('abc'), 3)
    assert.equal(historyBytes('ёж'), 4)
    assert.equal(historyBytes('🙂'), 4)
    const source = '[root b]\r\n; пример  '
    assert.equal(appendHistoryVersion([], version(1, source))[0].source, source)
})

test('identical consecutive contents coalesce but a return to an older source is retained', () => {
    const original = [version(1, 'A')]
    const unchanged = appendHistoryVersion(original, version(2, 'A'))
    assert.equal(unchanged.length, 1)
    assert.equal(unchanged[0].id, 'version-1')
    const changed = appendHistoryVersion(unchanged, version(3, 'B'))
    const restored = appendHistoryVersion(changed, version(4, 'A', 'restore'))
    assert.deepEqual(restored.map((item) => item.source), ['A', 'B', 'A'])
    assert.equal(original.length, 1)
})

test('manual checkpoints promote an automatic snapshot without duplicating its text', () => {
    const result = appendHistoryVersion([version(1, 'Source')], version(2, 'Source', 'checkpoint'))
    assert.equal(result.length, 1)
    assert.equal(result[0].reason, 'checkpoint')
    assert.equal(appendHistoryVersion(result, version(3, 'Source'))[0].reason, 'checkpoint')
})

test('retention keeps recent work and prefers deliberate checkpoints over old autosnapshots', () => {
    let versions: HistoryVersion[] = [version(0, 'keep', 'checkpoint')]
    for (let time = 1; time <= 200; time++) versions = appendHistoryVersion(versions, version(time, `edit-${time}`))
    assert.equal(versions.length, HISTORY_LIMITS.versions)
    assert.equal(versions[0].source, 'keep')
    assert.equal(versions.at(-1)?.source, 'edit-200')
    assert.equal(versions[1].source, 'edit-102')
})

test('a full list of manual checkpoints still has bounded retention', () => {
    let versions: HistoryVersion[] = []
    for (let time = 0; time < 110; time++) versions = appendHistoryVersion(versions, version(time, `${time}`, 'checkpoint'))
    assert.equal(versions.length, 100)
    assert.equal(versions[0].source, '10')
    assert.equal(versions.at(-1)?.source, '109')
})

test('byte limits prune history before its version count is reached and reject one oversized source', () => {
    const chunk = 'x'.repeat(2 * 1024 * 1024)
    let versions: HistoryVersion[] = []
    for (let time = 1; time < 4; time++) versions = appendHistoryVersion(versions, version(time, chunk + time))
    assert.equal(versions.length, 2)
    assert.equal(versions[0].createdAt, 2)
    assert.ok(versions.reduce((sum, item) => sum + item.bytes, 0) <= HISTORY_LIMITS.documentBytes)
    assert.throws(() => appendHistoryVersion(versions, version(4, 'x'.repeat(HISTORY_LIMITS.documentBytes + 1))), /больше 5 МБ/)
    assert.equal(versions.length, 2)
})

test('global storage eviction chooses the least recently used document and protects the active file', () => {
    const docs = Array.from({ length: 6 }, (_, i) => metadata(`${i}`, i, HISTORY_LIMITS.documentBytes))
    assert.deepEqual(historyEvictions(docs, '0'), ['1'])
    assert.deepEqual(historyEvictions(docs.slice(0, 2), '0'), [])
    const many = Array.from({ length: 102 }, (_, i) => metadata(`${i}`, i))
    assert.deepEqual(historyEvictions(many, '0'), ['1', '2'])
})

test('native handles distinguish equal filenames and contents in different folders', async () => {
    const handles = [0, 1].map((index) => ({ name: 'part.textcad', isSameEntry: async (other: TextCadFileHandle) => other === handles[index] }) as TextCadFileHandle)
    const documents = handles.map((handle, i) => ({ ...metadata(`${i}`), handle, savedDigest: 'same' }))
    assert.equal((await matchHistoryDocument(documents, 'part.textcad', 'same', handles[1]))?.id, '1')
    const third = { name: 'part.textcad', isSameEntry: async () => false } as unknown as TextCadFileHandle
    assert.equal(await matchHistoryDocument(documents, 'part.textcad', 'same', third), undefined)
})

test('upload fallback matches only unambiguous filename and saved-content fingerprints, including old saves', async () => {
    const documents = [{ ...metadata('a'), savedDigest: 'new', savedDigests: ['old', 'new'] }]
    assert.equal((await matchHistoryDocument(documents, 'part.textcad', 'old', null))?.id, 'a')
    assert.equal(await matchHistoryDocument(documents, 'other.textcad', 'old', null), undefined)
    assert.equal(await matchHistoryDocument(documents, 'part.textcad', 'different', null), undefined)
    assert.equal(await matchHistoryDocument([...documents, { ...documents[0], id: 'b' }], 'part.textcad', 'old', null), undefined)
})

test('a broken native handle does not make opening a document fail', async () => {
    const handle = { isSameEntry: async () => { throw new Error('revoked') } } as unknown as TextCadFileHandle
    assert.equal(await matchHistoryDocument([{ ...metadata('a'), savedDigest: 'x', handle }], 'part.textcad', 'x', handle), undefined)
})

test('restoring a version from another document is rejected before storage is accessed', async () => {
    await assert.rejects(documentHistory.restore({ id: 'b', name: 'b.textcad', source: 'B' }, version(1, 'A')), /другому документу/)
})
