import { ElevationPoint, RenderOptions, TerrainAnalysis, RenderParams } from "../types.ts";
import { TERRAIN_THRESHOLDS, DEFAULT_RENDER_PARAMS, TERRAIN_ADJUSTMENTS } from "../config.ts";

/**
 * Analyze terrain data to categorize it by type and characteristics
 */
export function analyzeTerrain(points: ElevationPoint[]): TerrainAnalysis {
  // Skip empty sets
  if (points.length === 0) {
    return {
      terrainType: "unknown",
      elevationRange: 0,
      averageElevation: 0,
      elevationVariability: 0
    };
  }

  // Extract elevation values for analysis
  const elevations = points.map(p => p.elevation);
  const minElev = Math.min(...elevations);
  const maxElev = Math.max(...elevations);
  const elevRange = maxElev - minElev;
  
  // Calculate mean and standard deviation
  let sum = 0;
  for (const val of elevations) {
    sum += val;
  }
  const mean = sum / elevations.length;
  
  let sumSquaredDiffs = 0;
  for (const val of elevations) {
    sumSquaredDiffs += Math.pow(val - mean, 2);
  }
  const stdDev = Math.sqrt(sumSquaredDiffs / elevations.length);
  
  // Classify terrain based on elevation range and variability
  let terrainType = "";
  
  // Determine if it's mountainous, hilly, rolling, or flat
  if (elevRange > TERRAIN_THRESHOLDS.hilly) {
    terrainType = "mountainous";
  } else if (elevRange > TERRAIN_THRESHOLDS.rolling) {
    terrainType = "hilly";
  } else if (elevRange > TERRAIN_THRESHOLDS.flat) {
    terrainType = "rolling";
  } else {
    terrainType = "flat";
  }
  
  // Add altitude classification as prefix
  if (mean < TERRAIN_THRESHOLDS.lowAltitude) {
    terrainType = "low-" + terrainType;
  } else if (mean > TERRAIN_THRESHOLDS.highAltitude) {
    terrainType = "high-" + terrainType;
  }
  
  return {
    terrainType,
    elevationRange: elevRange,
    averageElevation: mean,
    elevationVariability: stdDev
  };
}

/**
 * Get rendering parameters based on terrain type
 */
export function getTerrainRenderParams(
  terrain: TerrainAnalysis,
  options: RenderOptions
): RenderParams {
  // Copy default parameters
  const params = { ...DEFAULT_RENDER_PARAMS };
  
  // For perspective style, adapt parameters based on terrain type
  if (options.style === "perspective") {
    // Determine basic terrain type without altitude qualifier
    const baseType = terrain.terrainType.replace(/^(low|high)-/, "");
    
    let terrainParams;
    switch (baseType) {
      case "flat":
        terrainParams = TERRAIN_ADJUSTMENTS.flat;
        break;
      case "rolling":
        terrainParams = TERRAIN_ADJUSTMENTS.rolling;
        break;
      case "hilly":
        terrainParams = TERRAIN_ADJUSTMENTS.hilly;
        break;
      case "mountainous":
        terrainParams = TERRAIN_ADJUSTMENTS.mountainous;
        break;
      default:
        terrainParams = TERRAIN_ADJUSTMENTS.rolling; // Fallback to rolling terrain
    }
    
    // Apply terrain-specific parameters
    params.horizonPosition = terrainParams.horizonPosition;
    params.perspectiveExponent = terrainParams.perspectiveExponent;
    params.peakEmphasis = terrainParams.peakEmphasis;
    
    // Scale amplification based on elevation range
    const rangeNormalized = Math.min(1.0, terrain.elevationRange / 5000);
    
    const baseAmplification = 550 * terrainParams.amplificationFactor;
    
    params.amplification = baseAmplification * (0.5 + 0.5 * (1 - rangeNormalized));

    const baseLinesCount = params.numLines;
    params.numLines = Math.floor(baseLinesCount * terrainParams.lineMultiplier);
    

    // Apply altitude-based adjustments
    if (terrain.terrainType.includes("low-")) {
      params.amplification *= 0.7;
      params.horizonPosition *= 0.9;
      params.numLines = Math.min(55, params.numLines * 1.15);
    } else if (terrain.terrainType.includes("high-")) {
      params.perspectiveExponent *= 0.9;
      params.amplification *= 1.05;
    }
    
    // Apply variability-based adjustments
    if (terrain.elevationVariability > 300) {
      params.peakEmphasis *= 0.9;
    } else if (terrain.elevationVariability < 50) {
      params.peakEmphasis *= 1.1;
      params.numLines = Math.min(55, params.numLines * 1.1);
    }
    
    // Apply elevation range adjustments
    if (terrain.elevationRange < 100) {
      params.amplification = Math.min(params.amplification, 300);
      params.horizonPosition = Math.min(params.horizonPosition, 0.35);
    } else if (terrain.elevationRange > 3000) {
      params.amplification = Math.max(params.amplification, 600);
      params.horizonPosition = Math.max(params.horizonPosition, 0.65);
    }
    
    params.numLines = Math.round(params.numLines);
  }
  
  return params;
} 