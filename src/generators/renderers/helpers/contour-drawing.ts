import { SimpleNoise } from "./noise.ts";
import { canvas } from "../../../deps.ts";
import { MARKER_PEN_CONFIG } from "../config.ts"; 

// Points type definition
export type Point = { x: number; y: number };

/**
 * Smooth a point array to reduce jagged edges using weighted averaging
 */
export function smoothPointArray(points: Point[]): Point[] {
  if (points.length < 3) return [...points];
  
  const smoothed = [];
  
  // Keep first and last points unchanged
  smoothed.push({...points[0]});
  
  // Apply smoothing to middle points
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i-1];
    const curr = points[i];
    const next = points[i+1];
    
    // Running average smoothing with center point weighted more heavily
    smoothed.push({
      x: prev.x * 0.15 + curr.x * 0.7 + next.x * 0.15,
      y: prev.y * 0.15 + curr.y * 0.7 + next.y * 0.15
    });
  }
  
  smoothed.push({...points[points.length - 1]});
  return smoothed;
}

/**
 * Create a hand-drawn looking path by adding controlled randomness
 */
export function createHandDrawnPath(
  points: Point[], 
  noise: SimpleNoise,
  seed: number, 
  offset: number = 0,
  scaleFactor = 1
): Point[] {
  // Skip processing if no points
  if (!points || points.length === 0) {
    return [];
  }
  
  // Base number of points for the reference
  const basePointCount = 70;
  
  const samplingRate = Math.max(1, Math.floor(points.length / (basePointCount * Math.sqrt(scaleFactor))));
  
  const sampledPoints = [];
  for (let i = 0; i < points.length; i += samplingRate) {
    sampledPoints.push(points[i]);
  }
  
  // Make sure we include the last point
  if (points.length > 0 && sampledPoints[sampledPoints.length - 1] !== points[points.length - 1]) {
    sampledPoints.push(points[points.length - 1]);
  }
  
  // Apply smoothing first to reduce jaggedness
  const smoothedPoints = smoothPointArray(sampledPoints);
  
  // Create the hand-drawn effect with controlled noise
  const result = [];
  for (let i = 0; i < smoothedPoints.length; i++) {
    const point = smoothedPoints[i];
    const t = i / (smoothedPoints.length - 1); // progress along line
    
    // Reduce wobble factor and make it depend on position
    // More stable at endpoints, more variation in the middle
    const wobbleCurve = Math.sin(t * Math.PI);
    
    const wobbleAmount = (MARKER_PEN_CONFIG.wobbleAmount / Math.sqrt(scaleFactor)) * 0.85;
    const wobbleFactor = wobbleCurve * wobbleAmount;
    
    // Use lower frequency noise for a smoother hand-drawn effect
    const noiseX = noise.get(t * 2 + seed * 0.1, offset * 2) * 2 - 1;
    const noiseY = noise.get(t * 2 + seed * 0.1 + 100, offset * 2 + 200) * 2 - 1;
    
    // Add more variation at peaks but keep it controlled
    let variationAmount = 1.0;
    if (i > 0 && i < smoothedPoints.length - 1) {
      const prev = smoothedPoints[i-1];
      const curr = point;
      const next = smoothedPoints[i+1];
      
      // Calculate angle change to detect peaks and valleys
      const dx1 = curr.x - prev.x;
      const dy1 = curr.y - prev.y;
      const dx2 = next.x - curr.x;
      const dy2 = next.y - curr.y;
      
      // Normalize vectors
      const len1 = Math.sqrt(dx1*dx1 + dy1*dy1) || 1;
      const len2 = Math.sqrt(dx2*dx2 + dy2*dy2) || 1;
      
      // Dot product to get angle change
      const dot = (dx1 * dx2 + dy1 * dy2) / (len1 * len2);
      
      // Smoother variation at direction changes
      variationAmount = 1.0 + (1.0 - Math.abs(dot)) * 1.3;
    }
    
    // Apply variations
    const offsetX = noiseX * wobbleFactor * variationAmount * 0.6 * scaleFactor;
    const offsetY = noiseY * wobbleFactor * variationAmount * 0.7 * scaleFactor;
    
    result.push({
      x: point.x + offsetX,
      y: point.y + offsetY
    });
  }
  
  return result;
}

/**
 * Draw a contour line with a marker pen effect
 */
export function drawContourLineWithMarkerEffect({
  ctx,
  contour,
  lineIndex,
  totalLines,
  dimensions,
  noise,
  scaleFactor = 1,
  shouldMask = false
}: {
  ctx: canvas.CanvasRenderingContext2D,
  contour: { points: Point[]; baseY: number },
  lineIndex: number,
  totalLines: number,
  dimensions: { width: number; height: number; padding: number },
  noise: SimpleNoise,
  scaleFactor?: number,
  shouldMask?: boolean
}): void {
  const { width, height, padding } = dimensions;
  
  // Ensure we have valid points
  if (!contour?.points || !Array.isArray(contour.points) || contour.points.length === 0) {
    console.warn(`No valid points for contour line ${lineIndex}`);
    return;
  }

  // Draw masking shape to create proper foreground/background occlusion
  if (shouldMask) {
    const endCapSize = 10 * scaleFactor;
    ctx.fillStyle = "#000000";
    ctx.beginPath();
    ctx.moveTo(padding, height);
    
    for (const point of contour.points) {
      if (point.x === contour.points[0].x) {
        ctx.lineTo(point.x - endCapSize, point.y);
      } else if (point.x === contour.points[contour.points.length - 1].x) {
        ctx.lineTo(point.x + endCapSize, point.y);
      } else {
        ctx.lineTo(point.x, point.y);
      }
    }
    
    ctx.lineTo(width - padding, height);
    ctx.closePath();
    ctx.fill();
  }
  
  // Always draw first and last 
  if (lineIndex !== 0 && lineIndex !== totalLines - 1) {
    const skip = Math.max(2, Math.round(scaleFactor + 1));
    if (lineIndex % skip !== 0) return;
  }
  
  // Calculate line characteristics based on position
  const positionFactor = lineIndex / (totalLines - 1);
  
  // Base width for the pen strokes varies by position - thicker at the bottom
  const lineNoiseSeed = lineIndex * 100;
  const widthNoise = noise.get(lineNoiseSeed, 0);
  
  // Lines grow thicker toward bottom with position-based scaling
  const positionWidth = (MARKER_PEN_CONFIG.baseWidth.min + 
    (MARKER_PEN_CONFIG.baseWidth.max - MARKER_PEN_CONFIG.baseWidth.min) * 
    Math.pow(positionFactor, 0.7)) * scaleFactor;
  
  // Add some random variation to the width
  const baseWidth = positionWidth * (0.9 + widthNoise * 0.2);
  
  // Number of strokes varies randomly for each line
  const strokeCount = Math.max(2, Math.floor(
    MARKER_PEN_CONFIG.strokeCount.min + 
    (MARKER_PEN_CONFIG.strokeCount.max - MARKER_PEN_CONFIG.strokeCount.min) * 
    noise.get(lineNoiseSeed + 50, 0)
  ));
  
  // More transparent for lines higher up (closer to horizon)
  const baseOpacity = MARKER_PEN_CONFIG.opacity.min + 
    (MARKER_PEN_CONFIG.opacity.max - MARKER_PEN_CONFIG.opacity.min) * 
    (positionFactor * 0.7 + 0.3);
  
  // Create multiple path variations for this line
  const pathVariations = [];
  for (let v = 0; v < 3; v++) {
    const handDrawnPath = createHandDrawnPath(
      contour.points, 
      noise,
      lineNoiseSeed + v * 1000, 
      v,
      scaleFactor
    );
    if (handDrawnPath && handDrawnPath.length > 0) {
      pathVariations.push(handDrawnPath);
    }
  }
  
  // Check that we have at least one valid path
  if (pathVariations.length === 0) {
    console.warn(`No valid path variations for contour line ${lineIndex}`);
    return;
  }
  
  // Draw multiple overlapping strokes for the marker pen effect
  drawMarkerPenStrokes(ctx, pathVariations, {
    strokeCount,
    baseWidth,
    baseOpacity,
    lineNoiseSeed,
    lineIndex,
    noise,
    scaleFactor
  });
}

/**
 * Draw multiple overlapping strokes to create a marker pen effect
 */
function drawMarkerPenStrokes(
  ctx: canvas.CanvasRenderingContext2D,
  pathVariations: Point[][],
  options: {
    strokeCount: number,
    baseWidth: number,
    baseOpacity: number,
    lineNoiseSeed: number,
    lineIndex: number,
    noise: SimpleNoise,
    scaleFactor?: number
  }
): void {
  const { strokeCount, baseWidth, baseOpacity, lineNoiseSeed, lineIndex, noise, scaleFactor = 1 } = options;
  
  // Draw multiple overlapping strokes
  for (let s = 0; s < strokeCount; s++) {
    // Calculate this stroke's characteristics
    const strokeRatio = strokeCount > 1 ? s / (strokeCount - 1) : 0.5;
    const strokeCenterOffset = (strokeRatio * 2 - 1); // -1 to 1
    
    // Select path variation based on stroke position
    const pathIndex = Math.min(pathVariations.length - 1, Math.floor(strokeRatio * pathVariations.length));
    const points = pathVariations[pathIndex];
    
    // Skip if invalid points
    if (!points || points.length < 2) continue;
    
    // Horizontal offset creates overlapping effect
    const hOffset = strokeCenterOffset * baseWidth * MARKER_PEN_CONFIG.strokeOverlap;
    
    // Small vertical offset for natural hand-drawn look
    const vOffset = strokeCenterOffset * 0.6 * scaleFactor;
    
    // Vary width - thicker in middle, thinner on edges
    const widthMultiplier = 1.0 - 0.2 * Math.abs(strokeCenterOffset);
    const strokeWidth = baseWidth * widthMultiplier;
    
    // Vary opacity slightly between strokes
    const opacity = Math.max(0.2, baseOpacity - (Math.abs(strokeCenterOffset) * 0.15));
    
    try {
      // Draw the main stroke
      drawSingleStroke(ctx, points, {
        strokeWidth,
        opacity,
        hOffset,
        vOffset,
        strokePosition: s,
        lineIndex,
        noise,
        scaleFactor
      });
    } catch (error) {
      console.error(`Error drawing stroke ${s} for contour line ${lineIndex}:`, error);
    }
  }
}

/**
 * Draw a single marker pen stroke
 */
function drawSingleStroke(
  ctx: canvas.CanvasRenderingContext2D,
  points: Point[],
  options: {
    strokeWidth: number,
    opacity: number,
    hOffset: number,
    vOffset: number,
    strokePosition: number,
    lineIndex: number,
    noise: SimpleNoise,
    scaleFactor?: number
  }
): void {
  const { strokeWidth, opacity, hOffset, vOffset, strokePosition, lineIndex, noise, scaleFactor = 1 } = options;
  
  // Setup stroke style
  ctx.beginPath();
  ctx.lineWidth = strokeWidth;
  ctx.strokeStyle = `rgba(0, 133, 255, ${opacity})`;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  
  // Draw the stroke path
  const firstPoint = points[0];
  if (!firstPoint) return;
  
  ctx.moveTo(firstPoint.x + hOffset, firstPoint.y + vOffset);
  
  let lastCurve = false;
  
  // Draw path with natural variations
  for (let j = 1; j < points.length; j++) {
    const prevPoint = points[j-1];
    const currentPoint = points[j];
    
    if (!prevPoint || !currentPoint) continue;
    
    const progress = j / (points.length - 1);
    
    // Vary line width along path for natural marker feel
    const segmentSeed = j * 0.03 + strokePosition * 0.7 + lineIndex * 0.13;
    const segmentNoise = noise.get(segmentSeed, segmentSeed * 0.5);
    
    // Smoother, subtle width variation
    const widthVariation = 0.85 + (segmentNoise * 0.3 * Math.sin(progress * Math.PI));
    ctx.lineWidth = strokeWidth * widthVariation;
    
    // Use curves occasionally for natural look
    const scaledCurveInterval = Math.floor(1 * Math.sqrt(scaleFactor));
    const shouldUseCurve: boolean = j % scaledCurveInterval === 0 && !lastCurve;
    lastCurve = shouldUseCurve;
    
    if (shouldUseCurve) {
      // Get control point randomness that scales properly with image size
      const controlPointRandomness = MARKER_PEN_CONFIG.controlPointRandomness * scaleFactor;
      
      // Random control point for curved line
      const cpX = prevPoint.x + (currentPoint.x - prevPoint.x) * 0.5 + 
               (noise.get(j + strokePosition * 0.3, lineIndex * 0.25) * 2 - 1) * controlPointRandomness;
                  
      const cpY = prevPoint.y + (currentPoint.y - prevPoint.y) * 0.5 + 
               (noise.get(j + strokePosition * 0.5, lineIndex * 0.35) * 2 - 1) * controlPointRandomness;
      

      ctx.quadraticCurveTo(
        cpX + hOffset, 
        cpY + vOffset, 
        currentPoint.x + hOffset, 
        currentPoint.y + vOffset
      );
    } else {
      ctx.lineTo(
        currentPoint.x + hOffset, 
        currentPoint.y + vOffset
      );
    }
  }
  

  ctx.stroke();
} 