export function portfolioState(portfolio, job) {
  if (job?.phase === 'finalized') return 'finalized'
  if (portfolio.deletion_requested_at != null) return job?.phase === 'blocked' ? 'blocked' : 'pending'
  return portfolio.status === 'published' ? 'published' : 'draft'
}
// This helper is for the production Bitreca admin UI. It intentionally
// does not depend on the staging-only preview configuration.
export function portfolioAddress(portfolio) {
  if (typeof portfolio?.slug !== 'string' || !/^[a-z0-9-]{1,100}$/.test(portfolio.slug)) return null
  return `https://${portfolio.slug}.bitreca.com`
}
export function portfolioDisplayAddress(portfolio, deployment) {
  const address = portfolioAddress(portfolio, deployment)
  return address ? address.slice('https://'.length) : `${portfolio.slug} (website preview unavailable)`
}
export function deletionConfirmed(portfolio, value) {
  return Number.isSafeInteger(portfolio?.id) && portfolio.id > 0 && value === String(portfolio.id)
}
export function mergeJobEvidence(current, incoming) {
  const next = { ...current }
  for (const job of incoming) {
    if (next[job.id]?.phase !== 'finalized') next[job.id] = job
  }
  return next
}
export function folderUploadData(files) {
  const filtered = files.filter(file => {
    const parts = file.webkitRelativePath.split('/')
    return !parts.includes('.git') && !parts.includes('node_modules') &&
      !parts.some(part => part.startsWith('.')) && file.name.toLowerCase() !== 'readme.md'
  })
  if (!filtered.length) throw new Error('No supported website files were found in this folder.')
  const form = new FormData()
  for (const file of filtered) {
    const path = file.webkitRelativePath.split('/').slice(1).join('/')
    if (!path) throw new Error('Select a website folder so relative asset paths can be preserved.')
    form.append('files', file)
    form.append('paths', path)
  }
  return form
}
export async function mapLimited(items, limit, callback) {
  const results = new Array(items.length)
  let next = 0
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await callback(items[index], index)
    }
  }))
  return results
}
export const deletionPhaseText = {
  pending: 'Waiting for verification', blocked: 'Needs review', preparing: 'Preparing inventory', prepared: 'Inventory prepared',
  cleaning: 'Cleaning storage', retry_wait: 'Retry scheduled', storage_verified: 'Storage verified; awaiting finalization',
  finalized: 'Permanently deleted', queued: 'Queued', waiting_writers: 'Waiting for uploads',
}
