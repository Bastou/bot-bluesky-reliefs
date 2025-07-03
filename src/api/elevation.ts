import { Config } from "../config/config.ts";
import { delay } from "../deps.ts";
import { decode } from "https://deno.land/x/pngs@0.1.1/mod.ts";

export interface ElevationData {
  latitude: number;
  longitude: number;
  elevation: number;
}

export interface ElevationResponse {
  status: string;
  data: ElevationData[];
  error?: string;
  rateLimited?: boolean;
  isWater?: boolean;
  fromCache?: boolean;
}

let lastRequestTime = 0;
let dailyRequestCount = 0;
const MAX_DAILY_REQUESTS = 1000; // OpenTopoData limit: 1000 calls per day


interface CachedTile {
  tileData: Uint8Array;
  width: number;
  height: number;
  timestamp: number;
}

const tileCache = new Map<string, CachedTile>();
const MAX_CACHE_SIZE = 1000; // Maximum number of tiles to cache

type ElevationConfig = Config & { cachingEnabled?: boolean };

/**
 * Fetches elevation data for a given coordinate
 */
export async function fetchElevation(
  latitude: number,
  longitude: number,
  config: Config
): Promise<ElevationResponse> {
  const effectiveConfig = config as ElevationConfig;
  
  // Check for cached data first before anything else
  const tileKey = getTileKey(latitude, longitude);
  if (tileCache.has(tileKey)) {
    //console.log(`Using cached tile for: ${latitude}, ${longitude} (tile: ${tileKey})`);
    try {
      // Get the cached tile
      const cachedTile = tileCache.get(tileKey);
      if (!cachedTile) throw new Error("Cached tile not found");
      
      // Split the tileKey to get coordinates
      const [zoom, x, y] = tileKey.split('-').map(Number);
      
      // Extract elevation using the full parameter set
      const elevation = extractElevationFromTile(
        cachedTile.tileData,
        cachedTile.width,
        cachedTile.height,
        latitude,
        longitude,
        x,
        y,
        zoom
      );
      
      // Return properly formatted data
      return {
        status: "success",
        data: [{
          latitude,
          longitude,
          elevation: Math.round(elevation)
        }],
        fromCache: true
      };
    } catch (error) {
      console.warn(`Failed to use cached elevation data: ${error instanceof Error ? error.message : String(error)}`);
      // Continue to fetch from API
    }
  }

  // Fetch from configured provider
  let response: ElevationResponse;
  const provider = config.apis.elevation.provider.toLowerCase();

  try {
    switch (provider) {
      case "opentopodata":
        response = await fetchFromOpenTopoData(latitude, longitude, effectiveConfig);
        break;
      case "mapbox":
        response = await fetchFromMapbox(latitude, longitude, effectiveConfig);
        break;
      default:
        response = {
          status: "error",
          data: [],
          error: `Unknown elevation provider: ${provider}`
        };
    }

    // Cache successful results
    if (
      response.status === "success" &&
      response.data.length > 0 &&
      !response.fromCache
    ) {
      // Store the data in the cache
      if (provider === "mapbox" && response.data[0]) {
        // We already cache the tile in the Mapbox handler
      } else if (response.data[0]) {
        // Simple caching for other providers
        cacheTileData(tileKey, response.data[0]);
      }
    }

    return response;
  } catch (error) {
    return {
      status: "error",
      error: error instanceof Error ? error.message : String(error),
      data: [],
      fromCache: false
    };
  }
}

/**
 * Extract elevation from tile data (either freshly decoded or from cache)
 */
function extractElevationFromTile(
  imageData: Uint8Array, 
  width: number, 
  height: number, 
  latitude: number, 
  longitude: number, 
  tileX: number, 
  tileY: number, 
  zoom: number
): number {
  // Calculate exact position in the tile
  const position = getPositionInTile(latitude, longitude, zoom, tileX, tileY);
  
  // Ensure position is within bounds
  const x = Math.min(Math.max(position.x, 0), width - 1);
  const y = Math.min(Math.max(position.y, 0), height - 1);
  
  // Create grid around the target point for more accurate sampling
  const elevations: number[] = [];
  const radius = 1;
  
  for (let yOffset = -radius; yOffset <= radius; yOffset++) {
    for (let xOffset = -radius; xOffset <= radius; xOffset++) {
      const sampleX = x + xOffset;
      const sampleY = y + yOffset;
      
      if (sampleX < 0 || sampleX >= width || sampleY < 0 || sampleY >= height) {
        continue;
      }
      
      const idx = (sampleY * width + sampleX) * 4;
      const r = imageData[idx];
      const g = imageData[idx + 1];
      const b = imageData[idx + 2];
      
      // Formula from Mapbox documentation
      // -10000 + ((R * 256 * 256 + G * 256 + B) * 0.1)
      const elevation = -10000 + ((r * 256 * 256 + g * 256 + b) * 0.1);
      
      if (!isNaN(elevation) && isFinite(elevation)) {
        elevations.push(elevation);
      }
    }
  }
  
  if (elevations.length === 0) {
    throw new Error("No valid elevation values found in the tile");
  }
  
  // Return the average elevation
  return elevations.reduce((sum, e) => sum + e, 0) / elevations.length;
}

/**
 * Calculate the exact position within a tile for lat/lon coordinates
 */
function getPositionInTile(lat: number, lon: number, zoom: number, tileX: number, tileY: number, tileSize: number = 512): { x: number; y: number } {
  const n = Math.pow(2, zoom);
  
  // Get tile coordinates (floating point)
  const xTile = (lon + 180) / 360 * n;
  const yTile = (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n;
  
  // Get the position within the tile
  const xPixel = Math.floor((xTile - tileX) * tileSize);
  const yPixel = Math.floor((yTile - tileY) * tileSize);
  
  return { x: xPixel, y: yPixel };
}

/**
 * Normalizes the response from different elevation API providers
 */
function normalizeElevationResponse(
  data: unknown,
  provider: string
): ElevationResponse {
  try {
    switch (provider.toLowerCase()) {
      case "opentopodata": {
        const topoData = data as { results?: Array<{ location: { lat: number; lng: number }; elevation: number }> };
        if (!topoData.results || !Array.isArray(topoData.results)) {
          throw new Error("Invalid OpenTopoData response format");
        }
        return {
          status: "success",
          data: topoData.results.map(result => ({
            latitude: result.location.lat,
            longitude: result.location.lng,
            elevation: result.elevation,
          })),
        };
      }
      default:
        throw new Error(`Unsupported elevation provider: ${provider}`);
    }
  } catch (error: unknown) {
    console.error(`Error normalizing elevation data: ${error instanceof Error ? error.message : String(error)}`);
    return {
      status: "error",
      data: [],
      error: `Failed to normalize elevation response: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Convert latitude and longitude to tile coordinates at a specific zoom level
 * @param lat Latitude in degrees
 * @param lon Longitude in degrees
 * @param zoom Zoom level
 * @returns Object containing x and y tile coordinates
 */
export function getTileCoordinates(lat: number, lon: number, zoom: number): { x: number; y: number } {
  // Convert to radians
  const latRad = lat * Math.PI / 180;
  
  // Calculate tile coordinates
  const n = Math.pow(2, zoom);
  const x = Math.floor((lon + 180) / 360 * n);
  const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
  
  return { x, y };
}
/**
 * Returns the current request statistics
 */
export function getRequestStats(): {dailyCount: number, remaining: number, cachedTiles: number} {
  return {
    dailyCount: dailyRequestCount,
    remaining: MAX_DAILY_REQUESTS - dailyRequestCount,
    cachedTiles: tileCache.size
  };
}

/**
 * Clears the tile cache 
 */
export function clearTileCache(): void {
  const cacheSize = tileCache.size;
  tileCache.clear();
  console.log(`Cleared elevation tile cache (${cacheSize} tiles removed)`);
}

/**
 * Test function to verify the elevation API is working
 */
export async function testElevationAPI(config: Config): Promise<void> {
  console.log(`Testing elevation API (${config.apis.elevation.provider})...`);
  
  // Test coordinates (Mount Everest)
  const latitude = 27.9881;
  const longitude = 86.9250;
  
  const result = await fetchElevation(latitude, longitude, config); // Keep water checking for testing
  
  if (result.status === "success" && result.data.length > 0) {
    console.log("Elevation API test successful!");
    console.log(`Elevation at ${latitude}, ${longitude}: ${result.data[0].elevation}m`);
    
    if (config.apis.elevation.provider.toLowerCase() === "opentopodata") {
      const stats = getRequestStats();
      console.log(`OpenTopoData requests today: ${stats.dailyCount}/1000 (${stats.remaining} remaining)`);
    }
    
    if (config.apis.elevation.provider.toLowerCase() === "mapbox") {
      const stats = getRequestStats();
      console.log(`Mapbox cached tiles: ${stats.cachedTiles}`);
    }
  } else {
    console.error("Elevation API test failed:", result.error);
    
    if (result.rateLimited) {
      console.error("The API is rate limiting requests");
    }
  }
}


/**
 * Gets a unique key for a tile containing a specific coordinate
 */
function getTileKey(latitude: number, longitude: number): string {
  const zoom = 14; // Use standard zoom level
  const coords = getTileCoordinates(latitude, longitude, zoom);
  return `${zoom}-${coords.x}-${coords.y}`;
}

/**
 * Cache tile data for a coordinate
 */
function cacheTileData(tileKey: string, elevationData: ElevationData): void {
  // This is a simplified implementation that just caches the elevation value
  // In a real implementation, we would store the actual tile data
  if (tileCache.size >= MAX_CACHE_SIZE) {
    // Remove oldest tile (first entry)
    const oldestKey = tileCache.keys().next().value;
    if (oldestKey) {
      tileCache.delete(oldestKey);
    }
  }
  
  // Just cache a placeholder for now
  tileCache.set(tileKey, {
    tileData: new Uint8Array(0),
    width: 1,
    height: 1,
    timestamp: Date.now()
  });
}

/**
 * Fetch elevation data from OpenTopoData
 */
async function fetchFromOpenTopoData(
  latitude: number,
  longitude: number,
  config: ElevationConfig
): Promise<ElevationResponse> {
  // Check daily limit
  if (dailyRequestCount >= MAX_DAILY_REQUESTS) {
    console.error("Daily OpenTopoData request limit exceeded (1000 calls per day)");
    return {
      status: "error",
      data: [],
      error: "Daily request limit exceeded (1000 calls per day)",
      rateLimited: true
    };
  }
  
  try {
    // Apply rate limiting
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;
    
    if (timeSinceLastRequest < 1000 && lastRequestTime > 0) {
      const waitTime = 1000 - timeSinceLastRequest;
      console.log(`Rate limit protection: Waiting ${waitTime}ms before making request`);
      await delay(waitTime);
    }
    
    // Update request tracking
    lastRequestTime = Date.now();
    dailyRequestCount++;
    
    const url = `${config.apis.elevation.baseUrl}aster30m?locations=${latitude},${longitude}`;
    
    // Make the request
    const response = await fetch(url, {
      headers: {
        "Accept": "application/json"
      },
    });
    
    // Check for rate limiting
    if (response.status === 429) {
      const retryAfter = response.headers.get("Retry-After");
      const waitTime = retryAfter ? parseInt(retryAfter, 10) * 1000 : 5000;
      
      console.warn(`API rate limit exceeded`);
      console.warn(`Suggested wait: ${waitTime/1000} seconds`);
      
      return {
        status: "error",
        data: [],
        error: `Rate limit exceeded`,
        rateLimited: true
      };
    }
    
    if (!response.ok) {
      throw new Error(`API returned ${response.status}: ${response.statusText}`);
    }
    
    // Parse response
    const data = await response.json();
    return normalizeElevationResponse(data, "opentopodata");
  } catch (error: unknown) {
    return {
      status: "error",
      data: [],
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Fetch elevation data from Mapbox
 */
async function fetchFromMapbox(
  latitude: number,
  longitude: number,
  config: ElevationConfig
): Promise<ElevationResponse> {
  try {
    // Skip rate limiting for Mapbox - it can handle the load
    // Just update the request tracking
    lastRequestTime = Date.now();
    
    const apiKey = config.apis.elevation.apiKey;
    if (!apiKey) {
      throw new Error("Mapbox API key is required");
    }
    
    const zoom = 14; // Max zoom level for 512 tiles
    const tileCoords = getTileCoordinates(latitude, longitude, zoom);
    const url = `${config.apis.elevation.baseUrl}v4/mapbox.mapbox-terrain-dem-v1/${zoom}/${tileCoords.x}/${tileCoords.y}@2x.pngraw?access_token=${apiKey}`;
    
    // Make the request
    const response = await fetch(url, {
      headers: {
        "Accept": "image/png"
      }
    });
    
    if (!response.ok) {
      throw new Error(`API returned ${response.status}: ${response.statusText}`);
    }
    
    // Decode the PNG data
    const imageData = await response.arrayBuffer();
    const png = decode(new Uint8Array(imageData));
    
    if (!png || !png.image || png.image.length === 0) {
      throw new Error("Invalid PNG data received from Mapbox");
    }
    
    // Cache the tile data
    const tileKey = `${zoom}-${tileCoords.x}-${tileCoords.y}`;
    
    // Manage cache size if needed
    if (tileCache.size >= MAX_CACHE_SIZE) {
      // Remove oldest tile (first entry)
      const oldestKey = tileCache.keys().next().value;
      if (oldestKey) {
        console.log(`Removing oldest tile from cache: ${oldestKey}`);
        tileCache.delete(oldestKey);
      }
    }
    
    // Add to cache
    tileCache.set(tileKey, {
      tileData: png.image,
      width: png.width,
      height: png.height,
      timestamp: Date.now()
    });
    
    // Extract elevation
    const elevation = extractElevationFromTile(
      png.image, 
      png.width, 
      png.height, 
      latitude, 
      longitude, 
      tileCoords.x, 
      tileCoords.y, 
      zoom
    );
    
    return {
      status: "success",
      data: [{
        latitude,
        longitude,
        elevation: Math.round(elevation)
      }],
      fromCache: false
    };
  } catch (error: unknown) {
    return {
      status: "error",
      data: [],
      error: error instanceof Error ? error.message : String(error)
    };
  }
}