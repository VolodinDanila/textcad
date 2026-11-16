import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import type { ListNode, NamedArgumentNode } from '../../src/dsl/ast.ts'
import { parseTextCad } from '../../src/dsl/parser.ts'

function getNamedArgument(form: ListNode, name: string): NamedArgumentNode {
    const argument = form.items.find(
        (item): item is NamedArgumentNode => item.kind === 'namedArgument' && item.name.value === name,
    )

    assert.ok(argument, `Expected named argument "${name}".`)
    return argument
}

test('parses the star example without syntax diagnostics', () => {
    const source = readFileSync(
        new URL('../../docs/dsl/examples/star.textcad', import.meta.url),
        'utf8',
    )

    const result = parseTextCad(source, { revisionId: 12 })

    assert.deepEqual(result.diagnostics, [])
    assert.equal(result.document.forms.length, 5)
    assert.equal(result.document.forms[0].items[0]?.kind, 'identifier')
    assert.equal(result.document.forms[0].items[0]?.value, 'textcad')
    assert.equal(result.document.span.start.line, 4)
})

test('parses nested forms, named arguments and quantities', () => {
    const source = '[let body [extrude profile length=20mm symmetric=false]]'
    const result = parseTextCad(source)
    const declaration = result.document.forms[0]
    const extrusion = declaration.items[2]

    assert.deepEqual(result.diagnostics, [])
    assert.equal(extrusion?.kind, 'list')

    const length = getNamedArgument(extrusion as ListNode, 'length')
    assert.equal(length.value.kind, 'quantity')
    if (length.value.kind !== 'quantity') {
        assert.fail('Expected a quantity value.')
    }
    assert.equal(length.value.value, 20)
    assert.equal(length.value.unit, 'mm')
    assert.equal(length.value.raw, '20mm')

    const symmetric = getNamedArgument(extrusion as ListNode, 'symmetric')
    assert.equal(symmetric.value.kind, 'boolean')
    assert.equal(symmetric.value.value, false)
})

test('ignores comments and decodes supported string escapes', () => {
    const source = [
        '; comment',
        String.raw`[root body label="Star\n\"A\""]`,
    ].join('\n')
    const result = parseTextCad(source)
    const label = getNamedArgument(result.document.forms[0], 'label')

    assert.deepEqual(result.diagnostics, [])
    assert.equal(label.value.kind, 'string')
    assert.equal(label.value.value, 'Star\n"A"')
    assert.equal(result.document.forms[0].span.start.line, 2)
})

test('reports an unclosed list with revision and source span', () => {
    const result = parseTextCad('[root body', { revisionId: 41 })
    const diagnostic = result.diagnostics[0]

    assert.equal(diagnostic?.code, 'TCD-P001')
    assert.equal(diagnostic?.revisionId, 41)
    assert.deepEqual(diagnostic?.sourceSpan.start, { offset: 0, line: 1, column: 1 })
})

test('reports unterminated strings and malformed quantities', () => {
    const stringResult = parseTextCad('[root body label="Star]')
    const quantityResult = parseTextCad('[param width 12cm]')

    assert.ok(stringResult.diagnostics.some(({ code }) => code === 'TCD-P003'))
    assert.ok(stringResult.diagnostics.some(({ code }) => code === 'TCD-P001'))
    assert.equal(quantityResult.diagnostics[0]?.code, 'TCD-P004')
})

test('recovers after an unexpected top-level token', () => {
    const result = parseTextCad('oops [root body]')

    assert.equal(result.diagnostics[0]?.code, 'TCD-P002')
    assert.equal(result.document.forms.length, 1)
    assert.equal(result.document.forms[0].items[0]?.value, 'root')
})
