// Policy selection comes exclusively from trusted deployment configuration.
export function evidencePolicy(trust) {
  return trust?.authorizationPolicy || 'independent-v1'
}

export async function requireCurrentAuthorization(db, trust) {
  const policy = await db.prepare(`SELECT p.*,s.policy AS active_policy FROM portfolio_storage_authorization_state s
    LEFT JOIN portfolio_storage_current_solo_policy p ON p.id=s.policy_id WHERE s.id=1`).first()
  if (!policy || policy.active_policy !== evidencePolicy(trust)) throw new Error('Authorization policy differs.')
  if (policy.active_policy === 'independent-v1') return
  if (!policy || policy.id !== trust.policyId || policy.generation !== trust.policyGeneration ||
      policy.operator_id !== trust.operatorId || policy.operator_key_id !== trust.operatorKeyId ||
      policy.storage_scope !== trust.storageScope || policy.deployment_sha256 !== trust.deploymentSha256) {
    throw new Error('Authorization generation, key or artifact is unavailable.')
  }
  return policy
}
