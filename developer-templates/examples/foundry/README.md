# Foundry: Resolver Deployment and Tests

Deploy Astral contract templates and run tests with [Foundry](https://getfoundry.sh).

## Setup

```bash
# From repo root or developer-templates/examples/foundry
cd developer-templates/examples/foundry
forge install   # if lib/ is missing
forge build
```

## Test

```bash
forge test
```

## Deploy (live network)

Set env vars and run:

```bash
export PRIVATE_KEY=0x...
export ASTRAL_SIGNER=0x...   # Astral's trusted attester address
forge script script/Deploy.s.sol --rpc-url $RPC_URL --broadcast
```

For a local chain (e.g. Anvil):

```bash
anvil &
forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
```

After deployment, use the printed schema UIDs when calling `astral.compute.within()` or `contains()` so attestations are issued for the correct resolver.
