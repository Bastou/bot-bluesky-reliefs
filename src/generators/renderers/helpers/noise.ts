/**
 * Simplified noise
 */
export class SimpleNoise {
  private seed: number;
  
  constructor(seed = Math.random() * 10000) {
    this.seed = seed;
  }
  
  /**
   * Simple hash function for pseudo-randomness
   */
  private hash(x: number): number {
    return Math.sin(x) * 43758.5453 % 1;
  }
  
  /**
   * 2D noise function with bilinear interpolation
   */
  private noise2d(x: number, y: number): number {
    const nx = Math.floor(x);
    const ny = Math.floor(y);
    const fx = x - nx;
    const fy = y - ny;
    
    const a = this.hash((nx + this.seed) * 12.9898 + (ny + this.seed) * 78.233);
    const b = this.hash((nx + 1 + this.seed) * 12.9898 + (ny + this.seed) * 78.233);
    const c = this.hash((nx + this.seed) * 12.9898 + (ny + 1 + this.seed) * 78.233);
    const d = this.hash((nx + 1 + this.seed) * 12.9898 + (ny + 1 + this.seed) * 78.233);
    
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);

    const value = a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
    
    return value;
  }
  
  /**
   * Get multi-octave noise value between 0 and 1
   */
  get(x: number, y: number): number {
    const value = 
      this.noise2d(x, y) * 0.6 + 
      this.noise2d(x * 2, y * 2) * 0.3 + 
      this.noise2d(x * 4, y * 4) * 0.1;
      
    return value;
  }
} 