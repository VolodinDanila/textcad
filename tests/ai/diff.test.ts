import assert from 'node:assert/strict'
import test from 'node:test'
import { buildLineDiff } from '../../src/ai/diff.ts'

test('buildLineDiff marks added and removed lines', () => {
    const result = buildLineDiff('one\ntwo\nthree', 'one\nsecond\nthree\nfour')

    assert.deepEqual(
        result.map(({ kind, text }) => [kind, text]),
        [
            ['same', 'one'],
            ['remove', 'two'],
            ['add', 'second'],
            ['same', 'three'],
            ['add', 'four'],
        ],
    )
})

test('buildLineDiff returns unchanged lines', () => {
    assert.deepEqual(buildLineDiff('one\ntwo', 'one\ntwo'), [
        { kind: 'same', text: 'one', oldLine: 1, newLine: 1 },
        { kind: 'same', text: 'two', oldLine: 2, newLine: 2 },
    ])
})

test('buildLineDiff handles an empty side', () => {
    assert.deepEqual(buildLineDiff('', 'one'), [
        { kind: 'add', text: 'one', oldLine: null, newLine: 1 },
    ])
})
