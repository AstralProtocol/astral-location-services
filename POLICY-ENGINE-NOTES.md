Policy Engine — Working Notes
Purpose (what problem this actually solves)

Provide a deterministic, declarative way to answer: “Given a point (and time), does this satisfy my geospatial rule?”

Make UIDs (Location Protocol records) first-class so developers can reference canonical locations/regions, not reinvent geometry.

Return explainable decisions (allow/score + reasons) rather than opaque booleans.

Be the compute half of Location Services; attestations are produced by verification, policies gate behavior or eligibility.

Scope (MVP)

Inputs: a single point (+ optional timestamp) and a predicate JSON.

Predicates (built-ins):
??? What are the 20% of predicates we need for 80% of use cases?
Do "predicates" cover everything? I would love to have other geospatial functions — measurements, basically — but if that's too complicated to cover off that could be v2

Principles 

Deterministic: same inputs → same output. No nondeterministic data sources.

Explainable: the decision is auditable via reasons[] and echoed thresholds.

UID-first: prefer Location Protocol UIDs everywhere. GeoJSON is allowed but second-class.

LP-aware, not LP-bloated: if the result doesn’t include location data, don’t force LP objects into it.

Minimal kernel: small predicate registry + interpreter. Everything else (UID deref, PostGIS calls) lives behind clear interfaces.

Cost-aware: evaluate cheap predicates first; short-circuit aggressively.

Bounded: enforce depth/width/size limits to avoid pathological trees and heavy DB scans.

Versioned: predicates carry versions; behavior changes create @2, never mutate @1.