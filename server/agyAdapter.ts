import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

type AgyEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export type AgyAdapterOptions = {
    command: string
    model?: string
    effort: AgyEffort
    timeoutMs: number
    maxOutputBytes?: number
}

export type AgyCliInfo = {
    version: string
    flags: string[]
}

type ProcessResult = {
    exitCode: number | null
    stdout: string
    stderr: string
}

type AgyResult = {
    status?: unknown
    error?: unknown
    structured_output?: unknown
}

type AgyStreamEvent = {
    event?: unknown
    init?: {
        permission_mode?: unknown
    }
    step_update?: {
        step_type?: unknown
        tool_name?: unknown
        tool_info?: unknown
    }
    result?: AgyResult
}

type AgyErrorKind =
    | 'unavailable'
    | 'incompatible'
    | 'timeout'
    | 'unsafe-tool-call'
    | 'invalid-output'
    | 'provider'

export class AgyAdapterError extends Error {
    readonly kind: AgyErrorKind

    constructor(kind: AgyErrorKind, message: string, options?: ErrorOptions) {
        super(message, options)
        this.name = 'AgyAdapterError'
        this.kind = kind
    }
}

const REQUIRED_FLAGS = [
    '--input-format',
    '--output-format',
    '--json-schema',
    '--print-timeout',
    '--settings',
] as const

const DEFAULT_MAX_OUTPUT_BYTES = 2_000_000
const MAX_STDERR_BYTES = 64_000
const INSPECTION_TIMEOUT_MS = 10_000
const STRICT_SETTINGS = {
    agentMode: 'plan',
    toolPermission: 'strict',
    allowNonWorkspaceAccess: false,
    permissions: {
        deny: [
            'command(*)',
            'write_file(*)',
            'replace_file(*)',
            'read_file(*)',
            'read_url(*)',
            'call_mcp_tool(*)',
        ],
    },
} as const

const inspectionCache = new Map<string, Promise<AgyCliInfo>>()

function childEnvironment(): NodeJS.ProcessEnv {
    return Object.fromEntries(
        Object.entries(process.env).filter(([name]) => !(
            /(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD|PRIVATE[_-]?KEY|CREDENTIAL)/i.test(name)
            || name.startsWith('VITE_')
        )),
    )
}

function runProcess(
    command: string,
    args: string[],
    options: {
        cwd: string
        input?: string
        timeoutMs: number
        maxOutputBytes: number
    },
): Promise<ProcessResult> {
    return new Promise((resolve, reject) => {
        let stdout = ''
        let stderr = ''
        let settled = false
        let timedOut = false
        let outputExceeded = false

        const child = spawn(command, args, {
            cwd: options.cwd,
            env: childEnvironment(),
            shell: false,
            windowsHide: true,
            stdio: ['pipe', 'pipe', 'pipe'],
        })

        const finishWithError = (error: Error) => {
            if (settled) return
            settled = true
            clearTimeout(timer)
            reject(error)
        }

        const stop = () => {
            if (!child.killed) child.kill()
        }

        child.stdout.setEncoding('utf8')
        child.stderr.setEncoding('utf8')
        child.stdout.on('data', (chunk: string) => {
            stdout += chunk
            if (Buffer.byteLength(stdout, 'utf8') > options.maxOutputBytes) {
                outputExceeded = true
                stop()
            }
        })
        child.stderr.on('data', (chunk: string) => {
            if (Buffer.byteLength(stderr, 'utf8') < MAX_STDERR_BYTES) stderr += chunk
        })

        child.on('error', (error) => {
            finishWithError(new AgyAdapterError(
                'unavailable',
                `Не удалось запустить Antigravity CLI (${command}).`,
                { cause: error },
            ))
        })

        child.on('close', (exitCode) => {
            if (settled) return
            settled = true
            clearTimeout(timer)

            if (timedOut) {
                reject(new AgyAdapterError(
                    'timeout',
                    `Antigravity CLI не ответил за ${Math.ceil(options.timeoutMs / 1000)} секунд.`,
                ))
                return
            }
            if (outputExceeded) {
                reject(new AgyAdapterError(
                    'invalid-output',
                    'Antigravity CLI вернул слишком большой ответ.',
                ))
                return
            }

            resolve({ exitCode, stdout, stderr })
        })

        const timer = setTimeout(() => {
            timedOut = true
            stop()
        }, options.timeoutMs)

        child.stdin.on('error', () => {
            // The close/error handlers report the actual process failure.
        })
        child.stdin.end(options.input)
    })
}

export function parseAgyVersion(output: string): string {
    const match = output.trim().match(/^(\d+)\.(\d+)\.(\d+)(?:[-+][\w.-]+)?$/)
    if (!match) {
        throw new AgyAdapterError(
            'incompatible',
            'Antigravity CLI вернул неизвестный формат версии.',
        )
    }
    return match[0]
}

export function assertAgyHelpSupportsRequiredFlags(help: string): string[] {
    const missing: string[] = REQUIRED_FLAGS.filter((flag) => !help.includes(flag))
    if (!help.includes('stream-json')) missing.push('stream-json')
    if (missing.length > 0) {
        throw new AgyAdapterError(
            'incompatible',
            `Установленная версия Antigravity CLI не поддерживает: ${missing.join(', ')}.`,
        )
    }
    return [...REQUIRED_FLAGS, 'stream-json']
}

async function inspectAgyCliUncached(command: string): Promise<AgyCliInfo> {
    if (!command.trim() || command.includes('\0')) {
        throw new AgyAdapterError('unavailable', 'AGY_COMMAND настроен некорректно.')
    }

    const cwd = tmpdir()
    const processOptions = {
        cwd,
        timeoutMs: INSPECTION_TIMEOUT_MS,
        maxOutputBytes: 256_000,
    }
    const versionResult = await runProcess(command, ['--version'], processOptions)
    if (versionResult.exitCode !== 0) {
        throw new AgyAdapterError('unavailable', 'Antigravity CLI недоступен.')
    }

    const helpResult = await runProcess(command, ['--help'], processOptions)
    if (helpResult.exitCode !== 0) {
        throw new AgyAdapterError('incompatible', 'Не удалось проверить флаги Antigravity CLI.')
    }

    return {
        version: parseAgyVersion(`${versionResult.stdout}\n${versionResult.stderr}`.trim()),
        flags: assertAgyHelpSupportsRequiredFlags(`${helpResult.stdout}\n${helpResult.stderr}`),
    }
}

export function inspectAgyCli(command: string): Promise<AgyCliInfo> {
    const cached = inspectionCache.get(command)
    if (cached) return cached

    const inspection = inspectAgyCliUncached(command).catch((error) => {
        inspectionCache.delete(command)
        throw error
    })
    inspectionCache.set(command, inspection)
    return inspection
}

function parseAgyStream(output: string): unknown {
    let terminalResult: AgyResult | undefined
    let strictModeConfirmed = false

    for (const line of output.split(/\r?\n/)) {
        if (!line.trim()) continue

        let event: AgyStreamEvent
        try {
            event = JSON.parse(line) as AgyStreamEvent
        } catch (error) {
            throw new AgyAdapterError(
                'invalid-output',
                'Antigravity CLI нарушил NDJSON-контракт ответа.',
                { cause: error },
            )
        }

        if (event.event === 'init') {
            strictModeConfirmed = event.init?.permission_mode === 'strict'
        }
        if (
            event.event === 'step_update'
            && (
                event.step_update?.step_type === 'tool'
                || event.step_update?.tool_name !== undefined
                || event.step_update?.tool_info !== undefined
            )
        ) {
            throw new AgyAdapterError(
                'unsafe-tool-call',
                'Antigravity CLI попытался вызвать инструмент; ответ отклонён.',
            )
        }
        if (event.event === 'result') terminalResult = event.result
    }

    if (!strictModeConfirmed) {
        throw new AgyAdapterError(
            'incompatible',
            'Antigravity CLI не подтвердил строгий режим разрешений.',
        )
    }
    if (!terminalResult) {
        throw new AgyAdapterError('invalid-output', 'Antigravity CLI не вернул итоговый результат.')
    }
    if (terminalResult.status !== 'SUCCESS') {
        const detail = typeof terminalResult.error === 'string'
            ? terminalResult.error.slice(0, 500)
            : 'запрос не выполнен'
        throw new AgyAdapterError('provider', `Antigravity CLI: ${detail}`)
    }
    if (terminalResult.structured_output === undefined) {
        throw new AgyAdapterError(
            'invalid-output',
            'Antigravity CLI не вернул structured_output по заданной JSON Schema.',
        )
    }

    return terminalResult.structured_output
}

function validateOptions(options: AgyAdapterOptions) {
    if (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 1_000 || options.timeoutMs > 600_000) {
        throw new AgyAdapterError('incompatible', 'AGY_TIMEOUT_MS должен быть от 1000 до 600000.')
    }
    if (options.model && !/^[\w.-]+$/.test(options.model)) {
        throw new AgyAdapterError('incompatible', 'AGY_MODEL содержит недопустимые символы.')
    }
}

export async function requestAgyStructuredOutput(
    prompt: string,
    schema: object,
    options: AgyAdapterOptions,
): Promise<unknown> {
    validateOptions(options)
    await inspectAgyCli(options.command)

    const temporaryWorkspace = await mkdtemp(join(tmpdir(), 'textcad-agy-'))
    try {
        const cliTimeoutSeconds = Math.max(1, Math.floor(options.timeoutMs / 1000))
        const args = [
            '--input-format', 'stream-json',
            '--output-format', 'stream-json',
            '--json-schema', JSON.stringify(schema),
            '--effort', options.effort,
            '--print-timeout', `${cliTimeoutSeconds}s`,
            '--settings', JSON.stringify(STRICT_SETTINGS),
        ]
        if (options.model) args.push('--model', options.model)

        const input = `${JSON.stringify({
            event: 'user',
            message: { content: prompt },
        })}\n`
        const result = await runProcess(options.command, args, {
            cwd: temporaryWorkspace,
            input,
            timeoutMs: options.timeoutMs + 5_000,
            maxOutputBytes: options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES,
        })

        let structuredOutput: unknown
        try {
            structuredOutput = parseAgyStream(result.stdout)
        } catch (error) {
            if (error instanceof AgyAdapterError) throw error
            throw new AgyAdapterError('invalid-output', 'Не удалось разобрать ответ Antigravity CLI.', {
                cause: error,
            })
        }

        if (result.exitCode !== 0) {
            throw new AgyAdapterError(
                'provider',
                `Antigravity CLI завершился с кодом ${result.exitCode}.`,
            )
        }
        return structuredOutput
    } finally {
        await rm(temporaryWorkspace, { recursive: true, force: true })
    }
}

export { parseAgyStream }
