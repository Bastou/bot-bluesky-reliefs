import { checkCoordinateIsLand } from "../api/elevation.ts";
import { Config } from "../config/config.ts";
import { Coordinate, generateRandomCoordinate } from "../utils/coordinates.ts";
import { generateReliefFromCoordinate } from "./relief-generator.ts"; 
import { checkWaterArea, checkElevationRange } from './relief.ts';

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
    
    // Verify the coordinate is on land before proceeding
    const isLand = await checkCoordinateIsLand(centerCoord.latitude, centerCoord.longitude, config);
    if (!isLand) {
      console.log("Generated coordinate is on water. Trying again with a different location...");
      return generateRandomRelief(config, style);
    }
    
    // Check for water area before proceeding with elevation range check
    const { isMostlyWater, waterPercentage } = await checkWaterArea(centerCoord, config);
    if (isMostlyWater) {
      console.log(`Location with coordinates ${centerCoord.latitude}, ${centerCoord.longitude} appears to be mostly water (${waterPercentage.toFixed(1)}% water). Trying again...`);
      return generateRandomRelief(config, style);
    }
    
    // Check elevation range before proceeding with full render
    const { hasSufficientRange, minElevation, maxElevation } = await checkElevationRange(centerCoord, config);
    if (!hasSufficientRange) {
      console.log(`Location has insufficient elevation range (${minElevation}m to ${maxElevation}m). Trying again...`);
      return generateRandomRelief(config, style);
    }
    
    try {
      return await generateReliefFromCoordinate(centerCoord, config, style);
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

export { generateReliefFromCoordinate } from "./relief-generator.ts";
