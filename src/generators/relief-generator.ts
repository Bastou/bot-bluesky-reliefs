import { Config } from "../config/config.ts";
import { Coordinate, getCoordinateArea, calculateBoundingBox, generateCoordinateGrid } from "../utils/coordinates.ts";
import { fetchElevation, ElevationData, getRequestStats, getTileCoordinates } from "../api/elevation.ts";
import { checkCoordinateIsWater } from "../utils/water-detection.ts";
import { generateRelief } from "./relief.ts";
import { saveCanvasToFile } from "./canvas.ts";
import { path, delay } from "../deps.ts";
import { RenderOptions } from "./renderers/types.ts";
import { GenerationResult } from "./index.ts";

/**
 * Generate a relief image from a specific coordinate
 */
export async function generateReliefFromCoordinate(
  centerCoord: Coordinate,
  config: Config,
  style?: string,
  customGridResolution?: number,
  skipWaterCheck = false
): Promise<GenerationResult> {
  try {
    console.log(`Generating relief for coordinates: ${centerCoord.latitude}, ${centerCoord.longitude}`);
    
    if (!skipWaterCheck) {
      // 1. Verify the coordinate is on land before proceeding with full grid
      const waterResult = await checkCoordinateIsWater(centerCoord.latitude, centerCoord.longitude, config);
      if (waterResult.isWater) {
        console.log(`Coordinate is on water (method: ${waterResult.method}, confidence: ${(waterResult.confidence * 100).toFixed(1)}%). Cannot generate relief.`);
        throw new Error("Cannot generate relief for water location. Please choose a land location.");
      }
    } else {
      console.log("Skipping water check (already validated)");
    }

    // 2. Generate area around the coordinate
    const area = getCoordinateArea(centerCoord, config.geographic.areaSize);
    console.log(`Generated area with size ${area.size}km`);
    
    // 3. Calculate the bounding box
    const bbox = calculateBoundingBox(area);
    console.log("Bounding box:", bbox);
    
    // 4. Generate grid of coordinates to sample
    // Allow custom resolution if provided
    const resolution = customGridResolution || config.geographic.resolution; 
    const grid = generateCoordinateGrid(area, resolution);
    console.log(`Generated grid with ${grid.length} points`);
    
    // 5. Fetch elevation data for all grid points
    console.log("Fetching elevation data...");
    const elevationData: ElevationData[] = [];
    
    // For Mapbox provider, sort coordinates by tile to maximize cache hits
    if (config.apis.elevation.provider.toLowerCase() === "mapbox") {
      // Pre-sort coordinates by tile to maximize cache efficiency
      const zoom = 14; // Same zoom level used in elevation.ts
      const sortedGrid = [...grid].sort((a, b) => {
        const tileA = getTileCoordinates(a.latitude, a.longitude, zoom);
        const tileB = getTileCoordinates(b.latitude, b.longitude, zoom);
        
        // First sort by tile Y, then by tile X
        if (tileA.y !== tileB.y) return tileA.y - tileB.y;
        return tileA.x - tileB.x;
      });
      
      console.log("Sorted coordinates by tile for optimal caching");
      
      // Replace grid with sorted grid
      grid.length = 0;
      grid.push(...sortedGrid);
    }
    
    // Process one coordinate at a time with strict delay between requests
    // This respects API rate limits
    for (let i = 0; i < grid.length; i++) {
      const coord = grid[i];
      let success = false;
      let attempts = 0;
      const maxAttempts = 2; // Only retry once to avoid hitting daily limits
      let wasFromCache = false;
      
      //console.log(`- Fetched point ${i+1}/${grid.length}: ${coord.latitude}, ${coord.longitude}`);
      
      while (!success && attempts < maxAttempts) {
        try {
          // Only apply delay for non-first attempts or non-cached previous requests
          if (attempts > 0) {
            console.log(`Retry attempt ${attempts}...`);
            // Wait longer on retry
            await delay(2000);
          } else if (i > 0 && !wasFromCache) {
            // Apply delay between coordinates if the previous request wasn't from cache
            if (config.apis.elevation.provider.toLowerCase() !== "mapbox") {
              await delay(1000);
            }
          }
          
          const response = await fetchElevation(coord.latitude, coord.longitude, config);
          wasFromCache = response.fromCache === true;
          
          if (response.status === "success" && response.data.length > 0) {
            elevationData.push(...response.data);
            success = true;
            // Only log non-cached requests or errors
            if (!wasFromCache) {
              //console.log(`- Point ${i + 1}: ${response.data[0].elevation}m`);
            }
          } else if (response.rateLimited) {
            // Rate limit hit, wait longer
            console.log(`Rate limit hit, waiting longer...`);
            await delay(5000); // 5 seconds on rate limit
            attempts++;
          } else if (response.isWater) {
            // It's water, don't retry
            console.log(`Location is on water, skipping`);
            success = true;
          } else {
            // Other error
            console.warn(` ✗ Error fetching elevation: ${response.error}`);
            success = true; // Don't retry non-rate-limit errors
          }
        } catch (err) {
          console.error(` ✗ Error in elevation fetch: ${err}`);
          attempts++;
          await delay(2000);
        }
      }
    }
    
    console.log(`Retrieved elevation data for ${elevationData.length} points`);
    
    // For Mapbox, show cache statistics
    if (config.apis.elevation.provider.toLowerCase() === "mapbox") {
      const stats = getRequestStats();
      console.log(`Mapbox cache status: ${stats.cachedTiles} tiles in cache`);
    }
    
    // Make sure we have enough data points
    if (elevationData.length < 3) {
      throw new Error("Not enough elevation data points collected. Try again later.");
    }
    
    const elevations = elevationData.map(d => d.elevation);
    
    const minElevation = Math.min(...elevations);
    const maxElevation = Math.max(...elevations);
    const avgElevation = elevations.reduce((sum, val) => sum + val, 0) / elevations.length;
    
    // 6. Generate relief image
    const selectedStyle = style || config.image.defaultStyle;
    
    // Validate the style, fallback to default if invalid
    const validStyle = (selectedStyle === "dotgrid" || selectedStyle === "graph" || selectedStyle === "perspective")
      ? selectedStyle 
      : "graph";
    
    console.log(`Generating ${validStyle} style relief visualization...`);
    
    const renderOptions: RenderOptions = {
      width: config.image.width,
      height: config.image.height,
      style: validStyle as "dotgrid" | "graph" | "perspective",
      scaleFactor: config.image.scaleFactor,
      backgroundColor: "#000000",
      padding: 25 * (config.image.scaleFactor || 1),
      invertY: true,
      contourLines: 15,
      contourWidth: 1.5,
      gridResolution: resolution,
    };
    
    const canvas = await generateRelief(elevationData, bbox, renderOptions);
    
    // 7. Save the image
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `relief_${selectedStyle}_${timestamp}.png`;
    const filePath = path.join(config.system.cacheDir, "images", fileName);
    
    await saveCanvasToFile(canvas, filePath);
    
    // 8. Return generation result
    return {
      filePath,
      centerCoordinate: centerCoord,
      boundingBox: bbox,
      elevationStats: {
        min: minElevation,
        max: maxElevation,
        avg: avgElevation,
      },
      style: selectedStyle,
      timestamp,
      terrainType: renderOptions.terrainType || "unknown",
    };
  } catch (error) {
    console.error("Error generating relief:", error);
    throw error;
  }
} 