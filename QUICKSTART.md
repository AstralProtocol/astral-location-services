# Quickstart: Build a Location-Gated NFT in 10 Minutes

Build your first location-based smart contract. In this guide, you'll create an NFT that can only be minted by people physically near the Eiffel Tower.

## What You'll Learn

- Create location attestations
- Run geospatial computations
- Integrate results into smart contracts via EAS resolvers
- Use local operations (Turf.js) vs verifiable operations (Astral)

## Prerequisites

```bash
npm install @astral-protocol/sdk @turf/turf ethers
```

You'll need:
- A wallet with testnet ETH (Base Sepolia)
- Basic knowledge of TypeScript and Solidity
- 10 minutes

---

## Step 1: Set Up the SDK

```typescript
import { AstralSDK } from '@astral-protocol/sdk';
import { ethers } from 'ethers';

// Connect your wallet
const provider = new ethers.JsonRpcProvider('https://sepolia.base.org');
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

// Initialize Astral SDK
const sdk = new AstralSDK({
  signer: wallet,
  chainId: 84532  // Base Sepolia
});

console.log('SDK initialized!');
```

---

## Step 2: Create the Eiffel Tower Location

First, create a canonical location attestation for the Eiffel Tower that everyone can reference.

```typescript
// Define the Eiffel Tower as a point
const eiffelTowerLocation = {
  type: 'Point',
  coordinates: [2.2945, 48.8584]  // [longitude, latitude]
};

// Create a location attestation
const eiffelTower = await sdk.location.create(eiffelTowerLocation, {
  submitOnchain: true,
  metadata: {
    name: "Eiffel Tower",
    description: "Iconic Paris landmark",
    address: "Champ de Mars, Paris, France"
  }
});

console.log('Eiffel Tower UID:', eiffelTower.uid);
// Save this UID - everyone can use it to reference this location
```

**What just happened?**
- You created a signed attestation of the Eiffel Tower's location
- It's stored onchain on Base Sepolia
- You got back a UID (unique identifier) - a permanent reference to this location
- Anyone can now reference this location by UID instead of coordinates

---

## Step 3: Give Users Instant Feedback (Local Operation)

When a user opens your app, show them how close they are to the Eiffel Tower using **Turf.js** (instant, local, no cost).

```typescript
import * as turf from '@turf/turf';

// User's GPS location (from browser/mobile)
const userLocation = {
  type: 'Point',
  coordinates: [2.2951, 48.8580]  // Slightly different coords
};

// Calculate distance locally (instant)
const distanceKm = turf.distance(
  eiffelTowerLocation,
  userLocation,
  { units: 'kilometers' }
);

console.log(`You are ${distanceKm.toFixed(2)}km from the Eiffel Tower`);

// Show user real-time feedback
if (distanceKm > 0.5) {
  alert(`Keep going! ${distanceKm.toFixed(2)}km to go.`);
} else {
  alert('You're close enough! Claim your NFT.');
}
```

**Why use Turf here?**
- Instant feedback (no network call)
- Free (client-side computation)
- Great for UX (show distance in real-time)

But you can't trust this for minting - the user could fake their GPS. That's where Astral comes in.

---

## Step 4: Create Verifiable Proof (Astral Operation)

When the user wants to mint, create a **verifiable proof** using Astral.

```typescript
// First, attest to the user's location
const userLocationAttestation = await sdk.location.create(userLocation, {
  submitOnchain: false  // Keep offchain for now (cheaper)
});

console.log('User location attested:', userLocationAttestation.uid);

// Now compute: is user within 500m of Eiffel Tower?
const proximityProof = await sdk.compute.within(
  userLocationAttestation.uid,
  eiffelTower.uid,
  500,  // 500 meters
  {
    submitOnchain: false  // Get signature, submit manually later
  }
);

console.log('Proximity proof:', proximityProof);
// {
//   uid: "0xabc123...",
//   result: true,
//   distance: 72.4,  // actual distance in meters
//   signature: "0x...",
//   attestation: { ... }
// }
```

**What just happened?**
- You created a location attestation for the user (signed proof: "user was here")
- Astral computed the distance (server-side, verifiable)
- You got back a **signed policy attestation** with the result
- The signature proves Astral computed this result (not the user)

---

## Step 5: Simple Contract (Manual Verification)

Here's the simple approach - verify the signature in your contract:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract EiffelTowerNFT is ERC721 {
    address public astralSigner = 0x...; // Astral's known signer address
    uint256 public nextTokenId = 1;

    mapping(address => bool) public hasMinted;

    constructor() ERC721("Eiffel Tower Visitor", "EIFFEL") {}

    function mint(
        bytes32 policyAttestationUID,
        bool isNearby,
        uint256 distance,
        bytes memory signature
    ) public {
        require(!hasMinted[msg.sender], "Already minted");
        require(isNearby, "Not close enough to Eiffel Tower");
        require(distance <= 500, "Must be within 500m");

        // Verify signature from Astral
        bytes32 messageHash = keccak256(abi.encodePacked(
            policyAttestationUID,
            isNearby,
            distance
        ));
        bytes32 ethSignedHash = keccak256(abi.encodePacked(
            "\x19Ethereum Signed Message:\n32",
            messageHash
        ));

        address signer = recoverSigner(ethSignedHash, signature);
        require(signer == astralSigner, "Invalid signature");

        // Mint NFT
        hasMinted[msg.sender] = true;
        _mint(msg.sender, nextTokenId++);
    }

    function recoverSigner(bytes32 hash, bytes memory sig)
        internal pure returns (address) {
        // Signature verification logic
        (uint8 v, bytes32 r, bytes32 s) = splitSignature(sig);
        return ecrecover(hash, v, r, s);
    }

    function splitSignature(bytes memory sig)
        internal pure returns (uint8, bytes32, bytes32) {
        require(sig.length == 65);
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }
        return (v, r, s);
    }
}
```

**Call from frontend:**
```typescript
const tx = await eiffelNFT.mint(
  proximityProof.uid,
  proximityProof.result,
  proximityProof.distance,
  proximityProof.signature
);

await tx.wait();
console.log('NFT minted! 🎉');
```

---

## Step 6: Better Approach (EAS Resolver)

Instead of manual signature verification, use an **EAS resolver** - cleaner and more composable:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@ethereum-attestation-service/eas-contracts/contracts/resolver/SchemaResolver.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract EiffelTowerResolver is SchemaResolver, ERC721 {
    address public astralSigner = 0x...;
    bytes32 public eiffelTowerUID = 0x...;  // From step 2
    uint256 public nextTokenId = 1;

    mapping(address => bool) public hasMinted;

    constructor(IEAS eas)
        SchemaResolver(eas)
        ERC721("Eiffel Tower Visitor", "EIFFEL")
    {}

    function onAttest(
        Attestation calldata attestation,
        uint256 /*value*/
    ) internal override returns (bool) {
        // 1. Verify from Astral
        require(attestation.attester == astralSigner, "Not from Astral");

        // 2. Decode the policy result
        (bool isNearby, uint256 distance, bytes32 checkedLocation) =
            abi.decode(attestation.data, (bool, uint256, bytes32));

        // 3. Verify they checked the right location
        require(checkedLocation == eiffelTowerUID, "Wrong location");

        // 4. Check proximity
        require(isNearby, "Not close enough");
        require(distance <= 500, "Must be within 500m");

        // 5. Ensure user hasn't already minted
        require(!hasMinted[attestation.recipient], "Already minted");

        // 6. Mint NFT atomically
        hasMinted[attestation.recipient] = true;
        _mint(attestation.recipient, nextTokenId++);

        return true;  // Allow attestation
    }

    function onRevoke(Attestation calldata, uint256)
        internal pure override returns (bool) {
        return false;  // Don't allow revocation
    }
}
```

**Deploy and register schema:**
```typescript
// Deploy resolver
const Resolver = await ethers.getContractFactory("EiffelTowerResolver");
const resolver = await Resolver.deploy(EAS_ADDRESS);

// Register schema with EAS
const schemaRegistry = new SchemaRegistry(SCHEMA_REGISTRY_ADDRESS);
const schema = "bool isNearby,uint256 distance,bytes32 locationUID";
const tx = await schemaRegistry.register(schema, resolver.address, true);
const receipt = await tx.wait();

const schemaUID = receipt.events[0].args.uid;
console.log('Schema UID:', schemaUID);
```

**Call from frontend:**
```typescript
// Create location proof WITH automatic onchain submission
const result = await sdk.compute.within(
  userLocationAttestation.uid,
  eiffelTower.uid,
  500,
  {
    submitOnchain: true,          // SDK submits to EAS
    schema: schemaUID,             // Your schema (has resolver)
    recipient: wallet.address      // Who gets the NFT
  }
);

// EAS calls your resolver → resolver mints NFT → attestation created
// User now has NFT + permanent attestation proving they visited!

console.log('NFT minted via resolver! 🎉');
console.log('Attestation UID:', result.uid);
```

**Why this is better:**
- Attestation creation = NFT minting (atomic)
- Permanent record: "User X visited Eiffel Tower at time Y"
- Composable: Other contracts can query EAS for visit history
- Cleaner: No manual signature verification

---

## Step 7: Query Visit History

Now that visits are attestations, you can query them:

```typescript
// Find everyone who visited the Eiffel Tower
const visits = await sdk.location.query({
  schema: schemaUID,
  refUID: eiffelTower.uid  // Attestations referencing Eiffel Tower
});

console.log(`${visits.length} people have visited!`);

visits.forEach(visit => {
  console.log(`${visit.recipient} visited at ${new Date(visit.time * 1000)}`);
});
```

---

## The Full Flow

```typescript
import { AstralSDK } from '@astral-protocol/sdk';
import * as turf from '@turf/turf';

// 1. Initialize
const sdk = new AstralSDK({ signer: wallet });

// 2. Create canonical location (one time)
const landmark = await sdk.location.create(landmarkGeoJSON, {
  submitOnchain: true
});

// 3. User opens app - show instant feedback
const distance = turf.distance(userLocation, landmarkLocation);
console.log(`${distance}km away`);

// 4. User claims NFT - create verifiable proof
const userAttestation = await sdk.location.create(userLocation);
const proof = await sdk.compute.within(
  userAttestation.uid,
  landmark.uid,
  500,
  {
    submitOnchain: true,
    schema: RESOLVER_SCHEMA,
    recipient: userAddress
  }
);

// 5. Done! Resolver mints NFT automatically
console.log('NFT minted!', proof.uid);
```

---

## Key Takeaways

**Turf.js (local) vs Astral (verifiable):**
- Use **Turf** for UX: instant feedback, real-time updates, free
- Use **Astral** for verification: signed proofs, onchain integration, trustless

**Location Attestations:**
- Create once, reference by UID
- Signed proof: "this location exists/occurred"
- Permanent and composable

**Policy Attestations:**
- Signed result of computation
- Verifiable by smart contracts
- Can trigger actions via EAS resolvers

**EAS Resolvers:**
- Attestation creation = business logic execution
- Atomic operations
- Permanent records

---

## Next Steps

**Try these variations:**
- Change the radius (100m, 1km, etc.)
- Add multiple landmarks (collect them all!)
- Time-bound minting (only during certain hours)
- Require visiting multiple locations
- Add location proofs (verify GPS authenticity)

**Explore more patterns:**
- [What You Can Build](./WHAT-YOU-CAN-BUILD.md) - More use cases
- [Technical Design](./TECHNICAL-DESIGN.md) - Architecture deep dive
- [API Reference](./docs/api-reference.md) - All available operations

**Build something awesome!** Location-based smart contracts are a new primitive. What will you create?
