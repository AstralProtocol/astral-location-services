# What You Can Build with Astral Location Services

Astral Location Services enables a new category of decentralized applications, built using **location-based smart contracts**. By combining geospatial computation with EAS resolver contracts, you can gate any onchain action by real-world location.

## The Pattern

1. User proves their location (creates location attestation + location proof)
2. Astral Verifier computes a spatial relationship (distance, containment, etc.)
3. Service returns signed policy attestation
4. Smart contract verifies the policy and executes logic

With EAS resolvers, steps 3-4 become atomic: the attestation creation itself triggers your business logic.

---

## What You Can Build

### 🌍 Local Currencies (Geogated Swaps)

**Concept:** Token pairs that can only be traded by people physically in a region.

Create neighborhood economies where you must be present to participate. SF residents trade BAY tokens, NYC residents trade APPLE tokens, etc.

```typescript
// User in San Francisco
const myLocation = await sdk.location.create(userGPS);
const eligibility = await sdk.compute.contains(
  sfBayAreaUID,
  myLocation.uid,
  {
    schema: GEOGATED_SWAP_SCHEMA,
    submitOnchain: true
  }
);
// Resolver verifies location → executes swap atomically
```

**Use cases:**
- Neighborhood currencies
- Regional stablecoins
- Tourism tokens (only tradeable in the city)
- Event-specific tokens (music festival currency)

---

### 🏛️ Neighborhood DAOs

**Concept:** Governance tokens only mintable by residents of a specific area.

```typescript
const noeValleyDAO = new GeogatedDAO({
  region: noeValleyPolygonUID,
  tokenName: "Noe Valley Governance"
});

// Prove you live/work in the neighborhood
const proof = await sdk.compute.contains(
  noeValleyPolygonUID,
  myLocationUID
);
await noeValleyDAO.join(proof.uid, proof.signature);

// Vote on local issues
await noeValleyDAO.vote(proposalId, voteChoice);
```

**Use cases:**
- Community governance (park usage, local rules)
- Co-op management
- Neighborhood resource allocation
- Local mutual aid networks

---

### 🎟️ Proof-of-Visit NFTs

**Concept:** Collectibles you can only mint by physically visiting a location.

```typescript
// Prove you're at the Eiffel Tower
const proof = await sdk.compute.within(
  myLocationUID,
  eiffelTowerUID,
  100  // within 100 meters
);

// Resolver mints NFT if you're close enough
await visitNFT.claim(proof.uid, proof.signature);
```

**Use cases:**
- Travel badges (collect cities/landmarks)
- Conference attendance proofs
- Scavenger hunts with onchain checkpoints
- Historical site verification

---

### 📦 Delivery Verification

**Concept:** Escrow that releases only when package arrives at the right location.

```solidity
contract DeliveryEscrow {
    function confirmDelivery(bytes32 policyAttestationUID) public {
        // Check: was delivery location inside the delivery zone?
        Attestation memory att = eas.getAttestation(policyAttestationUID);
        (bool wasInZone) = abi.decode(att.data, (bool));

        require(wasInZone, "Wrong delivery location");
        escrow.release();
    }
}
```

**Use cases:**
- P2P delivery marketplaces
- Supply chain verification
- Last-mile logistics
- Food delivery with location proof

---

### 🎪 Event Check-Ins

**Concept:** POAPs, rewards, or access that require physical presence.

```typescript
// At a conference
const proof = await sdk.compute.contains(
  conferenceVenueUID,
  myLocationUID
);

// Get your attendance POAP
await event.checkIn(proof.uid, proof.signature);
```

**Use cases:**
- Conference attendance tracking
- Concert/festival badges
- Meetup verification
- Sports event proof-of-attendance

---

### 🗳️ Proximity-Weighted Voting

**Concept:** Vote weight increases the closer you are to what's being voted on.

```solidity
function vote(uint proposalId, bytes32 policyAttestationUID) public {
    // Decode distance from policy attestation
    (uint256 distance) = decodeDistance(policyAttestationUID);

    // Closer = more voting power
    uint256 weight = 1000 / (distance + 1);
    proposals[proposalId].voteWithWeight(msg.sender, weight);
}
```

**Use cases:**
- Local infrastructure decisions (closer neighbors have more say)
- Park/facility usage votes
- Noise ordinance voting (proximity-based)
- Development impact assessment

---

### 🏪 Location-Based Marketplaces

**Concept:** Buy/sell only from people in your area.

```typescript
// List item (seller must be in region)
const proof = await sdk.compute.contains(regionUID, sellerLocationUID);
await marketplace.list(itemId, price, proof.uid, proof.signature);

// Buy item (buyer must be nearby seller)
const proximityProof = await sdk.compute.within(
  buyerLocationUID,
  sellerLocationUID,
  5000  // within 5km
);
await marketplace.buy(itemId, proximityProof.uid, proximityProof.signature);
```

**Use cases:**
- Hyperlocal classifieds
- Farmers markets with verified vendors
- Tool/equipment sharing
- Local services marketplace

---

### 🎮 Location-Based Games

**Concept:** Onchain gameplay tied to real-world movement.

```typescript
// Capture territory
const proof = await sdk.compute.contains(territoryUID, myLocationUID);
await game.capture(territoryId, proof.uid, proof.signature);

// Battle (only if players are nearby)
const proximityProof = await sdk.compute.distance(
  player1LocationUID,
  player2LocationUID
);
await game.battle(opponent, proximityProof.uid, proximityProof.signature);
```

**Use cases:**
- Territory control games (onchain Risk)
- AR treasure hunts
- Geocaching with tokens
- Location-based battles/duels

---

### 🏥 Location-Contingent Insurance

**Concept:** Claims that require proof of location at time of incident.

```solidity
function fileClaim(
    bytes32 policyAttestationUID,
    string memory incidentType
) public {
    // Verify claimant was at the insured location
    Attestation memory att = eas.getAttestation(policyAttestationUID);
    (bool wasAtLocation, uint256 timestamp) = abi.decode(
        att.data,
        (bool, uint256)
    );

    require(wasAtLocation, "Not at insured location");
    require(timestamp >= policyStart && timestamp <= policyEnd);

    processClaimPayout(msg.sender);
}
```

**Use cases:**
- Travel insurance (prove you were stranded)
- Event cancellation coverage
- Weather-based crop insurance
- Location-specific liability coverage

---

### 🌳 Environmental Monitoring & Credits

**Concept:** Carbon credits, conservation proofs tied to physical locations.

```typescript
// Verify tree planting at specified location
const proof = await sdk.compute.contains(
  conservationZoneUID,
  plantingSiteUID
);

await carbonRegistry.registerPlanting(
  proof.uid,
  proof.signature,
  treeCount
);
// Mint carbon credits
```

**Use cases:**
- Reforestation verification
- Wildlife habitat monitoring
- Pollution reporting (location-verified)
- Community garden tracking

---

## The Building Blocks

All of these are built with just a few core operations:

- **`distance(uid1, uid2)`**: How far apart are two locations?
- **`contains(containerUID, pointUID)`**: Is a point inside an area?
- **`within(pointUID, targetUID, radius)`**: Is a point within X meters?
- **`intersects(uid1, uid2)`**: Do two areas overlap?

Combined with EAS resolver contracts, these primitives unlock an entirely new design space for Ethereum applications.

---

## Get Started

Check out the [Quickstart Guide](./docs/quickstart.md) to build your first location-based dApp.

**Have an idea?** We'd love to hear what you're building. Open an issue or join our community.
