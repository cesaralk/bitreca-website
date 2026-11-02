// Compatibility gate: historical direct-delete bridge excluded from protected release.
export const legacyDeletionEnabled = () => false
export const supportsLegacyIdentity = () => false
export const handleLegacyDelete = async () => null
export const retryLegacyDelete = async () => null
