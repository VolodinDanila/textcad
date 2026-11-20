# Команды TextCAD DSL

Команды от `textcad` до `extrude`, описанные ниже, реализованы в Parser,
Semantic и Evaluator DSL v0. Команды из раздела «Зарезервировано для следующего
этапа» пока не реализованы.

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
| дочерние формы | `profile` | да, одна или больше |

Offset plane и sketch-on-face не входят в v0.

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

## Зарезервировано для следующего этапа

Следующие имена приведены для проектирования примеров, но не являются частью
исполняемого ядра v0:

```text
box cylinder sphere
translate rotate scale
union cut intersect
pattern-linear pattern-circular
fillet chamfer
edges faces generated-by
```

До появления отдельной спецификации evaluator обязан возвращать unknown-command
error для этих форм, а не пытаться угадывать их семантику.

