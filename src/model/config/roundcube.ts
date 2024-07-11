/**
 * Defines roundcube configuration.
 */
export interface RoundcubeConfig {
  readonly domain: RoundcubeDomainConfig;
}

/**
 * Defines a roundcube domain configuration.
 */
export interface RoundcubeDomainConfig {
  readonly name: string;
  readonly zoneId: string;
  readonly project?: string;
}
