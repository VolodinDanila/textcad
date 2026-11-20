import assert from 'node:assert/strict'
import test from 'node:test'
import {
    extractGeminiOutputText,
    extractOllamaOutputText,
    extractOutputText,
    parseAssistantEdit,
    validateAssistantDsl,
} from '../../server/textCadAiPlugin.ts'
import {
    assertAgyHelpSupportsRequiredFlags,
    parseAgyStream,
    parseAgyVersion,
} from '../../server/agyAdapter.ts'

test('extractGeminiOutputText reads structured text from a candidate', () => {
    const text = extractGeminiOutputText({
        candidates: [{
            content: {
                parts: [{ text: '{"message":"Готово","source":"[root body]","changed":true}' }],
            },
        }],
    })

    assert.equal(text, '{"message":"Готово","source":"[root body]","changed":true}')
})

test('extractOutputText reads an OpenAI Responses output', () => {
    assert.equal(extractOutputText({ output_text: '{"changed":false}' }), '{"changed":false}')
})

test('extractOllamaOutputText reads local chat content', () => {
    assert.equal(
        extractOllamaOutputText({ message: { content: '{"changed":true}' } }),
        '{"changed":true}',
    )
})

test('parseAssistantEdit keeps the current source for unchanged replies', () => {
    assert.deepEqual(
        parseAssistantEdit(
            '{"message":"Команда пока не поддерживается","source":"wrong","changed":false}',
            'current',
        ),
        {
            message: 'Команда пока не поддерживается',
            source: 'current',
            changed: false,
        },
    )
})

test('Antigravity CLI preflight accepts the installed version and required flags', () => {
    assert.equal(parseAgyVersion('1.5.13\n'), '1.5.13')
    assert.deepEqual(
        assertAgyHelpSupportsRequiredFlags([
            '--input-format stream-json',
            '--output-format stream-json',
            '--json-schema',
            '--print-timeout',
            '--settings',
        ].join('\n')),
        [
            '--input-format',
            '--output-format',
            '--json-schema',
            '--print-timeout',
            '--settings',
            'stream-json',
        ],
    )
})

test('parseAgyStream reads only a successful strict structured result', () => {
    const output = [
        JSON.stringify({ event: 'init', init: { permission_mode: 'strict' } }),
        JSON.stringify({
            event: 'result',
            result: {
                status: 'SUCCESS',
                structured_output: { message: 'Готово', source: '[root body]', changed: true },
            },
        }),
    ].join('\n')

    assert.deepEqual(parseAgyStream(output), {
        message: 'Готово',
        source: '[root body]',
        changed: true,
    })
})

test('parseAgyStream rejects tool use even when the CLI reports success', () => {
    const output = [
        JSON.stringify({ event: 'init', init: { permission_mode: 'strict' } }),
        JSON.stringify({
            event: 'step_update',
            step_update: { step_type: 'tool', tool_name: 'run_command' },
        }),
        JSON.stringify({
            event: 'result',
            result: { status: 'SUCCESS', structured_output: { ok: true } },
        }),
    ].join('\n')

    assert.throws(() => parseAgyStream(output), /попытался вызвать инструмент/)
})

test('validateAssistantDsl rejects invalid generated TextCAD', () => {
    assert.throws(
        () => validateAssistantDsl({
            message: 'Готово',
            source: '[root missing]',
            changed: true,
        }),
        /не прошло проверку DSL/,
    )
})
