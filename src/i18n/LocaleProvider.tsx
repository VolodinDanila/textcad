import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { LOCALE_KEY, localeTag, translate, type Locale } from './messages'
import { LocaleContext, type LocaleContextValue } from './localeContext'

export function LocaleProvider({ children }: { children: ReactNode }) {
    const [locale, setLocale] = useState<Locale>(() => {
        try { return localStorage.getItem(LOCALE_KEY) === 'en' ? 'en' : 'ru' } catch { return 'ru' }
    })
    useEffect(() => {
        document.documentElement.lang = locale
        document.title = translate('brand', locale)
        try { localStorage.setItem(LOCALE_KEY, locale) } catch { /* The language switch also works without storage. */ }
    }, [locale])
    const value = useMemo<LocaleContextValue>(() => ({
        locale, setLocale, t: (key, values) => translate(key, locale, values),
        number: (amount, options) => new Intl.NumberFormat(localeTag(locale), options).format(amount),
    }), [locale])
    return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}
