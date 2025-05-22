import { canvas } from "../../deps.ts";
import { ElevationPoint, RenderOptions, Renderer, RenderParams, TerrainAnalysis } from "./types.ts";
import { analyzeTerrain, getTerrainRenderParams } from "./helpers/terrain.ts";
import { SimpleNoise } from "./helpers/noise.ts";
import { Point, drawContourLineWithMarkerEffect } from "./helpers/contour-drawing.ts";
import { PERSPECTIVE_CONFIG } from "./config.ts";
import { BASE_RENDER_SIZE } from '../../config/config.ts';

/**
 * PerspectiveRenderer: Creates a perspective view of terrain with marker-pen horizontal lines
 * 
 */
export class PerspectiveRenderer implements Renderer {
  private ctx!: canvas.CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  private padding = 0;
  private drawingWidth = 0;
  private drawingHeight = 0;
  
  private gridSize = 0;
  private horizonY = 0;
  private smoothedGrid: number[][] = [];
  private getElevation: (nx: number, ny: number) => number = () => 0;
  
  private noise: SimpleNoise;
  
  constructor() {
    this.noise = new SimpleNoise(Math.random() * 10000);
  }

  render(
    canvasElement: canvas.Canvas,
    points: ElevationPoint[],
    options: RenderOptions
  ): void {
    // Validate input

    if (points.length === 0) return;

    // Phase 1: Setup and analysis
    this.setupCanvas(canvasElement, options);
    const terrain = this.analyzeTerrain(points, options);
    
    // Phase 2: Prepare elevation grid
    this.prepareElevationGrid(points, terrain);
    
    // Phase 3: Draw contour lines
    this.drawContourLines(terrain, options);
  }

  /**
   * Set up canvas and basic rendering parameters
   */
  private setupCanvas(canvasElement: canvas.Canvas, options: RenderOptions): void {
    this.ctx = canvasElement.getContext("2d");
    this.width = canvasElement.width;
    this.height = canvasElement.height;
    
    // Get exact proportional scale factor compared to the reference width
    const scaleFactor = options.scaleFactor || 1;
    
    // Apply scale factor to padding - critical for consistent margin proportions
    this.padding = Math.round((options.padding || PERSPECTIVE_CONFIG.defaultPadding) * scaleFactor);
    this.drawingWidth = this.width - (this.padding * 2);
    this.drawingHeight = this.height - (this.padding * 2);
    
    // Scale grid resolution proportionally - important for preserving level of detail
    this.gridSize = options.gridResolution || Math.round(PERSPECTIVE_CONFIG.defaultGridResolution * scaleFactor);

    // Create background
    this.ctx.fillStyle = options.backgroundColor || PERSPECTIVE_CONFIG.defaultBackgroundColor;
    this.ctx.fillRect(0, 0, this.width, this.height);
    
    // Set line style defaults
    this.ctx.lineCap = "round";
    this.ctx.lineJoin = "round";
  }

  /**
   * Analyze terrain and get rendering parameters
   */
  private analyzeTerrain(points: ElevationPoint[], options: RenderOptions): {
    terrain: TerrainAnalysis;
    renderParams: RenderParams;
  } {
    const terrain = analyzeTerrain(points);
    options.terrainType = terrain.terrainType;
    const renderParams = getTerrainRenderParams(terrain, options);
    
    const scaleFactor = this.width / BASE_RENDER_SIZE;
    
    if (scaleFactor > 1) {
      const lineScaleFactor = Math.sqrt(scaleFactor);
      renderParams.numLines = Math.round(renderParams.numLines * lineScaleFactor);
    }
    
    // Set horizon position 
    this.horizonY = this.padding + (this.drawingHeight * renderParams.horizonPosition);
    
    return { terrain, renderParams };
  }

  /**
   * Prepare elevation grid - combined and simplified version
   */
  private prepareElevationGrid(
    points: ElevationPoint[], 
    { terrain, renderParams }: { terrain: TerrainAnalysis; renderParams: RenderParams }
  ): void {
    if (points.length === 0) return;

    // Find data bounds
    let minX = Number.MAX_VALUE, maxX = Number.MIN_VALUE;
    let minY = Number.MAX_VALUE, maxY = Number.MIN_VALUE;
    
    for (const point of points) {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
    }
    
    // Initialize grid directly with default values
    this.smoothedGrid = Array(this.gridSize).fill(0).map(() => 
      Array(this.gridSize).fill(PERSPECTIVE_CONFIG.defaultEmptyCellValue));
    
    // Map points to grid cells
    for (const point of points) {
      const nx = (point.x - minX) / (maxX - minX);
      const ny = (point.y - minY) / (maxY - minY);
      
      const gridX = Math.min(Math.floor(nx * this.gridSize), this.gridSize - 1);
      const gridY = Math.min(Math.floor(ny * this.gridSize), this.gridSize - 1);
      
      // Take highest elevation per cell
      if (this.smoothedGrid[gridY][gridX] === PERSPECTIVE_CONFIG.defaultEmptyCellValue || 
          this.smoothedGrid[gridY][gridX] < point.normalizedElevation) {
        this.smoothedGrid[gridY][gridX] = point.normalizedElevation;
      }
    }
    
    // smoothing terrain
    const isFlat = terrain.terrainType.includes("low-") || terrain.terrainType.includes("flat");
    const smoothFactor = isFlat ? 1.5 : 1.0;
    const smoothed = Array(this.gridSize).fill(0).map(() => Array(this.gridSize).fill(0));
    
    for (let y = 0; y < this.gridSize; y++) {
      for (let x = 0; x < this.gridSize; x++) {
        let sum = this.smoothedGrid[y][x] * smoothFactor;
        let count = smoothFactor;
        
        // Simple box blur
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            
            const ny = y + dy, nx = x + dx;
            if (ny >= 0 && ny < this.gridSize && nx >= 0 && nx < this.gridSize) {
              // Simple weighting - equal for all neighbors
              const weight = 0.4;
              sum += this.smoothedGrid[ny][nx] * weight;
              count += weight;
            }
          }
        }
        
        // Norm with Smoothing, peak emphasis,
        smoothed[y][x] = Math.pow(sum / count, renderParams.peakEmphasis);
      }
    }
    
    // Replace grid with processed version
    this.smoothedGrid = smoothed;
    
    // Normalize in a single pass
    let minElev = Number.MAX_VALUE;
    let maxElev = Number.MIN_VALUE;
    
    // Find min/max
    for (let y = 0; y < this.gridSize; y++) {
      for (let x = 0; x < this.gridSize; x++) {
        minElev = Math.min(minElev, this.smoothedGrid[y][x]);
        maxElev = Math.max(maxElev, this.smoothedGrid[y][x]);
      }
    }
    
    // Apply normalization
    const elevRange = maxElev - minElev;
    if (elevRange > 0) {
      const targetMin = PERSPECTIVE_CONFIG.elevationRange.min;
      const targetRange = PERSPECTIVE_CONFIG.elevationRange.max - targetMin;
      
      for (let y = 0; y < this.gridSize; y++) {
        for (let x = 0; x < this.gridSize; x++) {
          this.smoothedGrid[y][x] = targetMin + targetRange * 
            ((this.smoothedGrid[y][x] - minElev) / elevRange);
        }
      }
    }
    
    // Create elevation sampler
    this.getElevation = this.createElevationSampler();
  }

  /**
   * Draw all contour lines from horizon to foreground
   */
  private drawContourLines(
    { terrain, renderParams }: { terrain: TerrainAnalysis; renderParams: RenderParams },
    options: RenderOptions
  ): void {
    // Calculate available drawing space and amplification
    const availableHeight = this.horizonY - this.padding;
    
    const scaleFactor = options.scaleFactor || 1;
    
    const amplification = Math.min(renderParams.amplification * scaleFactor, availableHeight * 0.9 / 0.8);

    let lastDrawnLineIndex: number | null = null;
    for (let i = 0; i < renderParams.numLines; i++) {
      const contour = this.calculateContourLine(i, renderParams, terrain, amplification, scaleFactor);
      let skip = false;
      if (i !== 0 && i !== renderParams.numLines - 1) {
        const skipInterval = Math.max(2, Math.round(scaleFactor + 1));
        if (i % skipInterval !== 0) skip = true;
      }
      if (!skip) {
        drawContourLineWithMarkerEffect({
          ctx: this.ctx,
          contour,
          lineIndex: i,
          totalLines: renderParams.numLines,
          dimensions: { width: this.width, height: this.height, padding: this.padding },
          noise: this.noise,
          scaleFactor,
          shouldMask: lastDrawnLineIndex !== null
        });
        lastDrawnLineIndex = i;
      }
    }

    if (options.showDebugText) {
      this.drawDebugInfo(terrain, options);
    }
  }

  /**
   * Create elevation sampling function using bilinear interpolation
   * NOTE: this is the moment I realise I'm going to far
   */
  private createElevationSampler(): (nx: number, ny: number) => number {
    return (nx: number, ny: number): number => {
      // Constrain to valid range
      const x = Math.max(0, Math.min(1, nx)) * (this.gridSize - 1);
      const y = Math.max(0, Math.min(1, ny)) * (this.gridSize - 1);
      
      // Get corner points
      const x0 = Math.floor(x);
      const y0 = Math.floor(y);
      const x1 = Math.min(x0 + 1, this.gridSize - 1);
      const y1 = Math.min(y0 + 1, this.gridSize - 1);
      
      // Calculate interpolation factors
      const sx = x - x0;
      const sy = y - y0;
      
      // Get elevation values at corners
      const e00 = this.smoothedGrid[y0][x0];
      const e01 = this.smoothedGrid[y0][x1];
      const e10 = this.smoothedGrid[y1][x0];
      const e11 = this.smoothedGrid[y1][x1];
      
      // Bilinear interpolation
      const eTop = e00 * (1 - sx) + e01 * sx;
      const eBottom = e10 * (1 - sx) + e11 * sx;
      return eTop * (1 - sy) + eBottom * sy;
    };
  }

  /**
   * Get scaled number of segments for contour lines
   * This is critical for the horizontal detail level in the terrain
   */
  private getScaledNumSegments(scaleFactor = 1): number {
    if (scaleFactor <= 1.01) {
      return PERSPECTIVE_CONFIG.numSegments;
    }
    return Math.round(PERSPECTIVE_CONFIG.numSegments * Math.pow(scaleFactor, 1.2));
  }

  /**
   * Calculate points for a single contour line
   */
  private calculateContourLine(
    i: number,
    renderParams: RenderParams,
    terrain: TerrainAnalysis,
    amplification: number,
    scaleFactor = 1
  ): { points: Point[]; baseY: number } {
    // Calculate progress (0 to 1) from horizon to foreground
    const t = i / (renderParams.numLines - 1);
    
    // Apply perspective transform (lines closer together near horizon)
    const perspectiveT = i <= 1 ? 
      Math.pow(t, renderParams.perspectiveExponent * PERSPECTIVE_CONFIG.perspective.firstLineMultiplier) : 
      Math.pow(t, renderParams.perspectiveExponent);
    
    // Calculate vertical position (y-coordinate)
    const lineY = this.horizonY + (perspectiveT * (this.height - this.horizonY - this.padding));
    
    // Determine terrain sampling position
    const terrainY = terrain.terrainType.includes("low-") || terrain.terrainType.includes("flat") ?
      PERSPECTIVE_CONFIG.terrainSampling.lowFlat.start + (t * PERSPECTIVE_CONFIG.terrainSampling.lowFlat.range) :
      PERSPECTIVE_CONFIG.terrainSampling.default.start + (t * PERSPECTIVE_CONFIG.terrainSampling.default.range);
    
    // Get the number of segments based on exact scale factor - critical for horizontal detail
    const numSegments = this.getScaledNumSegments(scaleFactor);
    
    // Find maximum elevation along this line (for consistent amplification)
    let maxRowElevation = 0;
    for (let j = 0; j <= numSegments; j++) {
      const xProgress = j / numSegments;
      maxRowElevation = Math.max(maxRowElevation, this.getElevation(xProgress, terrainY));
    }
    
    // Adjust amplification based on maximum elevation
    let rowAmplification = maxRowElevation > 0.8 ? 
      amplification * 0.8 / maxRowElevation : 
      amplification;
    
    // Apply additional damping to first lines
    if (i === 0) {
      rowAmplification *= PERSPECTIVE_CONFIG.amplificationDamping.firstLine;
    } else if (i === 1) {
      rowAmplification *= PERSPECTIVE_CONFIG.amplificationDamping.secondLine;
    }
    
    // Generate contour points
    const contourPoints: Point[] = [];
    const centerX = this.width / 2;
    
    for (let j = 0; j <= numSegments; j++) {
      // Calculate horizontal position with perspective compression
      const xProgress = j / numSegments;
      const rawX = this.padding + (xProgress * this.drawingWidth);
      const distFromCenter = rawX - centerX;
      
      // Apply horizontal compression for perspective effect
      const xCompression = 1.0 - (PERSPECTIVE_CONFIG.perspective.xCompression * (1 - t));
      const perspectiveX = centerX + (distFromCenter * xCompression);
      
      // Calculate elevation at this point
      const elevation = this.getElevation(xProgress, terrainY);
      const elevationOffset = elevation * rowAmplification;
      
      // Apply elevation as vertical offset (higher terrain = higher on canvas)
      const finalY = Math.max(this.padding, lineY - elevationOffset);
      
      contourPoints.push({ x: perspectiveX, y: finalY });
    }
    
    return { points: contourPoints, baseY: lineY };
  }

  /**
   * Draw debug information about the terrain
   */
  private drawDebugInfo(terrain: TerrainAnalysis, options: RenderOptions): void {
    const scaleFactor = options.scaleFactor || 1;
    
    this.ctx.font = `${Math.round(10 * scaleFactor)}px system-ui`;
    this.ctx.fillStyle = PERSPECTIVE_CONFIG.defaultLineColor;
    this.ctx.textAlign = "center";
    
    const padding = this.padding;
    const baseY = this.height - padding;
    const lineSpacing = Math.round(20 * scaleFactor);
    
    this.ctx.fillText(`${options.terrainType}`, this.width / 2, baseY);
    this.ctx.fillText(`${Math.round(terrain.elevationRange)}m`, this.width / 2, baseY - lineSpacing);
    this.ctx.fillText(`${Math.round(terrain.averageElevation)}m`, this.width / 2, baseY - lineSpacing * 2);
    this.ctx.fillText(`${Math.round(terrain.elevationVariability)}m`, this.width / 2, baseY - lineSpacing * 3);
  }
} 