import assert from 'node:assert/strict'
import test from 'node:test'
import { countNoun, localeTag, localizeText, messages, translate } from '../../src/i18n/messages.ts'
import { localizeDiagnostic, localizeStatus } from '../../src/i18n/diagnostics.ts'
import { formatGridSpacing } from '../../src/components/Viewport/gridScale.ts'
import { requestAiEdit } from '../../src/ai/client.ts'
import { buildAssistantPrompt } from '../../server/textCadAiPlugin.ts'
import { textCadAiPlugin } from '../../server/textCadAiPlugin.ts'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ViteDevServer } from 'vite'

test('every interface message has two non-empty translations with the same variables', () => {
    const variables = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort()
    for (const [key, pair] of Object.entries(messages)) {
        assert.equal(pair.length, 2, key)
        assert.ok(pair[0].trim().length && pair[1].trim().length, key)
        assert.deepEqual(variables(pair[0]), variables(pair[1]), key)
    }
})

test('navigation and branding use one selected language', () => {
    assert.equal(translate('brand', 'en'), 'TextTOCAD')
    assert.equal(translate('brand', 'ru'), 'ТекстВСАПР')
    assert.equal(translate('File', 'ru'), 'Файл')
    assert.equal(translate('Source', 'ru'), 'Код')
    assert.equal(translate('Chat', 'ru'), 'Чат')
    assert.equal(translate('История', 'en'), 'History')
    assert.equal(translate('Тела и операции', 'en'), 'Bodies and features')
})

test('numbers, units and plurals follow the selected locale', () => {
    assert.equal(localeTag('en'), 'en-US')
    assert.equal(formatGridSpacing(0.5, 'en'), '0.5')
    assert.equal(formatGridSpacing(0.5, 'ru'), '0,5')
    assert.deepEqual([1, 2, 5, 11, 21].map((count) => countNoun(count, 'body', 'ru')), ['тело', 'тела', 'тел', 'тел', 'тело'])
    assert.deepEqual([1, 2, 5].map((count) => countNoun(count, 'body', 'en')), ['body', 'bodies', 'bodies'])
})

test('existing status messages translate in either direction without changing filenames or revisions', () => {
    assert.equal(localizeText('Модель синхронизирована · ревизия 23', 'en'), 'Model is up to date · revision 23')
    assert.equal(localizeText('Model is up to date · revision 23', 'ru'), 'Модель синхронизирована · ревизия 23')
    assert.equal(localizeText('деталь_12.textcad сохранён', 'en'), 'деталь_12.textcad saved')
    assert.equal(localizeText('part.textcad saved', 'ru'), 'part.textcad сохранён')
    assert.equal(translate('Свернуть {name}', 'en', { name: '<part>' }), 'Collapse <part>')
})

test('diagnostics are localized while retaining technical identifiers and source locations', () => {
    const diagnostic = { code: 'TCD-S006', message: 'Expected a length in mm, not an angle.' }
    assert.equal(localizeDiagnostic(diagnostic, 'en'), diagnostic.message)
    assert.equal(localizeDiagnostic(diagnostic, 'ru'), 'Ожидается длина в мм, а не угол.')
    assert.equal(localizeStatus(`TCD-S006 · 8:21 · ${diagnostic.message}`, 'ru'), 'TCD-S006 · 8:21 · Ожидается длина в мм, а не угол.')
    assert.equal(localizeDiagnostic({ code:'TCD-S002', message:'Unknown reference "profile_01".' }, 'ru'), 'Неизвестная ссылка «profile_01».')
    assert.ok(!/[A-Za-z]/.test(localizeDiagnostic({ code:'TCD-G004', message:'Unexpected kernel edge case' }, 'ru')))
})

test('stored history and provider errors also follow the interface language', () => {
    assert.equal(localizeText('Antigravity CLI не ответил за 120 секунд.', 'en'), 'Antigravity CLI did not respond within 120 seconds.')
    assert.equal(localizeText('OPENAI_API_KEY не настроен. Создайте файл .env по примеру .env.example.', 'en'), 'OPENAI_API_KEY is not configured. Create .env using .env.example.')
    assert.equal(localizeText('This model is currently experiencing high demand.', 'ru'), 'Модель перегружена. Повторите запрос позже.')
    assert.equal(localizeText('QuotaExceededError', 'en'), 'QuotaExceededError')
})

test('all providers receive a trusted instruction to use the selected interface language', () => {
    assert.match(buildAssistantPrompt('en'), /SELECTED INTERFACE LANGUAGE: English/)
    assert.match(buildAssistantPrompt('en'), /Application name: TextTOCAD/)
    assert.match(buildAssistantPrompt('ru'), /SELECTED INTERFACE LANGUAGE: Russian/)
    assert.match(buildAssistantPrompt('ru'), /Application name: ТекстВСАПР/)
    assert.doesNotMatch(buildAssistantPrompt('en'), /Reply in the user's language/)
})

test('the assistant client sends the selected language and leaves source text untouched', async () => {
    const originalFetch = globalThis.fetch
    const source = '[textcad version=1 default-length=mm default-angle=deg]\n; русский комментарий\n[root body]'
    let payload: Record<string, unknown> = {}
    globalThis.fetch = async (_input, init) => {
        payload = JSON.parse(String(init?.body))
        return new Response(JSON.stringify({ message:'Updated.', source, changed:true }), {status:200})
    }
    try {
        const result = await requestAiEdit({message:'Измени высоту', source, diagnostics:[], history:[], language:'en'})
        assert.equal(payload.language, 'en')
        assert.equal(payload.source, source)
        assert.equal(result.source, source)
    } finally { globalThis.fetch = originalFetch }
})

test('the HTTP backend returns configuration errors in the selected language without calling a provider', async () => {
    const plugin = textCadAiPlugin({
        provider: 'openai', agy: {} as Parameters<typeof textCadAiPlugin>[0]['agy'],
        ollamaUrl:'http://localhost:11434', ollamaModel:'unused', geminiModel:'unused', openAiModel:'unused',
    })
    type Handler = (request: IncomingMessage, response: ServerResponse, next: () => void) => Promise<void>
    let endpoint: Handler | undefined
    assert.equal(typeof plugin.configureServer, 'function')
    if (typeof plugin.configureServer !== 'function') return
    await plugin.configureServer.call({} as never, { middlewares: { use: (handler: Handler) => { endpoint = handler } } } as unknown as ViteDevServer)
    assert.ok(endpoint)
    const request = {
        url:'/api/assistant', method:'POST',
        async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify({ language:'en', message:'Измени модель', source:'[root b]' })) },
    } as unknown as IncomingMessage
    let body = ''
    const response = { statusCode:0, setHeader:() => undefined, end:(text: string) => { body = text } }
    await endpoint(request, response as unknown as ServerResponse, () => assert.fail('Unexpected next handler'))
    assert.equal(response.statusCode, 503)
    assert.match(JSON.parse(body).error, /OPENAI_API_KEY is not configured/)
    assert.doesNotMatch(JSON.parse(body).error, /[А-Яа-яЁё]/)
})
