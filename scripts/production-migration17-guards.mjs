import assert from 'node:assert/strict'

// Local SQL construction only. D1's batch rolls back when either SELECT raises.
export function migration17Guards(snapshotSQL,beforeText,migrationNames,afterSchema) {
  assert.ok(snapshotSQL.startsWith('SELECT ')&&snapshotSQL.endsWith(' AS snapshot'))
  assert.equal(migrationNames.length,17)
  assert.equal(new Set(migrationNames).size,17)
  migrationNames.forEach((name,index)=>assert.equal(Number(name.slice(0,4)),index+1))
  const expression=snapshotSQL.replace(/^SELECT /,'').replace(/ AS snapshot$/,'')
  return {
    beforeGuard:{sql:`SELECT CASE WHEN (${expression})=? THEN 'preflight-matched' ELSE json('MIGRATION17_STATE_MISMATCH') END AS verified`,params:[beforeText]},
    afterGuard:{sql:`SELECT CASE WHEN json_extract((${expression}),'$.tables')=json_extract(?,'$.tables')
      AND json_extract((${expression}),'$.migrationNames')=json(?) AND json_extract((${expression}),'$.schema')=json(?)
      AND (SELECT count(*) FROM portfolio_legacy_reconciliations)=0
      AND (SELECT count(*) FROM portfolio_legacy_reconciliation_objects)=0
      AND (SELECT count(*) FROM portfolio_legacy_inventory_bindings)=0
      THEN 'postconditions-matched' ELSE json('MIGRATION17_STATE_MISMATCH') END AS verified`,params:[beforeText,JSON.stringify(migrationNames),JSON.stringify(afterSchema)]},
  }
}
