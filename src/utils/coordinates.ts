import { Config } from "../config/config.ts";

export interface Coordinate {
  latitude: number;
  longitude: number;
}

export interface CoordinateArea {
  centerLatitude: number;
  centerLongitude: number;
  size: number; // in kilometers
}

/**
 * Check if a coordinate is likely on land (using common continental bounds)
 * This is a simple but efficient first-pass filter to avoid obvious water locations
 */
export function isCoordinateOnLand(coordinate: Coordinate): boolean {
  const { latitude, longitude } = coordinate;
  
  // Define land masses (very rough approximations)
  const landMasses = [
    // North America
    { minLat: 15, maxLat: 72, minLon: -170, maxLon: -50 },
    // Central America
    { minLat: 7, maxLat: 33, minLon: -120, maxLon: -60 },
    // South America
    { minLat: -60, maxLat: 15, minLon: -90, maxLon: -30 },
    // Europe
    { minLat: 36, maxLat: 70, minLon: -10, maxLon: 40 },
    // Africa
    { minLat: -40, maxLat: 36, minLon: -20, maxLon: 55 },
    // Asia
    { minLat: 0, maxLat: 80, minLon: 40, maxLon: 180 },
    // Australia
    { minLat: -50, maxLat: -10, minLon: 110, maxLon: 155 },
    // New Zealand
    { minLat: -50, maxLat: -30, minLon: 165, maxLon: 180 },
    // Japan
    { minLat: 30, maxLat: 46, minLon: 128, maxLon: 146 },
    // UK and Ireland
    { minLat: 50, maxLat: 60, minLon: -11, maxLon: 2 },
    // Indonesia and SE Asia
    { minLat: -11, maxLat: 20, minLon: 95, maxLon: 141 },
    // Philippines
    { minLat: 5, maxLat: 20, minLon: 115, maxLon: 127 },
    // Caribbean Islands (rough area)
    { minLat: 10, maxLat: 25, minLon: -85, maxLon: -60 },
    // Hawaii
    { minLat: 18, maxLat: 23, minLon: -160, maxLon: -154 },
    // Iceland
    { minLat: 63, maxLat: 67, minLon: -24, maxLon: -13 },
    // Madagascar
    { minLat: -26, maxLat: -12, minLon: 43, maxLon: 51 },
    // Greenland
    { minLat: 60, maxLat: 84, minLon: -74, maxLon: -11 },
    // Sri Lanka
    { minLat: 5, maxLat: 10, minLon: 79, maxLon: 82 },
    // Taiwan
    { minLat: 22, maxLat: 25, minLon: 120, maxLon: 122 }
  ];
  
  for (let i = 0; i < landMasses.length; i++) {
    const landMass = landMasses[i];
    if (
      latitude >= landMass.minLat && 
      latitude <= landMass.maxLat && 
      longitude >= landMass.minLon && 
      longitude <= landMass.maxLon
    ) {
      return true;
    }
  }
  
  return false;
}

/**
 * Generate a random coordinate within the configured constraints
 */
export function generateRandomCoordinate(config: Config): Coordinate {
  const { minLatitude, maxLatitude, minLongitude, maxLongitude } = config.geographic;
  
  // Try up to 50 times to find a coordinate on land - increased attempts for better coverage
  const maxAttempts = 50;
  let attempts = 0;
  
  while (attempts < maxAttempts) {
    const latitude = minLatitude + Math.random() * (maxLatitude - minLatitude);
    const longitude = minLongitude + Math.random() * (maxLongitude - minLongitude);
    
    const coordinate = {
      latitude: roundCoordinate(latitude),
      longitude: roundCoordinate(longitude),
    };
    
    // Check if coordinate is on land
    if (isCoordinateOnLand(coordinate)) {
      console.log(`Found coordinate on land after ${attempts + 1} attempts: ${coordinate.latitude}, ${coordinate.longitude}`);
      return coordinate;
    }
    
    attempts++;
  }
  
  // If we couldn't find a valid coordinate, adjust search strategy
  console.log("Couldn't find a land coordinate after multiple attempts, using focused search");
  
  // Focus search on continental regions with higher probability of land
  
  // Europe 
  if (tryRegion(40, 65, -5, 30)) {
    return lastTry!;
  }
  
  // North America 
  if (tryRegion(30, 60, -120, -70)) {
    return lastTry!;
  }
  
  // Asia
  if (tryRegion(20, 60, 60, 140)) {
    return lastTry!;
  }
  
  // Africa
  if (tryRegion(-20, 20, 10, 40)) {
    return lastTry!;
  }
  
  // Last resort
  console.log("No land coordinates found even with focused search, returning approximate Europe cuz why not");
  // return a RANDOM coordinate in center europe with no water from a defined range of coordinates
  const europeRange = {
    minLat: 36,
    maxLat: 70,
    minLon: -10,
    maxLon: 40
  };
  const europeCoordinate = {
    latitude: europeRange.minLat + Math.random() * (europeRange.maxLat - europeRange.minLat),
    longitude: europeRange.minLon + Math.random() * (europeRange.maxLon - europeRange.minLon),
  };
  return europeCoordinate;
}

// Track last successful coordinate
let lastTry: Coordinate | null = null;

// Helper function to try finding land in a specific region
function tryRegion(minLat: number, maxLat: number, minLon: number, maxLon: number): boolean {
  console.log(`Trying focused region: ${minLat}-${maxLat}, ${minLon}-${maxLon}`);
  
  for (let i = 0; i < 20; i++) {
    const latitude = minLat + Math.random() * (maxLat - minLat);
    const longitude = minLon + Math.random() * (maxLon - minLon);
    
    const coordinate = {
      latitude: roundCoordinate(latitude),
      longitude: roundCoordinate(longitude),
    };
    
    if (isCoordinateOnLand(coordinate)) {
      console.log(`Found coordinate in focused region: ${coordinate.latitude}, ${coordinate.longitude}`);
      lastTry = coordinate;
      return true;
    }
  }
  
  return false;
}

/**
 * Coordinate area centered around a point
 */
export function getCoordinateArea(center: Coordinate, sizeKm: number): CoordinateArea {
  return {
    centerLatitude: center.latitude,
    centerLongitude: center.longitude,
    size: sizeKm,
  };
}

/**
 * Calculate a bounding box for a coordinate area
 */
export function calculateBoundingBox(area: CoordinateArea): {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
} {
  // Approximate conversion from km to degrees
  // At the equator, 1 degree is about 111 km
  const kmToDegree = 1 / 111;
  
  // Adjust for longitude which varies with latitude
  const latRadian = (area.centerLatitude * Math.PI) / 180;
  const longitudeKmToDegree = kmToDegree / Math.cos(latRadian);
  
  const halfSizeDegrees = area.size * kmToDegree / 2;
  const halfSizeDegreesLon = area.size * longitudeKmToDegree / 2;
  
  return {
    minLat: roundCoordinate(area.centerLatitude - halfSizeDegrees),
    maxLat: roundCoordinate(area.centerLatitude + halfSizeDegrees),
    minLon: roundCoordinate(area.centerLongitude - halfSizeDegreesLon),
    maxLon: roundCoordinate(area.centerLongitude + halfSizeDegreesLon),
  };
}

/**
 * Round a coordinate to 6 decimal places (approximately 10cm precision)
 */
export function roundCoordinate(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

/**
 * Generate a grid of coordinates covering an area
 */
export function generateCoordinateGrid(area: CoordinateArea, resolution = 10): Coordinate[] {
  const bbox = calculateBoundingBox(area);
  const grid: Coordinate[] = [];
  
  // Calculate step size based on resolution
  const latStep = (bbox.maxLat - bbox.minLat) / (resolution - 1);
  const lonStep = (bbox.maxLon - bbox.minLon) / (resolution - 1);
  
  // Generate grid points
  for (let i = 0; i < resolution; i++) {
    for (let j = 0; j < resolution; j++) {
      const latitude = roundCoordinate(bbox.minLat + i * latStep);
      const longitude = roundCoordinate(bbox.minLon + j * lonStep);
      
      grid.push({ latitude, longitude });
    }
  }
  
  return grid;
}

/**
 * Test function for coordinate generation
 */
export function testCoordinateGeneration(config: Config): void {
  console.log("Testing coordinate generation...");
  
  // Generate a random coordinate
  const coordinate = generateRandomCoordinate(config);
  console.log("Random coordinate:", coordinate);
  
  // Generate an area around the coordinate
  const area = getCoordinateArea(coordinate, config.geographic.areaSize);
  console.log("Area:", area);
  
  // Calculate the bounding box
  const bbox = calculateBoundingBox(area);
  console.log("Bounding box:", bbox);
  
  // Generate a grid of coordinates
  const grid = generateCoordinateGrid(area, 5); // 5x5 grid
  console.log(`Generated grid with ${grid.length} points`);
  console.log("Sample grid points:", grid.slice(0, 3));
} 