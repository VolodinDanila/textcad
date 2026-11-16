import opencascade from 'replicad-opencascadejs'
import opencascadeWasm from 'replicad-opencascadejs/wasm?url'
import { setOC } from 'replicad'

let initPromise: Promise<void> | null = null

export function initCad() {
    if (!initPromise) {
        initPromise = (async () => {
            const oc = await opencascade({
                locateFile: () => opencascadeWasm,
            })

            setOC(oc)
        })()
    }

    return initPromise
}
