import { ElevationData, fetchElevation } from "../api/elevation.ts";
import { Config } from "../config/config.ts";
import { canvas } from "../deps.ts";
import { Coordinate, getCoordinateArea, generateCoordinateGrid } from "../utils/coordinates.ts";
import { createCanvas } from "./canvas.ts";
import { createCoordinateTransformer } from "./coordinates.ts";
import { DotGridRenderer } from "./renderers/dotgrid.ts";
import { GraphRenderer } from "./renderers/graph.ts";
import { PerspectiveRenderer } from "./renderers/perspective.ts";
import { ElevationPoint, RenderOptions } from "./renderers/types.ts";


/**
 * Process and normalize elevation data
 */
function processElevationData(
  elevationData: ElevationData | ElevationData[],
  transformer: (coord: Coordinate) => { x: number; y: number }
): ElevationPoint[] {
  // Convert single ElevationData to array if needed
  const dataArray: ElevationData[] = Array.isArray(elevationData) ? elevationData : [elevationData];
  
  // Find min/max elevations for normalization
  let minElevation = Number.MAX_VALUE;
  let maxElevation = Number.MIN_VALUE;
  
  for (const point of dataArray) {
    minElevation = Math.min(minElevation, point.elevation);
    maxElevation = Math.max(maxElevation, point.elevation);
  }
  
  console.log(`Elevation range: ${minElevation}m to ${maxElevation}m`);
  const elevationRange = maxElevation - minElevation;
  
  // Transform and normalize
  return dataArray.map((point: ElevationData) => {
    // Transform coordinates
    const canvasPoint = transformer(point);
    
    // Normalize elevation (0-1)
    const normalizedElevation = elevationRange > 0 
      ? (point.elevation - minElevation) / elevationRange 
      : 0.5;
    
    return {
      ...canvasPoint,
      elevation: point.elevation,
      normalizedElevation
    };
  });
}

/**
 * Generate a relief visualization from elevation data
 */
export async function generateRelief(
  elevationData: ElevationData | ElevationData[],
  boundingBox: { minLat: number; maxLat: number; minLon: number; maxLon: number },
  options: RenderOptions
): Promise<canvas.Canvas> {
  // Create canvas
  const canvasElement = createCanvas({ width: options.width, height: options.height, backgroundColor: options.backgroundColor || "#000000" });
  
  // Create the coordinate transformer
  const transformer = createCoordinateTransformer(boundingBox, {
    width: options.width,
    height: options.height,
    padding: options.padding,
    invertY: options.invertY
  });
  
  // Transform and normalize elevation data
  const points = processElevationData(elevationData, transformer);
  
  // Create appropriate renderer based on style
  let renderer;
  switch (options.style) {
    case "dotgrid":
      renderer = new DotGridRenderer();
      break;
    case "graph":
      renderer = new GraphRenderer();
      break;
    case "perspective":
      renderer = new PerspectiveRenderer();
      break;
    default:
      renderer = new DotGridRenderer();
      break;
  }
  
  // Render the visualization
  renderer.render(canvasElement, points, options);
  
  return canvasElement;
} 

/**
 * Check if a location has sufficient elevation range
 */
export async function checkElevationRange(
  centerCoord: Coordinate,
  config: Config
): Promise<{ hasSufficientRange: boolean; minElevation: number; maxElevation: number }> {
  const sampleArea = getCoordinateArea(centerCoord, config.geographic.areaSize * 0.5);
  const sampleGrid = generateCoordinateGrid(sampleArea, 4);
  
  // Fetch elevation data for sample points
  const elevationData: ElevationData[] = [];
  for (const coord of sampleGrid) {
    const response = await fetchElevation(coord.latitude, coord.longitude, config);
    if (response.status === "success" && response.data.length > 0) {
      elevationData.push(...response.data);
    }
  }
  
  if (elevationData.length === 0) {
    return { hasSufficientRange: false, minElevation: 0, maxElevation: 0 };
  }
  
  const elevations = elevationData.map(d => d.elevation);
  const minElevation = Math.min(...elevations);
  const maxElevation = Math.max(...elevations);
  const elevationRange = maxElevation - minElevation;
  
  const hasSufficientRange = elevationRange >= config.geographic.minElevationRange;
  
  return { hasSufficientRange, minElevation, maxElevation };
} 


/**
 * Check if an area is mostly water using a sampling approach
 */
export async function checkWaterArea(
  centerCoord: Coordinate,
  config: Config
): Promise<{ isMostlyWater: boolean; waterPercentage: number }> {
  const sampleArea = getCoordinateArea(centerCoord, config.geographic.areaSize * 0.5);
  const sampleGrid = generateCoordinateGrid(sampleArea, 3);
  
  // Fetch elevation data for sample points
  const elevationData: ElevationData[] = [];
  for (const coord of sampleGrid) {
    const response = await fetchElevation(coord.latitude, coord.longitude, config);
    if (response.status === "success" && response.data.length > 0) {
      elevationData.push(...response.data);
    }
  }
  
  if (elevationData.length === 0) {
    return { isMostlyWater: true, waterPercentage: 100 };
  }
  
  const elevations = elevationData.map(d => d.elevation);
  const waterThreshold = 1; // Consider points with elevation <= 1m as water
  const waterPointCount = elevations.filter(e => e <= waterThreshold).length;
  const waterPercentage = (waterPointCount / elevations.length) * 100;
  
  console.log(`Water detection: ${waterPointCount}/${elevations.length} points (${waterPercentage.toFixed(1)}%) have elevation <= ${waterThreshold}m`);
  
  return { isMostlyWater: waterPercentage > 80, waterPercentage };
} 