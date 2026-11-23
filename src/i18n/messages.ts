export type Locale = 'ru' | 'en'
export const LOCALE_KEY = 'textcad-language'
export const localeTag = (locale: Locale) => locale === 'ru' ? 'ru-RU' : 'en-US'

// Both translations live together so a new label cannot silently miss a language.
export const messages = {
    brand: ['ТекстВСАПР', 'TextTOCAD'],
    File: ['Файл', 'File'], Edit: ['Правка', 'Edit'], View: ['Вид', 'View'], Tools: ['Инструменты', 'Tools'], Help: ['Справка', 'Help'],
    New: ['Новый', 'New'], 'Open…': ['Открыть…', 'Open…'], Save: ['Сохранить', 'Save'], 'Save As…': ['Сохранить как…', 'Save As…'],
    'Import…': ['Импорт…', 'Import…'], 'Export…': ['Экспорт…', 'Export…'], Undo: ['Отменить', 'Undo'], Redo: ['Повторить', 'Redo'],
    'Preferences…': ['Настройки…', 'Preferences…'], 'Fit view': ['Показать целиком', 'Fit view'], Grid: ['Сетка', 'Grid'], Axes: ['Оси', 'Axes'], Projection: ['Проекция', 'Projection'],
    Measure: ['Измерение', 'Measure'], Section: ['Сечение', 'Section'], 'Model inspector': ['Сведения о модели', 'Model inspector'],
    'Quick start': ['Начало работы', 'Quick start'], 'Keyboard shortcuts': ['Сочетания клавиш', 'Keyboard shortcuts'], About: ['О программе {brand}', 'About {brand}'],
    'Главное меню': ['Главное меню', 'Main menu'], 'Пока недоступно': ['Пока недоступно', 'Not available yet'],
    'Без названия': ['Без названия', 'Untitled'], 'Есть несохранённые изменения': ['Есть несохранённые изменения', 'Unsaved changes'],
    'Включить тёмную тему': ['Включить тёмную тему', 'Switch to dark theme'], 'Включить светлую тему': ['Включить светлую тему', 'Switch to light theme'],
    'Тёмная тема': ['Тёмная тема', 'Dark theme'], 'Светлая тема': ['Светлая тема', 'Light theme'],
    'Закрыть дерево модели': ['Закрыть дерево модели', 'Close model tree'], 'Открыть дерево модели': ['Открыть дерево модели', 'Open model tree'],
    'Закрыть панель Source': ['Закрыть правую панель', 'Close right panel'], 'Открыть панель Source': ['Открыть правую панель', 'Open right panel'],
    'Язык интерфейса': ['Язык интерфейса', 'Interface language'],
    Model: ['Модель', 'Model'], 'Дерево модели': ['Дерево модели', 'Model tree'], 'Структура модели': ['Структура модели', 'Model structure'],
    'Эскизы': ['Эскизы', 'Sketches'], 'Тела и операции': ['Тела и операции', 'Bodies and features'], 'результат': ['результат', 'output'],
    'Свернуть {name}': ['Свернуть {name}', 'Collapse {name}'], 'Развернуть {name}': ['Развернуть {name}', 'Expand {name}'],
    'Выдавливание': ['Выдавливание', 'Extrude'], 'Объединение': ['Объединение', 'Union'], 'Вычитание': ['Вычитание', 'Cut'], 'Пересечение': ['Пересечение', 'Intersect'],
    'Вращение': ['Вращение', 'Revolve'], 'Круговой массив': ['Круговой массив', 'Circular pattern'], 'Линейный массив': ['Линейный массив', 'Linear pattern'],
    'По сечениям': ['По сечениям', 'Loft'], 'Скругление': ['Скругление', 'Fillet'], 'Фаска': ['Фаска', 'Chamfer'], 'Оболочка': ['Оболочка', 'Shell'],
    'Перемещение': ['Перемещение', 'Translate'], 'Поворот': ['Поворот', 'Rotate'], 'Зеркальное отражение': ['Зеркальное отражение', 'Mirror'],
    'Масштабирование': ['Масштабирование', 'Scale'], 'Отверстие': ['Отверстие', 'Hole'], 'Резьба': ['Резьба', 'Thread'],
    'мм': ['мм', 'mm'], 'шт.': ['шт.', 'copies'],
    body_one: ['тело', 'body'], body_few: ['тела', 'bodies'], body_many: ['тел', 'bodies'],
    feature_one: ['операция', 'feature'], feature_few: ['операции', 'features'], feature_many: ['операций', 'features'],
    sketch_one: ['эскиз', 'sketch'], sketch_few: ['эскиза', 'sketches'], sketch_many: ['эскизов', 'sketches'],
    'Шаг сетки': ['Шаг сетки', 'Grid spacing'], 'Сетка': ['Сетка', 'Grid'],
    'Мелкая ячейка: {minor} мм; крупная: {major} мм': ['Мелкая ячейка: {minor} мм; крупная: {major} мм', 'Minor cell: {minor} mm; major cell: {major} mm'],
    'Координаты курсора': ['Координаты курсора', 'Cursor coordinates'], INFO: ['ИНФО', 'INFO'], WARN: ['ВНИМАНИЕ', 'WARNING'], ERROR: ['ОШИБКА', 'ERROR'],
    'Изменить ширину дерева модели': ['Изменить ширину дерева модели', 'Resize model tree'], 'Изменить ширину панели Source': ['Изменить ширину правой панели', 'Resize right panel'],
    Chat: ['Чат', 'Chat'], Source: ['Код', 'Source'], 'История': ['История', 'History'], 'Боковая панель': ['Боковая панель', 'Side panel'],
    'Закрыть панель': ['Закрыть панель', 'Close panel'], 'Исходный код TextCAD': ['Исходный код модели', 'Model source code'],
    'Ошибки документа': ['Ошибки документа', 'Document errors'], 'Пересчёт модели...': ['Пересчёт модели…', 'Rebuilding model…'],
    'Синхронизировано с моделью': ['Синхронизировано с моделью', 'Model is up to date'],
    'Есть ошибки · показана последняя модель': ['Есть ошибки · показана последняя модель', 'Errors · showing the last valid model'],
    'ИИ готовит предложение...': ['ИИ готовит предложение…', 'AI is preparing an edit…'], 'Нужна проверка': ['Нужна проверка', 'Needs attention'],
    'ИИ-помощник готов': ['ИИ-помощник готов', 'AI assistant is ready'], 'Помощник': ['Помощник', 'Assistant'], 'Вы': ['Вы', 'You'], 'ИИ': ['ИИ', 'AI'],
    'Опишите изменение в {name}. ИИ предложит новый Source, но применит его только после вашей проверки.': ['Опишите изменение в {name}. ИИ предложит новый код, а вы решите, применять ли его.', 'Describe a change to {name}. AI will propose updated source for you to review and apply.'],
    'Предложение ИИ': ['Предложение ИИ', 'AI proposal'], 'Проверенное изменение': ['Проверенное изменение', 'Validated edit'],
    'Source ещё не изменён': ['Код ещё не изменён', 'Source has not changed yet'], 'Сравнение исходного кода': ['Сравнение исходного кода', 'Source comparison'],
    'Отклонить': ['Отклонить', 'Reject'], 'Применить': ['Применить', 'Apply'], 'Сообщение ИИ-помощнику': ['Сообщение ИИ-помощнику', 'Message the AI assistant'],
    'Например: сделай корпус выше на 5 мм': ['Например: сделай корпус выше на 5 мм', 'For example: make the body 5 mm taller'],
    'Enter — отправить · Shift+Enter — строка': ['Enter — отправить · Shift+Enter — новая строка', 'Enter to send · Shift+Enter for a new line'], 'Отправить': ['Отправить', 'Send'],
    'Документ изменился, пока ИИ отвечал. Отправьте запрос ещё раз.': ['Документ изменился, пока ИИ отвечал. Отправьте запрос ещё раз.', 'The document changed while AI was responding. Send the request again.'],
    'Документ уже изменился. Попросите ИИ подготовить предложение заново.': ['Документ уже изменился. Попросите ИИ подготовить предложение заново.', 'The document has changed. Ask AI to prepare a new proposal.'],
    'Предложение не прошло проверку: {detail}': ['Предложение не прошло проверку: {detail}', 'The proposal failed validation: {detail}'],
    'Изменения применены к Source. Сохраните файл, когда будете готовы.': ['Изменения применены к коду. Сохраните файл, когда будете готовы.', 'Changes applied to the source. Save the file when ready.'],
    'Предложение отклонено, документ не изменён.': ['Предложение отклонено, документ не изменён.', 'Proposal rejected; the document is unchanged.'],
    'ИИ-помощник сейчас недоступен.': ['ИИ-помощник сейчас недоступен.', 'The AI assistant is currently unavailable.'],
    'ИИ-помощник вернул некорректный ответ.': ['ИИ-помощник вернул некорректный ответ.', 'The AI assistant returned an invalid response.'],
    'Инициализация CAD-ядра...': ['Инициализация геометрического ядра…', 'Initializing the geometry kernel…'],
    'Source изменён · пересчёт модели...': ['Код изменён · пересчёт модели…', 'Source changed · rebuilding model…'],
    'Инициализация CAD-ядра и построение модели...': ['Инициализация ядра и построение модели…', 'Initializing the kernel and building the model…'],
    'Модель синхронизирована · ревизия {revision}': ['Модель синхронизирована · ревизия {revision}', 'Model is up to date · revision {revision}'],
    'Создание нового документа...': ['Создание нового документа…', 'Creating a new document…'], 'Открытие {name}...': ['Открытие {name}…', 'Opening {name}…'],
    '{name} сохранён': ['{name} сохранён', '{name} saved'], '{name} сохранён; локальная история недоступна': ['{name} сохранён; локальная история недоступна', '{name} saved; local history is unavailable'],
    'Не удалось открыть файл: {detail}': ['Не удалось открыть файл: {detail}', 'Could not open the file: {detail}'],
    'Не удалось сохранить файл: {detail}': ['Не удалось сохранить файл: {detail}', 'Could not save the file: {detail}'],
    'Не удалось открыть файл': ['Не удалось открыть файл', 'Could not open the file'], 'Не удалось сохранить файл': ['Не удалось сохранить файл', 'Could not save the file'],
    'Есть несохранённые изменения. Продолжить без сохранения?': ['Есть несохранённые изменения. Продолжить без сохранения?', 'There are unsaved changes. Continue without saving?'],
    'Имя файла TextCAD': ['Имя файла модели', 'Model file name'],
    'Документ TextCAD': ['Документ ТекстВСАПР', 'TextTOCAD document'],
    'Не удалось сохранить черновик браузера. Сохраните файл вручную.': ['Не удалось сохранить черновик браузера. Сохраните файл вручную.', 'Could not save the browser draft. Save the file manually.'],
    'Файл открыт, но локальная история недоступна. Сохраняйте файл вручную.': ['Файл открыт, но локальная история недоступна. Сохраняйте файл вручную.', 'The file opened, but local history is unavailable. Save manually.'],
    'Документ изменился во время восстановления. Выберите версию ещё раз.': ['Документ изменился во время восстановления. Выберите версию ещё раз.', 'The document changed during restoration. Select the version again.'],
    'DSL не опубликовал корневую модель.': ['В документе не указан результат для отображения через root.', 'The document did not publish a root model.'],
    'Не удалось проверить предложение ИИ.': ['Не удалось проверить предложение ИИ.', 'Could not validate the AI proposal.'],
    'История версий…': ['История версий…', 'Version history…'], 'История файла': ['История файла', 'File history'],
    'Только в этом браузере · версий: {count}': ['Только в этом браузере · версий: {count}', 'Local to this browser · versions: {count}'],
    'Сохранить версию': ['Сохранить версию', 'Save version'], 'Версии документа': ['Версии документа', 'Document versions'],
    'Загрузка истории…': ['Загрузка истории…', 'Loading history…'], 'Версий пока нет. Сохраните первую контрольную точку.': ['Версий пока нет. Сохраните первую контрольную точку.', 'No versions yet. Save your first checkpoint.'],
    'совпадает с Source': ['совпадает с текущим кодом', 'matches current source'], 'Исходный код версии': ['Исходный код версии', 'Version source code'],
    'Изменения при восстановлении': ['Изменения при восстановлении', 'Changes on restore'], 'Эта версия совпадает с текущей': ['Эта версия совпадает с текущей', 'This version matches the current one'],
    'Показан Source выбранной версии целиком': ['Показан весь код выбранной версии', 'Showing the full source of the selected version'],
    'Исходный код выбранной версии': ['Исходный код выбранной версии', 'Selected version source code'],
    'Сравнение версии с текущим Source': ['Сравнение версии с текущим кодом', 'Compare version with current source'],
    'Текущий вариант останется в истории. Файл на диске сохраните отдельно.': ['Текущий вариант останется в истории. Файл на диске сохраните отдельно.', 'The current version stays in history. Save the file to disk separately.'],
    'Сохранение…': ['Сохранение…', 'Saving…'], 'Восстановить версию': ['Восстановить версию', 'Restore version'], 'Как хранится история': ['Как хранится история', 'How history is stored'],
    historyLimits: ['Только исходный код: до 100 версий и 5 МБ на документ, до 25 МБ и 100 документов суммарно. При заполнении удаляются старые автоматические версии, затем контрольные точки; при общем лимите — история давно не открывавшихся файлов. Очистка данных сайта удалит историю. В файл .textcad она не включается.', 'Source text only: up to 100 versions and 5 MB per document, 25 MB and 100 documents in total. Old automatic versions are removed first, then checkpoints; the global limit removes histories of least recently used files. Clearing site data deletes history. It is not included in .textcad files.'],
    'Начало сеанса': ['Начало сеанса', 'Session started'], 'Новый документ': ['Новый документ', 'New document'], 'Открытие файла': ['Открытие файла', 'File opened'], 'Правка Source': ['Правка кода', 'Source edit'],
    'Контрольная точка': ['Контрольная точка', 'Checkpoint'], 'Сохранение файла': ['Сохранение файла', 'File saved'], 'До изменения ИИ': ['До изменения ИИ', 'Before AI edit'],
    'Изменение ИИ': ['Изменение ИИ', 'AI edit'], 'До восстановления': ['До восстановления', 'Before restore'], 'Восстановление версии': ['Восстановление версии', 'Version restored'],
    'Б': ['Б', 'B'], 'КБ': ['КБ', 'KB'],
    'Операция не завершена. Текущий Source сохранён в редакторе.': ['Операция не завершена. Текущий код остался в редакторе.', 'The operation did not complete. Current source is still in the editor.'],
    'Source больше 5 МБ: локальная версия не сохранена. Сохраните файл вручную.': ['Код больше 5 МБ: локальная версия не сохранена. Сохраните файл вручную.', 'Source exceeds 5 MB: the local version was not saved. Save the file manually.'],
    'Не удалось прочитать историю.': ['Не удалось прочитать историю.', 'Could not read history.'], 'Не удалось сохранить историю.': ['Не удалось сохранить историю.', 'Could not save history.'],
    'Эта версия относится к другому документу.': ['Эта версия относится к другому документу.', 'This version belongs to another document.'],
    'Закройте другие вкладки TextCAD, чтобы открыть хранилище истории.': ['Закройте другие вкладки приложения, чтобы открыть хранилище истории.', 'Close other application tabs to open the history storage.'],
    'Не удалось сохранить локальную историю. Проверьте свободное место и сохраните файл вручную.': ['Не удалось сохранить локальную историю. Проверьте свободное место и сохраните файл вручную.', 'Could not save local history. Check available storage and save the file manually.'],
    'Failed to fetch': ['Нет соединения с сервером. Повторите запрос.', 'Could not connect to the server. Try again.'],
    'Request is too large.': ['Запрос слишком большой.', 'Request is too large.'], 'Message is required.': ['Введите сообщение.', 'Enter a message.'],
    'Message is too long.': ['Сообщение слишком длинное.', 'Message is too long.'], 'Invalid TextCAD source.': ['Некорректный исходный код модели.', 'Invalid model source.'],
    'Method not allowed.': ['Этот метод запроса не поддерживается.', 'Method not allowed.'],
    '{key} не настроен. Создайте файл .env по примеру .env.example.': ['{key} не настроен. Создайте файл .env по примеру .env.example.', '{key} is not configured. Create .env using .env.example.'],
    'ИИ-провайдер вернул некорректное предложение изменений.': ['ИИ-провайдер вернул некорректное предложение изменений.', 'The AI provider returned an invalid edit proposal.'],
    'Модель перегружена. Повторите запрос позже.': ['Модель перегружена. Повторите запрос позже.', 'The model is under high demand. Try again later.'],
    'Время ожидания ответа истекло. Повторите запрос.': ['Время ожидания ответа истекло. Повторите запрос.', 'The request timed out. Try again.'],
    'Antigravity CLI недоступен.': ['Antigravity CLI недоступен.', 'Antigravity CLI is unavailable.'],
    'Не удалось запустить Antigravity CLI ({command}).': ['Не удалось запустить Antigravity CLI ({command}).', 'Could not start Antigravity CLI ({command}).'],
    'Antigravity CLI не ответил за {seconds} секунд.': ['Antigravity CLI не ответил за {seconds} секунд.', 'Antigravity CLI did not respond within {seconds} seconds.'],
    'Antigravity CLI вернул слишком большой ответ.': ['Antigravity CLI вернул слишком большой ответ.', 'Antigravity CLI returned an oversized response.'],
    'Antigravity CLI вернул неизвестный формат версии.': ['Antigravity CLI вернул неизвестный формат версии.', 'Antigravity CLI returned an unknown version format.'],
    'Установленная версия Antigravity CLI не поддерживает: {flags}.': ['Установленная версия Antigravity CLI не поддерживает: {flags}.', 'This Antigravity CLI version does not support: {flags}.'],
    'Не удалось проверить флаги Antigravity CLI.': ['Не удалось проверить флаги Antigravity CLI.', 'Could not verify the Antigravity CLI flags.'],
    'Antigravity CLI нарушил NDJSON-контракт ответа.': ['Antigravity CLI нарушил NDJSON-контракт ответа.', 'Antigravity CLI returned an invalid NDJSON response.'],
    'Antigravity CLI попытался вызвать инструмент; ответ отклонён.': ['Antigravity CLI попытался вызвать инструмент; ответ отклонён.', 'Antigravity CLI attempted a tool call; its response was rejected.'],
    'Antigravity CLI не подтвердил строгий режим разрешений.': ['Antigravity CLI не подтвердил строгий режим разрешений.', 'Antigravity CLI did not confirm strict permission mode.'],
    'Antigravity CLI не вернул итоговый результат.': ['Antigravity CLI не вернул итоговый результат.', 'Antigravity CLI returned no final result.'],
    'Antigravity CLI не вернул structured_output по заданной JSON Schema.': ['Antigravity CLI не вернул structured_output по заданной JSON Schema.', 'Antigravity CLI returned no structured_output matching the JSON Schema.'],
    'Не удалось разобрать ответ Antigravity CLI.': ['Не удалось разобрать ответ Antigravity CLI.', 'Could not parse the Antigravity CLI response.'],
    'Antigravity CLI завершился с кодом {code}.': ['Antigravity CLI завершился с кодом {code}.', 'Antigravity CLI exited with code {code}.'],
    'Ollama не успел ответить за 3 минуты.': ['Ollama не успел ответить за 3 минуты.', 'Ollama did not respond within 3 minutes.'],
    'Ollama не запущен. Откройте Ollama и повторите запрос.': ['Ollama не запущен. Откройте Ollama и повторите запрос.', 'Ollama is not running. Open Ollama and try again.'],
    'Ollama не вернул текст.': ['Ollama не вернул текст.', 'Ollama returned no text.'],
    'Не удалось выполнить операцию. Повторите попытку.': ['Не удалось выполнить операцию. Повторите попытку.', 'Could not complete the operation. Try again.'],
} as const satisfies Record<string, readonly [string, string]>

export type MessageKey = keyof typeof messages
type Values = Record<string, string | number>
export function translate(key: MessageKey, locale: Locale, values: Values = {}): string {
    return messages[key][locale === 'ru' ? 0 : 1].replace(/\{(\w+)\}/g, (_, name: string) => String(values[name] ?? `{${name}}`))
}
const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const aliases = new Map<string, MessageKey>()
const dynamicMessages = (Object.keys(messages) as MessageKey[]).flatMap((key) => {
    for (const label of messages[key]) aliases.set(label, key)
    return [...new Set<string>([key, ...messages[key]])].filter((label) => label.includes('{')).map((label) => ({
        key, names: [...label.matchAll(/\{(\w+)\}/g)].map((match) => match[1]),
        pattern: new RegExp('^' + label.split(/\{\w+\}/).map(escapeRegex).join('([\\s\\S]+?)') + '$'),
    }))
})

/** Translate stored UI messages at display time, so language switching updates existing status. */
export function localizeText(text: string, locale: Locale): string {
    if (Object.hasOwn(messages, text)) return translate(text as MessageKey, locale)
    const alias = aliases.get(text)
    if (alias) return translate(alias, locale)
    for (const { key, names, pattern } of dynamicMessages) {
        const match = text.match(pattern)
        if (match) return translate(key, locale, Object.fromEntries(names.map((name, i) => [name, name === 'detail' ? localizeText(match[i + 1], locale) : match[i + 1]])))
    }
    if (/high demand|resource.exhausted|\b503\b/i.test(text)) return translate('Модель перегружена. Повторите запрос позже.', locale)
    if (/timed? ?out|timeout/i.test(text)) return translate('Время ожидания ответа истекло. Повторите запрос.', locale)
    if (locale === 'en' && /[А-Яа-яЁё]/.test(text)) return translate('Не удалось выполнить операцию. Повторите попытку.', locale)
    if (locale === 'ru' && /^[A-Za-z]/.test(text) && !/[А-Яа-яЁё]/.test(text)) return translate('Не удалось выполнить операцию. Повторите попытку.', locale)
    return text
}

export function countNoun(count: number, kind: 'body' | 'feature' | 'sketch', locale: Locale) {
    const category = new Intl.PluralRules(localeTag(locale)).select(count)
    return translate(`${kind}_${category === 'one' ? 'one' : category === 'few' ? 'few' : 'many'}`, locale)
}
