import { translate, type Locale } from '../i18n/messages.ts'

export type TextCadFileHandle = {
    name: string
    getFile: () => Promise<File>
    isSameEntry?: (other: TextCadFileHandle) => Promise<boolean>
    createWritable: () => Promise<{
        write: (data: string) => Promise<void>
        close: () => Promise<void>
    }>
}

export type OpenTextCadResult = {
    name: string
    source: string
    handle: TextCadFileHandle | null
}

export type SaveTextCadResult = {
    name: string
    handle: TextCadFileHandle | null
}

type FilePickerWindow = Window & {
    showOpenFilePicker?: (options: {
        multiple?: boolean
        types?: FilePickerType[]
    }) => Promise<TextCadFileHandle[]>
    showSaveFilePicker?: (options: {
        suggestedName?: string
        types?: FilePickerType[]
    }) => Promise<TextCadFileHandle>
}

type FilePickerType = {
    description: string
    accept: Record<string, string[]>
}

const textCadFileTypes = (locale: Locale): FilePickerType[] => [
    {
        description: translate('Документ TextCAD', locale),
        accept: {
            'text/plain': ['.textcad'],
        },
    },
]

function isAbortError(error: unknown) {
    return error instanceof DOMException && error.name === 'AbortError'
}

export function ensureTextCadExtension(name: string) {
    const trimmedName = name.trim() || 'model'
    return trimmedName.toLowerCase().endsWith('.textcad')
        ? trimmedName
        : `${trimmedName}.textcad`
}

async function openWithInput(): Promise<OpenTextCadResult | null> {
    return new Promise((resolve, reject) => {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = '.textcad,text/plain'
        input.hidden = true
        document.body.append(input)

        const finish = (result: OpenTextCadResult | null) => {
            input.remove()
            resolve(result)
        }

        input.addEventListener('change', () => {
            const file = input.files?.[0]
            if (!file) {
                finish(null)
                return
            }

            file.text()
                .then((source) => finish({
                    name: file.name,
                    source,
                    handle: null,
                }))
                .catch((error: unknown) => {
                    input.remove()
                    reject(error)
                })
        }, { once: true })

        input.addEventListener('cancel', () => finish(null), { once: true })
        input.click()
    })
}

export async function openTextCadDocument(locale: Locale = 'ru'): Promise<OpenTextCadResult | null> {
    const pickerWindow = window as FilePickerWindow
    if (!pickerWindow.showOpenFilePicker) {
        return openWithInput()
    }

    try {
        const handles = await pickerWindow.showOpenFilePicker({
            multiple: false,
            types: textCadFileTypes(locale),
        })
        const handle = handles[0]
        if (!handle) return null

        const file = await handle.getFile()
        return {
            name: file.name,
            source: await file.text(),
            handle,
        }
    } catch (error) {
        if (isAbortError(error)) return null
        throw error
    }
}

export async function writeTextCadDocument(
    handle: TextCadFileHandle,
    source: string,
) {
    const writable = await handle.createWritable()
    await writable.write(source)
    await writable.close()
}

function downloadTextCadDocument(name: string, source: string) {
    const blob = new Blob([source], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = name
    anchor.hidden = true
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

export async function saveTextCadDocumentAs(
    suggestedName: string,
    source: string,
    locale: Locale = 'ru',
): Promise<SaveTextCadResult | null> {
    let name = ensureTextCadExtension(suggestedName)
    const pickerWindow = window as FilePickerWindow

    if (!pickerWindow.showSaveFilePicker) {
        const enteredName = window.prompt(translate('Имя файла TextCAD', locale), name)
        if (enteredName === null) return null

        name = ensureTextCadExtension(enteredName)
        downloadTextCadDocument(name, source)
        return { name, handle: null }
    }

    try {
        const handle = await pickerWindow.showSaveFilePicker({
            suggestedName: name,
            types: textCadFileTypes(locale),
        })
        await writeTextCadDocument(handle, source)
        return { name: handle.name, handle }
    } catch (error) {
        if (isAbortError(error)) return null
        throw error
    }
}
