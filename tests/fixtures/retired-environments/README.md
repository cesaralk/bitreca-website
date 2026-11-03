# Retired environment fixtures

These six files are byte-identical disabled configuration data retained for local
security/regression tests and package/owner-key validation dependencies. They were
removed from the project root so they cannot be mistaken for current deployment
configs. Their entry paths are fixture values, not runnable deployment targets.

Do not deploy these files, create their resources or attach production bindings.
Production uses only the two root Wrangler configurations. Fixture lookup paths
changed; isolation checks, policy guards and expected configuration bytes did not.
