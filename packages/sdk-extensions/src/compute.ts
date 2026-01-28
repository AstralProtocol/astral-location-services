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
    this.apiUrl = config.apiUrl.replace(/\/$/, ''); // Remove trailing slash
    this.chainId = config.chainId;
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
    const response = await this.request('/compute/distance', {
      from,
      to,
      ...options,
    });
    return response as NumericComputeResult;
  }

  /**
   * Compute the area of a polygon geometry.
   * Returns area in square meters with a signed attestation.
   */
  async area(
    geometry: Input,
    options: ComputeOptions
  ): Promise<NumericComputeResult> {
    const response = await this.request('/compute/area', {
      geometry,
      ...options,
    });
    return response as NumericComputeResult;
  }

  /**
   * Compute the length of a line geometry.
   * Returns length in meters with a signed attestation.
   */
  async length(
    geometry: Input,
    options: ComputeOptions
  ): Promise<NumericComputeResult> {
    const response = await this.request('/compute/length', {
      geometry,
      ...options,
    });
    return response as NumericComputeResult;
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
    const response = await this.request('/compute/contains', {
      container,
      containee,
      ...options,
    });
    return response as BooleanComputeResult;
  }

  /**
   * Check if a point is within a given radius (meters) of a target geometry.
   * Returns a boolean result with a signed attestation.
   */
  async within(
    point: Input,
    target: Input,
    radius: number,
    options: ComputeOptions
  ): Promise<BooleanComputeResult> {
    const response = await this.request('/compute/within', {
      point,
      target,
      radius,
      ...options,
    });
    return response as BooleanComputeResult;
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
    const response = await this.request('/compute/intersects', {
      geometry1,
      geometry2,
      ...options,
    });
    return response as BooleanComputeResult;
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
        ...body,
        chainId: this.chainId,
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
 * Create an AstralCompute instance with default configuration.
 */
export function createAstralCompute(config: Partial<AstralComputeConfig> = {}): AstralCompute {
  const defaultConfig: AstralComputeConfig = {
    apiUrl: 'http://localhost:3000',
    chainId: 84532, // Base Sepolia
  };

  return new AstralCompute({
    ...defaultConfig,
    ...config,
  });
}
