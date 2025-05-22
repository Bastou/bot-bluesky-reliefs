import { Coordinate } from "../utils/coordinates.ts";
import { Config } from "../config/config.ts";

export interface CanvasPoint {
  x: number;
  y: number;
}

export interface TransformerOptions {
  width: number;
  height: number;
  padding?: number;
  invertY?: boolean;
}

/**
 * Transforms geographic coordinates into canvas coordinates
 */
export function createCoordinateTransformer(
  boundingBox: { minLat: number; maxLat: number; minLon: number; maxLon: number },
  options: TransformerOptions
): (coord: Coordinate) => CanvasPoint {
  const { width, height } = options;
  const padding = options.padding || 0;
  const invertY = options.invertY !== undefined ? options.invertY : true;
  
  const effectiveWidth = width - (padding * 2);
  const effectiveHeight = height - (padding * 2);
  

  const latRange = boundingBox.maxLat - boundingBox.minLat;
  const lonRange = boundingBox.maxLon - boundingBox.minLon;
  
  // Return the transformer function
  return (coord: Coordinate): CanvasPoint => {
    // Calculate normalized position (0-1) within bounding box
    const normX = (coord.longitude - boundingBox.minLon) / lonRange;
    let normY = (coord.latitude - boundingBox.minLat) / latRange;
    
    if (invertY) {
      normY = 1 - normY;
    }
    
    const x = padding + (normX * effectiveWidth);
    const y = padding + (normY * effectiveHeight);
    
    return { x, y };
  };
}