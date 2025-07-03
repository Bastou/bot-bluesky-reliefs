import { Config } from "../config/config.ts";
import { Coordinate, generateRandomCoordinate, getCoordinateArea, generateCoordinateGrid } from "../utils/coordinates.ts";
import { checkCoordinateIsWater, WaterDetectionResult } from "../utils/water-detection.ts";
import { generateReliefFromCoordinate } from "./relief-generator.ts"; 

import { fetchElevation } from "../api/elevation.ts";

export interface GenerationResult {
  filePath: string;
  centerCoordinate: Coordinate;
  boundingBox: {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
  };
  elevationStats: {
    min: number;
    max: number;
    avg: number;
  };
  style: string;
  timestamp: string;
  terrainType: string;
}

/**
 * Generate a relief image from a random location
 */
export async function generateRandomRelief(
  config: Config,
  style?: string
): Promise<GenerationResult> {
  try {
    console.log("Generating random relief...");
    
    // 1. Generate a random coordinate
    const centerCoord = generateRandomCoordinate(config);
    console.log(`Selected center coordinates: ${centerCoord.latitude}, ${centerCoord.longitude}`);
    
    // 2. Area validation (water + elevation checks)
    console.log("Validating area suitability...");
    const areaValidation = await validateAreaForRelief(centerCoord, config);
    
    if (!areaValidation.isValid) {
      console.log(`Location rejected: ${areaValidation.reason}. Trying again...`);
      return generateRandomRelief(config, style);
    }
    
    console.log(`Area validation passed: ${areaValidation.summary}`);
    
    // 3. Generate relief (skip individual water check since we already validated the area)
    try {
      return await generateReliefFromCoordinate(centerCoord, config, style, undefined, true); // skipWaterCheck = true
    } catch (error) {
      // If the error is about water detection, try again with a different location
      if (error instanceof Error && error.message.includes("mostly water")) {
        console.log("Generated area is mostly water. Trying again with a different location...");
        return generateRandomRelief(config, style);
      }
      throw error;
    }
  } catch (error) {
    console.error("Error generating random relief:", error);
    throw error;
  }
}

/**
 * Area validation,water detection and elevation range checking
 */
async function validateAreaForRelief(
  centerCoord: Coordinate,
  config: Config
): Promise<{ 
  isValid: boolean; 
  reason?: string; 
  summary?: string;
  waterPercentage?: number;
  elevationRange?: number;
}> {
  const sampleArea = getCoordinateArea(centerCoord, config.geographic.areaSize * 0.5);
  const sampleGrid = generateCoordinateGrid(sampleArea, 4); // Single 4x4 grid for both checks
  
  const results = await Promise.all(
    sampleGrid.map(async (coord: Coordinate) => {
      const [waterResult, elevationResponse] = await Promise.all([
        checkCoordinateIsWater(coord.latitude, coord.longitude, config),
        fetchElevation(coord.latitude, coord.longitude, config)
      ]);
      
      return {
        coordinate: coord,
        waterResult,
        elevationData: elevationResponse.status === "success" ? elevationResponse.data[0] : null
      };
    })
  );
  
  // Analyze water coverage
  const waterResults = results.map((r) => r.waterResult);
  const waterPointCount = waterResults.filter((result: WaterDetectionResult) => result.isWater).length;
  const waterPercentage = (waterPointCount / waterResults.length) * 100;
  
  // Check center point specifically (more strict for center)
  const centerWaterResult = await checkCoordinateIsWater(centerCoord.latitude, centerCoord.longitude, config);
  if (centerWaterResult.isWater) {
    return {
      isValid: false,
      reason: `Center coordinate is on water (method: ${centerWaterResult.method}, confidence: ${(centerWaterResult.confidence * 100).toFixed(1)}%)`
    };
  }
  
  // Reject if area is mostly water (stricter threshold)
  if (waterPercentage > 85) { 
    return {
      isValid: false,
      reason: `Area is mostly water (${waterPercentage.toFixed(1)}% water coverage)`,
      waterPercentage
    };
  }
  
  // Analyze elevation range
  const validElevations = results
    .map((r) => r.elevationData?.elevation)
    .filter((e): e is number => e !== null && e !== undefined);
  
  if (validElevations.length < 3) {
    return {
      isValid: false,
      reason: "Insufficient elevation data points"
    };
  }
  
  const minElevation = Math.min(...validElevations);
  const maxElevation = Math.max(...validElevations);
  const elevationRange = maxElevation - minElevation;
  
  if (elevationRange < config.geographic.minElevationRange) {
    return {
      isValid: false,
      reason: `Insufficient elevation range (${elevationRange}m, minimum required: ${config.geographic.minElevationRange}m)`,
      elevationRange
    };
  }
  
  return {
    isValid: true,
    summary: `${waterPercentage.toFixed(1)}% water, ${elevationRange}m elevation range`,
    waterPercentage,
    elevationRange
  };
}

export { generateReliefFromCoordinate } from "./relief-generator.ts";
