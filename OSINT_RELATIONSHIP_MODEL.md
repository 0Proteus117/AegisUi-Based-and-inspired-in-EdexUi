# Relationship Model

Relationships are typed: AUTHORED_BY, BELONGS_TO, USES_DOMAIN,
USES_EMAIL_DOMAIN, RESOLVES_TO, LOCATED_AT, PUBLISHED_BY, MENTIONS,
ASSOCIATED_WITH, HOSTED_BY, REGISTERED_TO, OBSERVED_WITH and
POTENTIALLY_SAME_AS.

Every relationship requires at least one supporting observation with provenance.
Contradictions are retained as context. `POTENTIALLY_SAME_AS` is deliberately
conservative; `MERGE CONFIRMED` requires an explicit analyst confirmation.
