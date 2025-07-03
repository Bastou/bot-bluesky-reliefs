import { Config } from "../config/config.ts";
import { Coordinate, isCoordinateOnLand } from "./coordinates.ts";

// Cache for water detection results
const waterCoordinatesCache = new Map<string, boolean>();
const MAX_WATER_CACHE_SIZE = 1000;

export interface WaterDetectionResult {
  isWater: boolean;
  method: string;
  confidence: number;
}

/**
 * Water detection
 */
export async function checkCoordinateIsWater(
  latitude: number,
  longitude: number,
  config: Config
): Promise<WaterDetectionResult> {
  // First check the cache
  const coordKey = `${latitude.toFixed(4)},${longitude.toFixed(4)}`;
  if (waterCoordinatesCache.has(coordKey)) {
    const cachedIsWater = waterCoordinatesCache.get(coordKey)!;
    return { 
      isWater: cachedIsWater, 
      method: 'cache', 
      confidence: 0.95 
    };
  }

  // 1. Quick land mass check 
  const coordinate: Coordinate = { latitude, longitude };
  if (!isCoordinateOnLand(coordinate)) {
    cacheWaterResult(coordKey, true);
    return { isWater: true, method: 'land-bounds', confidence: 0.9 };
  }

  // 2.  Mapbox Tilequery API 
  if (config.apis.elevation.provider.toLowerCase() === "mapbox") {
    try {
      const isWater = await checkCoordinateIsWaterWithTilequery(latitude, longitude, config);
      if (isWater !== null) {
        cacheWaterResult(coordKey, isWater);
        return { 
          isWater, 
          method: 'tilequery', 
          confidence: 0.95 
        };
      }
    } catch (error) {
      console.warn(`Tilequery water check failed: ${error}`);
    }
  }

  // Default to land if all checks pass or fail
  cacheWaterResult(coordKey, false);
  return { isWater: false, method: 'default-land', confidence: 0.7 };
}

/**
 * Check if coordinate is over water using Mapbox Tilequery API
 */
async function checkCoordinateIsWaterWithTilequery(
  latitude: number,
  longitude: number,
  config: Config
): Promise<boolean | null> {
  const { apiKey } = config.apis.elevation;
  
  if (!apiKey) {
    throw new Error("Mapbox API key is required");
  }

  const url = `https://api.mapbox.com/v4/mapbox.mapbox-streets-v8/tilequery/${longitude},${latitude}.json?radius=10&layers=water&access_token=${apiKey}`;
  
  const response = await fetch(url, {
    headers: {
      "Accept": "application/json",
    }
  });
  
  if (!response.ok) {
    if (response.status === 429) {
      throw new Error("Rate limit exceeded for Tilequery API");
    }
    throw new Error(`Tilequery API error: ${response.status}`);
  }
  
  const data = await response.json();

  return data.features && data.features.length > 0;
}

/**
 * Cache water detection result
 */
function cacheWaterResult(coordKey: string, isWater: boolean): void {
  if (waterCoordinatesCache.size >= MAX_WATER_CACHE_SIZE) {
    // Remove oldest entry
    const oldestKey = waterCoordinatesCache.keys().next().value;
    if (oldestKey) {
      waterCoordinatesCache.delete(oldestKey);
    }
  }
  waterCoordinatesCache.set(coordKey, isWater);
}