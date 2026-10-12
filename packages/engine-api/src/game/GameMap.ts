/** Owner value for tiles with no customers. */
export const WATER = -2;
/** Owner value for the untapped market. */
export const NEUTRAL = -1;

export interface GameMap {
  width: number;
  height: number;
  /** Customers per tile (0 for water). */
  demand: Float32Array;
  isWater: Uint8Array;
}
