import type {
  Input,
  ComputeOptions,
  NumericComputeResult,
  BooleanComputeResult,
  AstralComputeConfig,
} from './types.js';

/**
 * Astral Compute SDK
 *
 * Provides methods for verifiable geospatial computations via the Astral Location Services API.
 * Each method returns a signed delegated attestation that can be submitted to EAS.
 */
export class AstralCompute {
  private readonly apiUrl: string;
  private readonly chainId: number;

  constructor(config: AstralComputeConfig) {
    this.apiUrl = config.apiUrl?.replace(/\/$/, '') ?? 'https://api.astral.global';
    this.chainId = config.chainId;
  }

  /**
   * Normalize input to a format the API accepts.
   * - Direct UID strings become { uid: string }
   * - GeoJSON Features have their geometry extracted (runtime check for flexibility)
   * - Everything else passes through
   */
  private normalizeInput(input: Input): object {
    // Direct UID string
    if (typeof input === 'string') {
      return { uid: input };
    }
    // GeoJSON Feature - extract geometry
    // This handles runtime cases where users pass Feature objects
    if (typeof input === 'object' && 'type' in input && (input as { type: string }).type === 'Feature' && 'geometry' in input) {
      return (input as { geometry: object }).geometry;
    }
    // Pass through as-is (Geometry, OnchainInput, OffchainInput)
    return input as object;
  }

  /**
   * Compute the distance between two geometries.
   * Returns distance in meters with a signed attestation.
   */
  async distance(
    from: Input,
    to: Input,
    options: ComputeOptions
  ): Promise<NumericComputeResult> {
    return this.request('/compute/v0/distance', {
      from: this.normalizeInput(from),
      to: this.normalizeInput(to),
      schema: options.schema,
      recipient: options.recipient,
    }) as Promise<NumericComputeResult>;
  }

  /**
   * Compute the area of a polygon geometry.
   * Returns area in square meters with a signed attestation.
   */
  async area(
    geometry: Input,
    options: ComputeOptions
  ): Promise<NumericComputeResult> {
    return this.request('/compute/v0/area', {
      geometry: this.normalizeInput(geometry),
      schema: options.schema,
      recipient: options.recipient,
    }) as Promise<NumericComputeResult>;
  }

  /**
   * Compute the length of a line geometry.
   * Returns length in meters with a signed attestation.
   */
  async length(
    geometry: Input,
    options: ComputeOptions
  ): Promise<NumericComputeResult> {
    return this.request('/compute/v0/length', {
      geometry: this.normalizeInput(geometry),
      schema: options.schema,
      recipient: options.recipient,
    }) as Promise<NumericComputeResult>;
  }

  /**
   * Check if container geometry contains the containee geometry.
   * Returns a boolean result with a signed attestation.
   */
  async contains(
    container: Input,
    containee: Input,
    options: ComputeOptions
  ): Promise<BooleanComputeResult> {
    return this.request('/compute/v0/contains', {
      container: this.normalizeInput(container),
      containee: this.normalizeInput(containee),
      schema: options.schema,
      recipient: options.recipient,
    }) as Promise<BooleanComputeResult>;
  }

  /**
   * Check if a geometry is within a given radius (meters) of a target geometry.
   * Returns a boolean result with a signed attestation.
   */
  async within(
    geometry: Input,
    target: Input,
    radius: number,
    options: ComputeOptions
  ): Promise<BooleanComputeResult> {
    return this.request('/compute/v0/within', {
      geometry: this.normalizeInput(geometry),
      target: this.normalizeInput(target),
      radius,
      schema: options.schema,
      recipient: options.recipient,
    }) as Promise<BooleanComputeResult>;
  }

  /**
   * Check if two geometries intersect.
   * Returns a boolean result with a signed attestation.
   */
  async intersects(
    geometry1: Input,
    geometry2: Input,
    options: ComputeOptions
  ): Promise<BooleanComputeResult> {
    return this.request('/compute/v0/intersects', {
      geometry1: this.normalizeInput(geometry1),
      geometry2: this.normalizeInput(geometry2),
      schema: options.schema,
      recipient: options.recipient,
    }) as Promise<BooleanComputeResult>;
  }

  /**
   * Check the health and availability of the Astral service.
   * Returns status and database connection info.
   */
  async health(): Promise<{ status: string; database: string }> {
    const response = await fetch(`${this.apiUrl}/health`);
    if (!response.ok) {
      throw new Error(`Health check failed: ${response.statusText}`);
    }
    return response.json() as Promise<{ status: string; database: string }>;
  }

  /**
   * Make a request to the compute service.
   */
  private async request(endpoint: string, body: object): Promise<unknown> {
    const response = await fetch(`${this.apiUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chainId: this.chainId,
        ...body,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ detail: response.statusText })) as { detail?: string };
      throw new Error(`Astral API error: ${errorBody.detail || response.statusText}`);
    }

    return response.json();
  }
}

/**
 * Create an AstralCompute instance.
 */
export function createAstralCompute(config: AstralComputeConfig): AstralCompute {
  return new AstralCompute(config);
}
