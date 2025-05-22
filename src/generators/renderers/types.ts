import { canvas } from "../../deps.ts";
import { CanvasPoint } from "../coordinates.ts";

export interface ElevationPoint extends CanvasPoint {
  elevation: number;
  normalizedElevation: number; // 0-1 value
}

export interface RenderOptions {
  invertY: boolean | undefined;
  style: 'perspective' | 'dotgrid' | 'graph';
  width: number;
  height: number;
  backgroundColor: string;
  padding: number;
  scaleFactor?: number;
  contourLines?: number;
  contourWidth?: number;
  gridResolution?: number;
  terrainType?: string;    // Auto-detected terrain type
  showDebugText?: boolean; // Whether to hide debug information
}

// Terrain analysis result interface
export interface TerrainAnalysis {
  terrainType: string;
  elevationRange: number;
  averageElevation: number;
  elevationVariability: number;
}

// Rendering parameters interface
export interface RenderParams {
  horizonPosition: number;      // Position of horizon line (0-1)
  perspectiveExponent: number;  // Controls perspective curve
  amplification: number;        // Height amplification
  peakEmphasis: number;         // Power function for peak emphasis (0-1)
  numLines: number;             // Number of contour lines
}

export interface Renderer {
  render: (canvasElement: canvas.Canvas, points: ElevationPoint[], options: RenderOptions) => void;
} 