import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'

// Real SQLite statements, in memory only. No Wrangler state or remote bindings.
export function contactDatabase({ migrate = true } = {}) {
  const sqlite = new DatabaseSync(':memory:')
  const state = { now: Math.floor(Date.now() / 1000), failure: null, queries: [] }
  sqlite.function('unixepoch', () => state.now)
  sqlite.exec(readFileSync(new URL('../../migrations/0004_create_admin_sessions.sql', import.meta.url), 'utf8'))
  sqlite.exec("CREATE TABLE projects (id INTEGER PRIMARY KEY, marker TEXT); INSERT INTO projects VALUES (1, 'keep-project'); CREATE TABLE portfolios (id INTEGER PRIMARY KEY, marker TEXT); INSERT INTO portfolios VALUES (1, 'keep-portfolio');")
  if (migrate) sqlite.exec(readFileSync(new URL('../../migrations/0018_add_contact_enquiries.sql', import.meta.url), 'utf8'))
  function statement(sql, bindings = []) {
    function execute(kind) {
      state.queries.push(sql)
      state.failure?.({ sql, phase: 'before' })
      const query = sqlite.prepare(sql)
      let result
      if (kind === 'first') result = query.get(...bindings) || null
      else if (kind === 'all') result = { success: true, results: query.all(...bindings).map(row => ({ ...row })) }
      else { const info = query.run(...bindings); result = { success: true, meta: { changes: Number(info.changes) } } }
      state.failure?.({ sql, phase: 'after' })
      return result
    }
    return { sql, bindings, execute, bind: (...values) => statement(sql, values), first: async () => execute('first'), all: async () => execute('all'), run: async () => execute('run') }
  }
  const db = {
    prepare: statement,
    async batch(statements) {
      sqlite.exec('BEGIN')
      try { const results = statements.map(item => item.execute('all')); sqlite.exec('COMMIT'); return results }
      catch (error) { sqlite.exec('ROLLBACK'); throw error }
    },
  }
  return { db, sqlite, state, close: () => sqlite.close() }
}
