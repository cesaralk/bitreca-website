import assert from 'node:assert/strict'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

// Pure parsing only: no authentication, subprocess, network or retry capability.
export function parseCliJson(output, exitCode) {
  assert.equal(exitCode, 0, 'CLI failed/interrupted; outcome unresolved. Do not retry.')
  assert.equal(typeof output, 'string')
  assert.ok(output.length > 0 && output.length <= 1024 * 1024, 'Missing or oversized CLI output; outcome unresolved.')
  const ansiCSI = new RegExp(String.fromCharCode(27) + '\\[[0-?]*[ -/]*[@-~]', 'g')
  const text = output.replace(ansiCSI, '').replace(/^\uFEFF/, '').replaceAll('\r\n', '\n')
  assert.ok(!/^\s*(?:\[ERROR\]|X \[ERROR\]|Fatal(?: error)?\b)/mi.test(text), 'CLI error output; outcome unresolved.')
  const documents = []
  let offset = 0
  while (offset < text.length) {
    const newline = text.indexOf('\n', offset), lineEnd = newline < 0 ? text.length : newline
    const line = text.slice(offset, lineEnd), trimmed = line.trimStart()
    if ((trimmed[0] !== '[' && trimmed[0] !== '{') || /^\[(?:WARNING|INFO|DEBUG)\]/.test(trimmed)) { offset = lineEnd + 1; continue }
    const start = offset + line.length - trimmed.length
    const stack = []
    let quoted = false, escaped = false, end = -1
    for (let cursor = start; cursor < text.length; cursor++) {
      const char = text[cursor]
      if (quoted) {
        if (escaped) escaped = false
        else if (char === '\\') escaped = true
        else if (char === '"') quoted = false
        continue
      }
      if (char === '"') quoted = true
      else if (char === '[' || char === '{') stack.push(char)
      else if (char === ']' || char === '}') {
        assert.equal(stack.pop(), char === ']' ? '[' : '{', 'Malformed JSON output; outcome unresolved.')
        if (stack.length === 0) { end = cursor + 1; break }
      }
    }
    assert.ok(end > start && !quoted, 'Truncated JSON output; outcome unresolved.')
    let value
    try { value = JSON.parse(text.slice(start, end)) } catch { throw new Error('Malformed JSON output; outcome unresolved.') }
    const nextNewline = text.indexOf('\n', end), suffixEnd = nextNewline < 0 ? text.length : nextNewline
    assert.ok(!text.slice(end, suffixEnd).trim(), 'Ambiguous text after JSON; outcome unresolved.')
    documents.push(value)
    offset = suffixEnd + 1
  }
  assert.equal(documents.length, 1, 'Expected one complete JSON document; outcome unresolved. Do not retry.')
  return documents[0]
}

export function parseCutoverAcknowledgment(output, exitCode) {
  const value = parseCliJson(output, exitCode)
  assert.ok(Array.isArray(value) && value.length === 1 && value[0]?.success === true, 'D1 did not confirm one successful query.')
  const row = value[0]
  assert.ok(!Object.hasOwn(row, 'finalBookmark') && !row.results?.some(item => Object.hasOwn(item, 'Total queries executed')),
    'D1 import summary is not a direct-query acknowledgment; inspect state without retrying.')
  assert.equal(row.meta?.changes, 1, 'Expected exactly one changed protocol row; do not bypass the guard.')
  assert.equal(row.meta?.rows_written, 1, 'Expected exactly one written protocol row.')
  assert.equal(row.meta?.changed_db, true, 'D1 write was not confirmed.')
  return value
}

export function parseCutoverReadback(output, exitCode) {
  const value = parseCliJson(output, exitCode)
  assert.equal(value?.read_only, true)
  assert.equal(value?.cutover_executed, false)
  assert.equal(value?.state?.protocol, 1)
  assert.equal(value?.state?.generation, 1)
  assert.equal(value?.state?.revision, 1)
  assert.equal(value?.state?.cleanup, 0)
  assert.equal(value?.state?.finalization, 0)
  return value
}

async function main(args) {
  assert.ok(args.length === 2 && ['d1', 'readback'].includes(args[0]) && /^-?\d+$/.test(args[1]), 'Use: d1|readback EXIT_CODE; CLI output arrives on stdin.')
  process.stdin.setEncoding('utf8')
  let output = ''
  for await (const chunk of process.stdin) { output += chunk; assert.ok(output.length <= 1024 * 1024, 'Oversized CLI output.') }
  const parsed = args[0] === 'd1' ? parseCutoverAcknowledgment(output, Number(args[1])) : parseCutoverReadback(output, Number(args[1]))
  console.log(JSON.stringify(parsed))
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => { console.error(`CLI output refused: ${error.message}`); process.exitCode = 1 })
}
