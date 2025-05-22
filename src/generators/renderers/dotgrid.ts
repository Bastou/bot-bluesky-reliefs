import { canvas } from "../../deps.ts";
import { ElevationPoint, RenderOptions, Renderer } from "./types.ts";

/**
 * Render a grid of dots where circle radius represents elevation
 */
export class DotGridRenderer implements Renderer {
  render(
    canvasElement: canvas.Canvas, 
    points: ElevationPoint[], 
    options: RenderOptions
  ): void {
    const ctx = canvasElement.getContext("2d");
    const width = canvasElement.width;
    const height = canvasElement.height;
    const scaleFactor = options.scaleFactor || 1;
    const padding = (options.padding || 30) * scaleFactor;
    
    // Use the smaller dimension to ensure a square grid area
    const size = Math.min(width, height);
    
    // Create a clean background
    ctx.fillStyle = options.backgroundColor || "#000000";
    ctx.fillRect(0, 0, width, height);
    
    if (points.length === 0) return;
    
    const minRadius = 0.5 * scaleFactor;
    const maxRadius = size / 70 * scaleFactor; 
    
    const gridSize = 30; 
    const cellSize = (size - (padding * 2)) / gridSize;

    const offsetX = (width - size) / 2 + padding;
    const offsetY = (height - size) / 2 + padding;
    
    const mainColor = "#FFFFFF";
    
    // Create grid
    for (let row = 0; row < gridSize; row++) {
      for (let col = 0; col < gridSize; col++) {
        // Calculate center position of this grid cell
        const x = offsetX + (col * cellSize) + (cellSize / 2);
        const y = offsetY + (row * cellSize) + (cellSize / 2);
        
        // Find the closest data point to this grid cell
        let closestPoint: ElevationPoint | null = null;
        let minDistance = Number.MAX_VALUE;
        
        for (const point of points) {
          const distance = Math.sqrt(
            Math.pow(point.x - x, 2) + 
            Math.pow(point.y - y, 2)
          );
          
          if (distance < minDistance) {
            minDistance = distance;
            closestPoint = point;
          }
        }
        
        if (closestPoint) {
          // Calculate radius based on normalized elevation
          const radius = minRadius + (closestPoint.normalizedElevation * (maxRadius - minRadius));
          
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2, false);
          ctx.fillStyle = mainColor;
          ctx.fill();
        }
      }
    }
  }
} 