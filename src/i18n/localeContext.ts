import { createContext, useContext } from 'react'
import type { Locale, MessageKey } from './messages'

export type LocaleContextValue = {
    locale: Locale
    setLocale: (locale: Locale) => void
    t: (key: MessageKey, values?: Record<string, string | number>) => string
    number: (value: number, options?: Intl.NumberFormatOptions) => string
}
export const LocaleContext = createContext<LocaleContextValue | null>(null)
export function useLocale() {
    const context = useContext(LocaleContext)
    if (!context) throw new Error('LocaleProvider is required')
    return context
}
