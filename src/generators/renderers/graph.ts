import { canvas } from "../../deps.ts";
import { ElevationPoint, RenderOptions, Renderer } from "./types.ts";

/**
 * Render graph lines representing elevation
 */
export class GraphRenderer implements Renderer {
  render(
    canvasElement: canvas.Canvas, 
    points: ElevationPoint[], 
    options: RenderOptions
  ): void {
    const ctx = canvasElement.getContext("2d");
    const width = canvasElement.width;
    const height = canvasElement.height;
    const scaleFactor = options.scaleFactor || 1;
    const padding = (options.padding || 40) * scaleFactor;
    const numLines = options.contourLines || 20; // Number of elevation lines
    
    const colorScheme = [
      "#ffffff", "#f0f0f0", "#e0e0e0", "#d0d0d0", "#c0c0c0", 
      "#b0b0b0", "#a0a0a0", "#909090", "#808080", "#707070"
    ];
    
    ctx.fillStyle = options.backgroundColor || "#000000";
    ctx.fillRect(0, 0, width, height);
    
    const pointsByElevation: Record<number, ElevationPoint[]> = {};
    
    for (const point of points) {
      const elevLevel = Math.floor(point.normalizedElevation * (numLines - 1));
      if (!pointsByElevation[elevLevel]) {
        pointsByElevation[elevLevel] = [];
      }
      pointsByElevation[elevLevel].push(point);
    }
    
    for (let i = 0; i < numLines; i++) {
      const y = padding + ((height - padding * 2) * (1 - (i / (numLines - 1))));
      
      const colorIndex = Math.min(Math.floor((i / numLines) * colorScheme.length), colorScheme.length - 1);
      const lineColor = colorScheme[colorIndex];
      
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 2.5 * scaleFactor;
      ctx.lineCap = "round";
      
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(width - padding, y);
      ctx.stroke();
      
      // Add elevation label
      const elevationText = `${Math.round((i / (numLines - 1)) * 100)}%`;
      ctx.font = `${Math.round(12 * scaleFactor)}px Arial`;
      ctx.fillStyle = lineColor;
      ctx.textAlign = "left";
      ctx.fillText(elevationText, width - padding + 5, y + 4);
      
      const segments = 12;
      const segmentWidth = (width - padding * 2) / segments;
      
      for (let j = 0; j < segments; j++) {
        const x1 = padding + j * segmentWidth;
        const x2 = x1 + segmentWidth;
        const variationY = Math.random() * 1.5 * scaleFactor - 0.75 * scaleFactor;
        
        ctx.beginPath();
        ctx.moveTo(x1, y);
        ctx.lineTo(x2, y + variationY);
        ctx.globalAlpha = 0.5;
        ctx.stroke();
        ctx.globalAlpha = 1.0;
      }
    }
    
    // Draw vertical elevation markers to represent the actual data points
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
    
    const sortedPoints = [...points].sort((a, b) => a.x - b.x);
    
    if (sortedPoints.length >= 2) {
      for (const point of sortedPoints) {
        const elevY = padding + ((height - padding * 2) * (1 - point.normalizedElevation));
        
        ctx.beginPath();
        ctx.moveTo(point.x, height - padding);
        ctx.lineTo(point.x, elevY);
        ctx.stroke();
      }
    }
  }
} 