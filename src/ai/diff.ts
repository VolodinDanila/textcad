export type DiffLine = {
    kind: 'same' | 'add' | 'remove'
    text: string
    oldLine: number | null
    newLine: number | null
}

function splitLines(source: string) {
    if (source.length === 0) return []
    return source.replace(/\r\n/g, '\n').split('\n')
}

export function buildLineDiff(before: string, after: string): DiffLine[] {
    const oldLines = splitLines(before)
    const newLines = splitLines(after)
    const columns = newLines.length + 1
    const table = new Uint32Array((oldLines.length + 1) * columns)

    for (let oldIndex = oldLines.length - 1; oldIndex >= 0; oldIndex -= 1) {
        for (let newIndex = newLines.length - 1; newIndex >= 0; newIndex -= 1) {
            const index = oldIndex * columns + newIndex
            table[index] = oldLines[oldIndex] === newLines[newIndex]
                ? table[(oldIndex + 1) * columns + newIndex + 1] + 1
                : Math.max(
                    table[(oldIndex + 1) * columns + newIndex],
                    table[oldIndex * columns + newIndex + 1],
                )
        }
    }

    const result: DiffLine[] = []
    let oldIndex = 0
    let newIndex = 0

    while (oldIndex < oldLines.length && newIndex < newLines.length) {
        if (oldLines[oldIndex] === newLines[newIndex]) {
            result.push({
                kind: 'same',
                text: oldLines[oldIndex],
                oldLine: oldIndex + 1,
                newLine: newIndex + 1,
            })
            oldIndex += 1
            newIndex += 1
        } else if (
            table[(oldIndex + 1) * columns + newIndex]
            >= table[oldIndex * columns + newIndex + 1]
        ) {
            result.push({
                kind: 'remove',
                text: oldLines[oldIndex],
                oldLine: oldIndex + 1,
                newLine: null,
            })
            oldIndex += 1
        } else {
            result.push({
                kind: 'add',
                text: newLines[newIndex],
                oldLine: null,
                newLine: newIndex + 1,
            })
            newIndex += 1
        }
    }

    while (oldIndex < oldLines.length) {
        result.push({
            kind: 'remove',
            text: oldLines[oldIndex],
            oldLine: oldIndex + 1,
            newLine: null,
        })
        oldIndex += 1
    }

    while (newIndex < newLines.length) {
        result.push({
            kind: 'add',
            text: newLines[newIndex],
            oldLine: null,
            newLine: newIndex + 1,
        })
        newIndex += 1
    }

    return result
}
