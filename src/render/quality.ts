/** Render quality presets. Medium is the default: a Retina display at full pixel ratio with 4x MSAA and
 *  bloom is what made the first visual build stutter. */
export type Quality = 'low' | 'medium' | 'high';

export interface QualitySpec {
  /** Cap on devicePixelRatio. */
  pixelRatio: number;
  /** MSAA samples on the post-processing target (0 = none). */
  msaa: number;
  bloom: boolean;
  shadows: boolean;
  shadowMap: number;
  /** Pooled point lights following the newest shells. */
  shellLights: number;
}

export const QUALITY: Record<Quality, QualitySpec> = {
  low: { pixelRatio: 1, msaa: 0, bloom: false, shadows: false, shadowMap: 1024, shellLights: 0 },
  medium: { pixelRatio: 1.25, msaa: 2, bloom: true, shadows: true, shadowMap: 1024, shellLights: 4 },
  high: { pixelRatio: 2, msaa: 4, bloom: true, shadows: true, shadowMap: 2048, shellLights: 6 },
};
