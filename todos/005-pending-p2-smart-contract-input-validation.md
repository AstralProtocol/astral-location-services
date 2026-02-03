---
status: pending
priority: p2
issue_id: "005"
tags: [code-review, security, solidity, smart-contract]
dependencies: []
---

# Smart Contract Missing Input Validation

## Problem Statement

The `LocationGatedNFT.sol` resolver contract trusts attestation data without validating operation type or timestamp. Any boolean attestation can trigger NFT mint, and stale attestations with old timestamps could be used.

**Why it matters:** This is an example contract, but it demonstrates patterns that developers may copy. Missing validation could lead to unexpected minting behavior.

## Findings

### Source
- Security Sentinel Agent

### Evidence/Location

File: `examples/contracts/LocationGatedNFT.sol`

Lines 60-87:
```solidity
function onAttest(
    Attestation calldata attestation,
    uint256 /* value */
) internal override returns (bool) {
    if (attestation.attester != astralSigner) {
        revert NotAstralAttester();
    }

    (bool result, , , ) = abi.decode(
        attestation.data,
        (bool, bytes32[], uint64, string)
    );

    if (!result) {
        revert LocationCheckFailed();
    }
    // NO timestamp validation
    // NO operation type validation
    _mint(attestation.recipient, attestation.uid);
    return true;
}
```

### Impact

- Any boolean attestation (contains, within, intersects) can trigger NFT mint
- Stale attestations with old timestamps could be used
- No validation of expected schema
- Example code teaches bad patterns

## Proposed Solutions

### Option A: Add Timestamp and Operation Validation (Recommended)
```solidity
function onAttest(
    Attestation calldata attestation,
    uint256
) internal override returns (bool) {
    require(attestation.attester == astralSigner, "Not Astral");

    (bool result, bytes32[] memory inputRefs, uint256 timestamp, string memory operation) =
        abi.decode(attestation.data, (bool, bytes32[], uint256, string));

    // Validate timestamp freshness (within last hour)
    require(block.timestamp - timestamp < 3600, "Stale attestation");

    // Validate operation type
    require(
        keccak256(bytes(operation)) == keccak256("within"),
        "Wrong operation"
    );

    require(result, "Location check failed");
    _mint(attestation.recipient, attestation.uid);
    return true;
}
```

**Pros:** Complete validation, secure pattern
**Cons:** Gas cost for string comparison
**Effort:** Small
**Risk:** Low

### Option B: Track Used Attestation UIDs
Prevent replay by tracking which attestation UIDs have been used.

**Pros:** Prevents attestation reuse
**Cons:** Storage cost for mapping
**Effort:** Small
**Risk:** Low

## Recommended Action

Implement both Option A and Option B for comprehensive security.

## Technical Details

### Affected Files
- `examples/contracts/LocationGatedNFT.sol`

### Database Changes
None (contract storage only)

## Acceptance Criteria

- [ ] Timestamp is validated for freshness
- [ ] Operation type is validated
- [ ] Used attestation UIDs are tracked to prevent replay
- [ ] Document expected operation type in contract comments

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-27 | Identified in code review | Example contracts should demonstrate best practices |

## Resources

- SPEC.md Section 14: Security Considerations (Replay Attacks)
- [EAS Schema Resolver Patterns](https://docs.attest.sh/docs/core-concepts/resolver-contracts)
