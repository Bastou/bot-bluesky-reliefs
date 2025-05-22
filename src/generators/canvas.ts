import { canvas } from "../deps.ts";
import { Config } from "../config/config.ts";

export interface CanvasOptions {
  width: number;
  height: number;
  backgroundColor?: string;
  title?: string;
}

/**
 * Creates a new canvas with the specified dimensions
 */
export function createCanvas(options: CanvasOptions): canvas.Canvas {
  const { width, height, backgroundColor = "#ffffff" } = options;
  
  const canvasElement = canvas.createCanvas(width, height);
  const ctx = canvasElement.getContext("2d");
  
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, width, height);
  
  return canvasElement;
}

/**
 * Saves the canvas to a file
 */
export async function saveCanvasToFile(
  canvasElement: canvas.Canvas,
  filePath: string,
  format: "png" | "jpeg" = "png"
): Promise<string> {
  try {
    // Make sure directory exists
    const dirPath = filePath.substring(0, filePath.lastIndexOf("/"));
    await Deno.mkdir(dirPath, { recursive: true });

    // Get image data from canvas
    const imageType = format === "png" ? "png" : "jpeg";
    const data = canvasElement.encode(imageType);
    
    // Write data to file
    await Deno.writeFile(filePath, data);
    
    return filePath;
  } catch (error: unknown) {
    console.error("Error saving canvas:", error);
    throw new Error(`Failed to save canvas to file: ${error instanceof Error ? error.message : String(error)}`);
  }
}