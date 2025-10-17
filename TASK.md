
### Prompt for Claude Code

You’re helping design the **Astral Location Services** MVP for **Astral Protocol**, location-based services for Ethereum, built on the **Location Protocol (LP)** and **Ethereum Attestation Service (EAS)**.

**You must read:**

1. [https://docs.astral.global/sdk](https://docs.astral.global/sdk) — understand the existing Astral SDK’s structure, naming conventions, import style, and how it integrates with LP and EAS.
2. [https://docs.astral.global/api](https://docs.astral.global/api) — understand the existing API routes and data model.
3. [https://easierdata.org/updates/2025/2025-05-19-location-protocol-spec](https://easierdata.org/updates/2025/2025-05-19-location-protocol-spec) — understand the Location Protocol specification, schema URNs, and how LP-conformant data is structured.
4. [https://collective.flashbots.net/t/towards-stronger-location-proofs/5323](https://collective.flashbots.net/t/towards-stronger-location-proofs/5323) — read only to understand the conceptual distinction between *Location Attestations* and *Location Proofs*. Do **not** model the endpoint after this, and note that at times in the docs and software, the term "location proofs" or "proofs" is not used appropriately. 
- Location attestation: signed spatial data record conforming to the Location Protocol
- Location proof: as-yet-undefined artifact describing how well evidence (a collection of location stamps) corroborates a location claim. 

---

### Goal

Design and document an **MVP “Astral Location Services” endpoint** that harmonizes with the existing Astral SDK and API architecture. It doesn't have to perfectly harmonize with it, but we have written a lot of code and have a lot of functionality we want to build on. 
This service extends Astral’s capabilities beyond reading/indexing attestations by adding **geospatial computation and signing** functions. The core focus will be a hosted service that runs geospatial computations, outputting signed EAS attestations that can either be returned to the client or posted onchain. That output will be the key artifact needed for our ultimate goal: onchain geofencing systems. 

---

### Deliverables

We want to build this from a DevEx-first perspective. To that end, we're going to start with the Quickstart guide, some docs, etc, and work backwards down to technical requirements, data models, etc, then build a system to match the functionality we have on the tin. 

