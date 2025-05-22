
// Constants for perspective terrain rendering
export const PERSPECTIVE_CONFIG = {
  defaultPadding: 20,
  defaultBackgroundColor: "#000000",
  defaultGridResolution: 30,
  defaultLineColor: "#ffffff",
  defaultEmptyCellValue: 0,
  
  numSegments: 100,
  elevationRange: { min: 0, max: 1 },
  
  smoothWeights: { 
    cardinal: 0.5,
    diagonal: 0.25
  },
  
  amplificationDamping: { 
    firstLine: 0.5, 
    secondLine: 0.7 
  },
  
  terrainSampling: {
    lowFlat: { start: 0.2, range: 0.6 },
    default: { start: 0.1, range: 0.8 }
  },
  
  perspective: {
    firstLineMultiplier: 1.5,
    xCompression: 0.005
  }
};

// Marker pen rendering configuration
export const MARKER_PEN_CONFIG = {
  strokeCount: { min: 3, max: 9 },
  baseWidth: { min: 2.5, max: 8.2 },
  opacity: { min: 0.35, max: 0.95 },
  wobbleAmount: 3,
  strokeOverlap: 0.25,
  controlPointRandomness: 0.32,
  color: "rgba(0, 133, 255, 1.0)"
};

// Constants for terrain classification
export const TERRAIN_THRESHOLDS = {
  flat: 30,
  rolling: 150,
  hilly: 800,
  lowAltitude: 200,
  highAltitude: 1000
};

// Default rendering parameters
export const DEFAULT_RENDER_PARAMS = {
  horizonPosition: 0.75,
  perspectiveExponent: 0.65,
  amplification: 650,
  peakEmphasis: 0.65,
  numLines: 30
};

// Terrain-specific parameter adjustments
export const TERRAIN_ADJUSTMENTS = {
  flat: {
    horizonPosition: 0.5,
    perspectiveExponent: 0.7,
    amplificationFactor: 0.1,
    peakEmphasis: 0.1,
    lineMultiplier: 1
  },
  rolling: {
    horizonPosition: 0.5,
    perspectiveExponent: 0.75,
    amplificationFactor: 0.3,
    peakEmphasis: 0.15,
    lineMultiplier: 1
  },
  hilly: {
    horizonPosition: 0.5,
    perspectiveExponent: 0.75,
    amplificationFactor: 0.4,
    peakEmphasis: 0.2,
    lineMultiplier: 1
  },
  mountainous: {
    horizonPosition: 0.6,
    perspectiveExponent: 0.85,
    amplificationFactor: 0.92,
    peakEmphasis: 0.92,
    lineMultiplier: 1.1
  }
};

