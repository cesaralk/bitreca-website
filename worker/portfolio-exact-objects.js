// This capability narrows an already-authorized cleanup to a signed exact-object
// inventory. It never grants ownership or performs a storage call itself.
const bytes = value => new TextEncoder().encode(value).length
function blocked() {
  const error = new Error('Exact-object authorization differs from storage.')
  error.code = 'CONFIGURATION_BLOCKED'
  throw error
}
export function createExactObjectGuard(inventory) {
  if (!Array.isArray(inventory) || inventory.length > 2000) blocked()
  const approved = new Map()
  for (const object of inventory) {
    if (!object || typeof object.prefix !== 'string' || !object.prefix.endsWith('/') ||
        typeof object.key !== 'string' || !object.key.startsWith(object.prefix) ||
        object.key.length <= object.prefix.length || object.key.includes('\0') || bytes(object.key) > 1024 ||
        !Number.isSafeInteger(object.size) || object.size < 0 ||
        typeof object.etag !== 'string' || !object.etag.length || object.etag.length > 200 ||
        [...object.etag].some(char => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127 || char === '"' || char === '\\') || approved.has(object.key)) blocked()
    approved.set(object.key, Object.freeze({ ...object }))
  }
  function member(key, prefix) {
    const expected = approved.get(key)
    if (!expected || expected.prefix !== prefix) blocked()
    return expected
  }
  function metadata(actual, expected) {
    if (!actual || actual.key !== expected.key || actual.size !== expected.size || actual.etag !== expected.etag) blocked()
  }
  return Object.freeze({
    assertPage(page, prefix) {
      for (const object of page.objects) metadata(object, member(object?.key, prefix))
    },
    assertBatch(keys, prefix) {
      // One HEAD and one DELETE fit the connected executor's two-call budget.
      if (!Array.isArray(keys) || keys.length !== 1) blocked()
      return member(keys[0], prefix)
    },
    assertHead(head, expected) {
      // A durable, exact signed intent exists before HEAD. Missing data can mean
      // a previous DELETE succeeded with a lost response; DELETE is idempotent.
      if (head !== null) metadata(head, expected)
    },
    keysForPrefix(prefix) {
      return [...approved.values()].filter(object => object.prefix === prefix).map(object => object.key)
    },
  })
}