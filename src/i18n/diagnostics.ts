import { localizeText, type Locale } from './messages.ts'

const russian: Record<string, string> = {
    'Expected a length in mm, not an angle.': 'Ожидается длина в мм, а не угол.',
    'Expected a length value or parameter reference.': 'Ожидается длина или ссылка на параметр длины.',
    'Expected an angle in deg or an angle parameter.': 'Ожидается угол в градусах или параметр угла.',
    'Expected a dimensionless number or number parameter.': 'Ожидается безразмерное число или числовой параметр.',
    'Expected a number or physical quantity.': 'Ожидается число или физическая величина.',
    'Expected a two-dimensional point.': 'Ожидается двумерная точка.',
    'Expected a three-dimensional point.': 'Ожидается трёхмерная точка.',
    'A two-dimensional point must contain exactly two length values.': 'Двумерная точка должна содержать ровно две длины.',
    'origin must contain exactly three length values [x y z].': 'Начало координат должно содержать три длины [x y z].',
    'axis must be X, Y, Z or a dimensionless direction [x y z].': 'Ось задаётся как X, Y, Z или безразмерный вектор [x y z].',
    'Axis direction must be a finite non-zero vector.': 'Направление оси должно быть конечным ненулевым вектором.',
    'The document must start with a textcad header.': 'Документ должен начинаться с заголовка textcad.',
    'The document must publish at least one root.': 'Укажите хотя бы одно итоговое тело через root.',
    'The textcad header is only allowed as the first form.': 'Заголовок textcad разрешён только в начале документа.',
    'version must be the integer 1.': 'Поддерживается только версия 1.',
    'default-length must be mm in DSL v0.': 'Единица длины в заголовке должна быть mm.',
    'default-angle must be deg in DSL v0.': 'Единица угла в заголовке должна быть deg.',
    'let expects a command form as its value.': 'Значением let должна быть команда в квадратных скобках.',
    'root label must be a string.': 'Метка результата должна быть строкой.',
    'sketch only accepts profile child forms.': 'Внутри эскиза разрешены только контуры profile.',
    'sketch requires at least one profile.': 'Эскиз должен содержать хотя бы один контур.',
    'sketch requires at least one outer profile.': 'Эскиз должен содержать внешний контур.',
    'profile only accepts curve child forms.': 'Внутри контура разрешены только команды кривых.',
    'profile requires at least one curve.': 'Контур должен содержать хотя бы одну кривую.',
    'profile role must be outer or hole.': 'Роль контура задаётся как outer или hole.',
    'Circle radius must be greater than zero.': 'Радиус окружности должен быть больше нуля.',
    'A circle or ellipse must be the only curve in its profile.': 'Окружность или эллипс должны быть единственной кривой своего контура.',
    'Profile is not closed.': 'Контур не замкнут.', 'Profile is empty.': 'Контур пуст.',
    'Adjacent curves do not share the same endpoint.': 'Концы соседних кривых не совпадают.',
    'Arc points must not be collinear.': 'Три точки дуги не должны лежать на одной прямой.',
    'Profile contains intersecting non-adjacent line segments.': 'Несоседние отрезки контура пересекаются.',
    'Consecutive polyline vertices must be distinct.': 'Соседние вершины полилинии должны различаться.',
    'Extrusion length must not be zero.': 'Длина выдавливания не должна быть нулевой.',
    'Rotation span must be non-zero and between -360deg and 360deg.': 'Угол вращения должен быть ненулевым и находиться в пределах от −360° до 360°.',
    'A point requires exactly one selected vertex.': 'Для точки нужно выбрать ровно одну вершину.',
    'A working plane requires exactly one planar face.': 'Для рабочей плоскости нужно выбрать ровно одну плоскую грань.',
    'Plane x-direction must not be parallel to its normal.': 'Локальная ось X не должна быть параллельна нормали плоскости.',
    'Selected elements must belong to the operation input; select from that body.': 'Выбранные элементы должны принадлежать входному телу этой операции.',
    'Each loft section must have one connected outer region; holes are supported.': 'Каждое сечение должно иметь одну связанную внешнюю область. Отверстия разрешены.',
    'Loft sections must have the same number of holes, in corresponding order.': 'Сечения должны иметь одинаковое число соответствующих отверстий.',
    'The cutting feature does not remove material from its input body. Check its origin, axis and dimensions.': 'Операция не удаляет материал. Проверьте начало, ось и размеры инструмента.',
    'Thread supports at most 64 turns, depth < radius and depth <= 0.7*pitch.': 'Допустимо не более 64 витков: глубина меньше радиуса и не больше 0,7 шага.',
    'CAD operation produced invalid topology or self-intersecting geometry.': 'Получена некорректная топология или самопересекающаяся геометрия.',
    'Operation produced no solid volume. Check whether the operands overlap or the cut removes the entire body.': 'В результате нет объёмного тела. Проверьте пересечение операндов и глубину вычитания.',
    'CAD kernel failed to build the operation.': 'Геометрическое ядро не смогло построить операцию.',
    'near and within must be specified together.': 'Аргументы near и within должны задаваться вместе.',
    'hole uses either through=true or depth, not both.': 'Для отверстия задайте либо through=true, либо depth.',
    'counterbore-radius and counterbore-depth must be provided together.': 'Радиус и глубина цековки задаются вместе.',
    'Choose a counterbore or countersink, not both.': 'Задайте либо цековку, либо зенковку.',
}
const fallback: Record<string, string> = {
    'TCD-P001': 'Не закрыта квадратная скобка.', 'TCD-P002': 'Неожиданный символ или неправильная структура команды.',
    'TCD-P003': 'Незавершённая строка или неверная последовательность экранирования.', 'TCD-P004': 'Некорректное число или единица измерения.',
    'TCD-S001': 'Неизвестная команда или отсутствует имя команды.', 'TCD-S002': 'Неизвестная ссылка на имя.',
    'TCD-S003': 'Имя уже объявлено в документе.', 'TCD-S004': 'Отсутствует обязательный аргумент или дочерняя команда.',
    'TCD-S005': 'Неизвестный или повторяющийся аргумент.', 'TCD-S006': 'Несовместимые типы, единицы измерения или аргументы команды.',
    'TCD-S007': 'Ссылка на имя до его объявления запрещена.', 'TCD-S008': 'Нет итогового тела, опубликованного через root.',
    'TCD-G001': 'Контур не замкнут.', 'TCD-G002': 'Соседние кривые не соединены.', 'TCD-G003': 'Контур самопересекается.',
    'TCD-G004': 'Проверьте размеры, оси и выбор элементов этой операции.', 'TCD-G005': 'Геометрическое ядро не смогло построить операцию.',
    'TCD-G006': 'Операция не оставила объёмного тела.', 'TCD-G007': 'Результат имеет некорректную топологию.',
    'TCD-R001': 'Не удалось выполнить операцию геометрического ядра.',
}
export function localizeDiagnostic(diagnostic: { code: string; message: string }, locale: Locale) {
    const text = diagnostic.message
    if (locale === 'en') return /[А-Яа-яЁё]/.test(text) ? localizeText(text, locale) : text
    if (russian[text]) return russian[text]
    if (/[А-Яа-яЁё]/.test(text)) return localizeText(text, locale)
    let match = text.match(/^Unknown command "(.+)"\.$/)
    if (match) return `Неизвестная команда «${match[1]}».`
    match = text.match(/^Unknown reference "(.+)"\./)
    if (match) return `Неизвестная ссылка «${match[1]}».`
    match = text.match(/^Name "(.+)" is already declared\.$/)
    if (match) return `Имя «${match[1]}» уже объявлено.`
    match = text.match(/^Missing required argument "(.+)" for command "(.+)"\.$/)
    if (match) return `В команде «${match[2]}» отсутствует аргумент «${match[1]}».`
    match = text.match(/^Unknown argument "(.+)" for command "(.+)"\.$/)
    if (match) return `Неизвестный аргумент «${match[1]}» в команде «${match[2]}».`
    match = text.match(/^Argument "(.+)" is specified more than once\.$/)
    if (match) return `Аргумент «${match[1]}» указан несколько раз.`
    match = text.match(/^(.+) must be finite and greater than zero\.$/)
    if (match) return 'Размер должен быть конечным числом больше нуля.'
    match = text.match(/^(edges|faces|vertices) selection matched no elements\.$/)
    if (match) return 'Выборка не содержит подходящих элементов.'
    return fallback[diagnostic.code] ?? 'Не удалось построить модель. Проверьте указанную строку.'
}

export function localizeStatus(text: string, locale: Locale) {
    const match = text.match(/^(TCD-[A-Z]\d+) · (\d+:\d+) · ([\s\S]+)$/)
    return match ? `${match[1]} · ${match[2]} · ${localizeDiagnostic({ code: match[1], message: match[3] }, locale)}` : localizeText(text, locale)
}
