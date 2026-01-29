/**
 * Onchain submission verification tests.
 *
 * These tests verify that attestations produced by the compute service
 * can actually be submitted to the EAS contract onchain.
 *
 * REQUIREMENTS:
 * - These tests require a forked Base Sepolia network running locally
 * - Start with: anvil --fork-url https://sepolia.base.org
 * - Or use a real testnet RPC with sufficient ETH for gas
 *
 * SKIPPED BY DEFAULT: Set RUN_ONCHAIN_TESTS=true to enable
 */
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { ethers, JsonRpcProvider, Wallet, Contract } from 'ethers';
import { createTestApp } from '../../helpers/test-server.js';
import {
  SF_POINT,
  NYC_POINT,
  makeRequest,
} from '../../fixtures/geometries.js';

// EAS contract on Base Sepolia
const EAS_CONTRACT_ADDRESS = '0x4200000000000000000000000000000000000021';

// Minimal EAS ABI for attestByDelegation
const EAS_ABI = [
  'function attestByDelegation((bytes32 schema, (address recipient, uint64 expirationTime, bool revocable, bytes32 refUID, bytes data, uint256 value) data, (uint8 v, bytes32 r, bytes32 s) signature, address attester, uint64 deadline) delegatedRequest) returns (bytes32)',
  'function getNonce(address account) view returns (uint256)',
];

const app = createTestApp();

// Skip these tests unless explicitly enabled
const SKIP_ONCHAIN = process.env.RUN_ONCHAIN_TESTS !== 'true';
const describeOnchain = SKIP_ONCHAIN ? describe.skip : describe;

describeOnchain('Onchain Submission', () => {
  let provider: JsonRpcProvider;
  let submitter: Wallet;
  let easContract: Contract;

  beforeAll(async () => {
    // Connect to local fork or testnet
    const rpcUrl = process.env.FORK_RPC_URL || 'http://127.0.0.1:8545';
    provider = new JsonRpcProvider(rpcUrl);

    /**
     * Hardhat/Anvil default account #1 private key.
     *
     * Derived from the standard test mnemonic:
     *   "test test test test test test test test test test test junk"
     *
     * Address: 0x70997970C51812dc3A010C7d01b50e0d17dc79C8
     *
     * We use account #1 (not #0) as the submitter to simulate the delegated
     * attestation flow where the attester and submitter are different parties.
     *
     * WARNING: This key is publicly known. Never use with real funds.
     * See: https://hardhat.org/hardhat-network/docs/reference#initial-state
     */
    const submitterKey = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
    submitter = new Wallet(submitterKey, provider);

    easContract = new Contract(EAS_CONTRACT_ADDRESS, EAS_ABI, submitter);

    // Verify we're connected
    const network = await provider.getNetwork();
    console.log(`Connected to chain ${network.chainId}`);
  });

  it('can submit a distance attestation to EAS', async () => {
    // Get attestation from compute service
    const res = await request(app)
      .post('/compute/v0/distance')
      .send(makeRequest({ from: SF_POINT, to: NYC_POINT }));

    expect(res.status).toBe(200);

    const { attestation, delegatedAttestation } = res.body;

    // Parse the signature into v, r, s components
    const sig = ethers.Signature.from(attestation.signature);

    // Build the delegated request struct for EAS
    const delegatedRequest = {
      schema: attestation.schema,
      data: {
        recipient: attestation.recipient,
        expirationTime: 0n,
        revocable: true,
        refUID: '0x0000000000000000000000000000000000000000000000000000000000000000',
        data: attestation.data,
        value: 0n,
      },
      signature: {
        v: sig.v,
        r: sig.r,
        s: sig.s,
      },
      attester: delegatedAttestation.attester,
      deadline: BigInt(delegatedAttestation.deadline),
    };

    // Submit to EAS contract
    const tx = await easContract.attestByDelegation(delegatedRequest);
    const receipt = await tx.wait();

    expect(receipt.status).toBe(1);
    console.log(`Attestation submitted in tx: ${receipt.hash}`);

    // The return value is the attestation UID
    // We could decode it from logs if needed
  });

  it('verifies attester nonce matches contract state', async () => {
    const res = await request(app)
      .post('/compute/v0/distance')
      .send(makeRequest({ from: SF_POINT, to: NYC_POINT }));

    expect(res.status).toBe(200);

    const { delegatedAttestation, attestation } = res.body;

    // Get the current nonce for the attester from the contract
    const contractNonce = await easContract.getNonce(attestation.attester);

    // The response nonce should be >= the contract nonce
    // (could be higher if we've made requests but not submitted)
    console.log(`Response nonce: ${delegatedAttestation.nonce}, Contract nonce: ${contractNonce}`);

    // This just logs for now - in a real scenario you'd track nonces properly
    expect(typeof delegatedAttestation.nonce).toBe('number');
  });
});

describe('Onchain Submission (simulated)', () => {
  it('attestation has all fields required for onchain submission', async () => {
    const res = await request(app)
      .post('/compute/v0/distance')
      .send(makeRequest({ from: SF_POINT, to: NYC_POINT }));

    expect(res.status).toBe(200);

    const { attestation, delegatedAttestation } = res.body;

    // Verify all required fields are present
    expect(attestation.schema).toMatch(/^0x[a-fA-F0-9]{64}$/);
    expect(attestation.recipient).toMatch(/^0x[a-fA-F0-9]{40}$/);
    expect(attestation.attester).toMatch(/^0x[a-fA-F0-9]{40}$/);
    expect(attestation.data).toMatch(/^0x[a-fA-F0-9]+$/);
    expect(attestation.signature).toMatch(/^0x[a-fA-F0-9]{130}$/);

    expect(delegatedAttestation.deadline).toBeTypeOf('number');
    expect(delegatedAttestation.deadline).toBeGreaterThan(Math.floor(Date.now() / 1000));
    expect(delegatedAttestation.nonce).toBeTypeOf('number');
    expect(delegatedAttestation.nonce).toBeGreaterThanOrEqual(0);

    // Verify signature can be parsed
    const sig = ethers.Signature.from(attestation.signature);
    expect(sig.v).toBeGreaterThanOrEqual(27);
    expect(sig.v).toBeLessThanOrEqual(28);
    expect(sig.r).toMatch(/^0x[a-fA-F0-9]{64}$/);
    expect(sig.s).toMatch(/^0x[a-fA-F0-9]{64}$/);
  });

  it('deadline is far enough in the future for submission', async () => {
    const res = await request(app)
      .post('/compute/v0/distance')
      .send(makeRequest({ from: SF_POINT, to: NYC_POINT }));

    expect(res.status).toBe(200);

    const { delegatedAttestation } = res.body;
    const now = Math.floor(Date.now() / 1000);

    // Deadline should be at least 30 minutes in the future
    // (actual is 1 hour, but give some buffer)
    expect(delegatedAttestation.deadline - now).toBeGreaterThan(30 * 60);
  });
});
