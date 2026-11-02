// Normalize transport line endings ONLY outside quoted SQL values/identifiers.
// Literal bytes, tokens, ordering and every other character remain significant.
export function normalizeSchemaLineEndings(sql) {
  if (sql === null) return null
  let output = '', quote = null, comment = null
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i], next = sql[i + 1]
    if (quote) {
      output += ch
      if (ch === quote) {
        if (next === quote && quote !== ']') { output += next; i++ } else quote = null
      }
      continue
    }
    if (ch === '\r' && next === '\n') { output += '\n'; i++; if (comment === 'line') comment = null; continue }
    if (comment) {
      output += ch
      if (comment === 'line' && ch === '\n') comment = null
      if (comment === 'block' && ch === '*' && next === '/') { output += next; i++; comment = null }
      continue
    }
    output += ch
    if (ch === '-' && next === '-') { output += next; i++; comment = 'line' }
    else if (ch === '/' && next === '*') { output += next; i++; comment = 'block' }
    else if (["'", '"', '`'].includes(ch)) quote = ch
    else if (ch === '[') quote = ']'
  }
  return output
}
