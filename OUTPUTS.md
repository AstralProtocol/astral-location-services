Produce three Notion-ready sections, consistent in tone and style with existing Astral docs:

1. **Developer Quickstart** — SDK-first examples (JS/TS) using

   ```ts
   import { AstralSDK } from '@decentralized-geo/astral-sdk'
   const sdk = new AstralSDK({ provider, defaultChain })
   ```

   showing how to:

   * fetch existing attestations 
   * verify a short GPS session and receive a signed **Location Attestation** 
   * evaluate a **geospatial policy** 
   
2. **Stub API Reference** — minimal HTTP routes the SDK will call:

   * `GET  /attestations` (read existing LP records)
   * `POST /verify/` (this endpoint will be for location proof verification, i.e. processing location stamps (evidence) and producing actionable outputs describing how confident we are that a location claim is true. We won't work on this too much right now, but we include it for completeness)
   * `POST /policy/` (the geospatial computation endpoint, where we )
     Include request/response examples, field names, and error codes that match Astral’s current API conventions.

3. **Core Concepts** — short explanatory section covering:

   * what the Location Services endpoint is and how it fits into Astral’s architecture;
   * the difference between **Location Attestations** (what this service emits) and **Location Proofs** (credibility vectors composed later);
   * use of **LP UIDs as first-class inputs** (preferred over raw place IDs);
   * optional use of **GeoJSON** wrapped into LP payloads on the client for integrity;

---

### Architectural questions and properties

* **Should we fork** `astral-api`? Or, design Location Services as a **separate container/service** deployed alongside it, sharing the same Postgres/PostGIS instance and accessible via the same gateway (`api.astral.global`)?
* If so, expose endpoints under `/verify/*` and `/policy/*`, routed to this new container?
* The service **reads** from the same attestation tables/API and **writes** new attestations or on-chain EAS entries?
* Use LP **UIDs as foreign keys** where possible. Accept raw GeoJSON only for on-the-fly evaluation? (Drawbacks to this?)
* Follow Astral’s documented error format and tone (Problem+JSON, calm, declarative style).

---

### Output format

* Write everything in clean Markdown suitable for Notion.
* Match the voice and layout of [docs.astral.global](https://docs.astral.global) — concise, declarative, technical, no marketing tone.
* Do **not** invent new conventions or namespaces; use the exact SDK and schema shapes you find in the docs and repo.

