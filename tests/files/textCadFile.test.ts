import assert from 'node:assert/strict'
import test from 'node:test'

import {
    ensureTextCadExtension,
    writeTextCadDocument,
    type TextCadFileHandle,
} from '../../src/files/textCadFile.ts'

test('normalizes TextCAD file names', () => {
    assert.equal(ensureTextCadExtension('bracket'), 'bracket.textcad')
    assert.equal(ensureTextCadExtension('bracket.textcad'), 'bracket.textcad')
    assert.equal(ensureTextCadExtension('BRACKET.TEXTCAD'), 'BRACKET.TEXTCAD')
    assert.equal(ensureTextCadExtension('   '), 'model.textcad')
})

test('writes and closes a TextCAD file handle', async () => {
    const calls: string[] = []
    const handle = {
        name: 'model.textcad',
        createWritable: async () => ({
            write: async (source: string) => {
                calls.push(`write:${source}`)
            },
            close: async () => {
                calls.push('close')
            },
        }),
    } as TextCadFileHandle

    await writeTextCadDocument(handle, '[textcad version=1]')

    assert.deepEqual(calls, [
        'write:[textcad version=1]',
        'close',
    ])
})
