# Команды TextCAD DSL

Команды от `textcad` до `intersect`, описанные ниже, реализованы в Parser,
Semantic и Evaluator. Заголовок `version=1` сохранён; старые документы совместимы.
Команды из раздела «Не реализовано» выполнять нельзя.

## Заголовок `textcad`

Обязательная первая форма документа.

```text
[textcad version=1 default-length=mm default-angle=deg]
```

| Аргумент | Тип | Обязателен |
|---|---|---|
| `version` | integer | да |
| `default-length` | unit | да в v0 |
| `default-angle` | unit | да в v0 |

## `param`

Объявляет именованный параметр.

```text
[param width 100mm]
```

```text
[param identifier scalar-or-quantity]
```

## `let`

Связывает имя с результатом выражения.

```text
[let body [extrude profile length=20mm]]
```

```text
[let identifier expression]
```

Имя должно быть уникальным в документе.

## `root`

Публикует значение как результат документа.

```text
[root body label="Main body"]
```

| Аргумент | Тип | Обязателен |
|---|---|---|
| первый позиционный | reference | да |
| `label` | string | нет |

Все опубликованные `root` отображаются одновременно. Повторная публикация одного
имени не дублирует геометрию. Промежуточные тела без `root` остаются доступными
для следующих операций, но не отображаются. Независимые опубликованные тела
могут пересекаться: `root` не выполняет неявное объединение.

## `sketch`

Создаёт эскиз на базовой плоскости.

```text
[sketch plane=XY
  [profile role=outer
    ...
  ]
]
```

| Аргумент | Тип | Обязателен |
|---|---|---|
| `plane` | `XY`, `XZ` или `YZ` | да |
| `origin` | `[Length Length Length]` | нет, `[0mm 0mm 0mm]` |
| дочерние формы | `profile` | да, одна или больше |

`origin` задаёт начало эскиза в **мировых XYZ-координатах**. Координаты кривых
остаются локальными двумерными координатами выбранной плоскости. Разрешены
именованные параметры длины:

```text
[param top 8mm]
[let bossProfile [sketch plane=XY origin=[0mm 0mm top]
  [profile [circle center=[0mm 0mm] radius=6mm]]
]]
```

Можно объявлять несколько эскизов с разными плоскостями и началами координат.
Произвольные повёрнутые плоскости и sketch-on-face пока не реализованы.

## `profile`

Определяет замкнутую область внутри sketch.

```text
[profile role=outer
  [line start=[0mm 0mm] end=[40mm 0mm]]
  ...
]
```

| Аргумент | Тип | Значение по умолчанию |
|---|---|---|
| `role` | `outer` или `hole` | `outer` |

## `line`

```text
[line start=[0mm 0mm] end=[40mm 0mm]]
```

| Аргумент | Тип | Обязателен |
|---|---|---|
| `start` | Point2 | да |
| `end` | Point2 | да |

## `arc`

Дуга задаётся тремя точками.

```text
[arc
  start=[0mm 0mm]
  middle=[10mm 10mm]
  end=[20mm 0mm]
]
```

| Аргумент | Тип | Обязателен |
|---|---|---|
| `start` | Point2 | да |
| `middle` | Point2 | да |
| `end` | Point2 | да |

Три коллинеарные точки являются geometry error.

## `circle`

```text
[circle center=[0mm 0mm] radius=10mm]
```

| Аргумент | Тип | Обязателен |
|---|---|---|
| `center` | Point2 | да |
| `radius` | Length | да |

Circle должен быть единственной кривой своего profile в v0.

## `extrude`

```text
[extrude profile length=20mm symmetric=false]
```

| Аргумент | Тип | Значение по умолчанию |
|---|---|---|
| первый позиционный | sketch reference | обязателен |
| `length` | Length | обязателен |
| `symmetric` | boolean | `false` |

Положительное направление определяется нормалью sketch plane.
Нормали: `XY → +Z`, `XZ → -Y`, `YZ → +X`. Симметричное выдавливание
центрируется относительно плоскости, проходящей через `origin` эскиза.

## `union`, `cut`, `intersect`

Точные булевы операции над CAD-телами, а не склейка треугольников отображения.

```text
[let joined [union base boss]]
[let drilled [cut joined toolA toolB]]
[let shared [intersect bodyA bodyB]]
```

- От 2 до 32 позиционных аргументов, без именованных аргументов.
- Каждый аргумент — ранее объявленное тело или вложенная операция, возвращающая тело.
- Эскиз сам по себе не является телом: сначала нужен `extrude`.
- Входные тела не изменяются и могут использоваться повторно.
- `union` объединяет объёмы. Раздельные входы дают составной результат из нескольких тел.
- `cut A B C` последовательно вычитает B и C из A.
- `intersect A B C` оставляет объём, общий для всех аргументов.
- Пустой результат или контакт только гранью/ребром без объёма не является готовым телом:
  возвращается `TCD-G006`. Некорректная топология результата — `TCD-G007`.

Вложенная операция:

```text
[let drilled [cut base [extrude holeProfile length=20mm]]]
[root drilled label="Drilled body"]
```

Чтобы получить одну деталь, публикуйте итоговое тело, а не его пересекающиеся
операнды. `root base` вместе с `root drilled` покажет оба тела поверх друг друга.

Рабочие примеры: [boolean-demo.textcad](examples/boolean-demo.textcad)
и [multiple-roots.textcad](examples/multiple-roots.textcad).

## Не реализовано

Следующие имена приведены для проектирования примеров, но не являются частью
исполняемого ядра v0:

```text
box cylinder cone sphere torus
rectangle polygon polyline ellipse point plane
revolve loft fillet chamfer shell hole thread
translate rotate scale
mirror
pattern-linear pattern-circular
edges faces generated-by
```

Эти формы нельзя генерировать до их реализации. Объёмные примитивы `box`,
`cylinder`, `cone`, `sphere`, `torus` исключены из согласованного ядра языка.
Остальные согласованные команды будут добавляться следующими этапами.

