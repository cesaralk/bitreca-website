// A timed-out mutation is never replayed automatically. Verify saved state by ID.
export function storeSaveMatches(record, id, data, previousVersion) {
  return record?.id === id && Number.isSafeInteger(record.version) && record.version > (previousVersion || 0) &&
    Object.entries(data).every(([field, value]) => Object.hasOwn(record, field) && Object.is(record[field], value))
}
