import { loadEnv, path, fs } from "../deps.ts";

export const BASE_RENDER_SIZE = 675;
export const RENDER_SIZE = 2000;

// Define the configuration interface
export interface Config {
  // API credentials
  apis: {
    elevation: {
      provider: string;
      apiKey?: string;
      baseUrl: string;
      rateLimit: number;
      requestTimeout: number;
      retryAttempts: number;
      retryDelay: number;
    };
    geocoding: {
      baseUrl: string;
      rateLimit: number;
    };
  };
  
  // Geographic constraints
  geographic: {
    minLatitude: number;
    maxLatitude: number;
    minLongitude: number;
    maxLongitude: number;
    areaSize: number; // in kilometers
    resolution: number; // in kilometers
    minElevationRange: number; // minimum elevation range in meters for interesting renders
  };
  
  // Image generation settings
  image: {
    width: number;
    height: number;
    styles: string[];
    defaultStyle: string;
    scaleFactor?: number;
  };
  
  // Bluesky integration
  bluesky: {
    handle: string;
    password?: string;
    appPassword?: string;
    baseUrl: string;
    postFrequency: string; // cron expression
  };
  
  // System settings
  system: {
    cacheDir: string;
    logLevel: string;
  };
}

// Default configuration
const defaultConfig: Config = {
  apis: {
    elevation: {
      provider: "opentopodata",
      baseUrl: "https://api.opentopodata.org/v1/",
      rateLimit: 100,
      requestTimeout: 10000, // 10 seconds
      retryAttempts: 3,
      retryDelay: 2000, // 2 seconds
    },
    geocoding: {
      baseUrl: "https://nominatim.openstreetmap.org",
      rateLimit: 60,
    },
  },
  geographic: {
    minLatitude: -85,
    maxLatitude: 85,
    minLongitude: -180,
    maxLongitude: 180,
    areaSize: 5, // 10km area
    resolution: 30, // square grid resolution
    minElevationRange: 80, // minimum elevation range in meters
  },
  image: {
    width: RENDER_SIZE,
    height: RENDER_SIZE,
    defaultStyle: "perspective",
    styles: ["dotgrid", "graph", "perspective"],
    scaleFactor: RENDER_SIZE / BASE_RENDER_SIZE, // Calculate scale factor from base size
  },
  bluesky: {
    handle: "reliefsbot.bsky.social",
    baseUrl: "https://bsky.social",
    postFrequency: "0 12 * * *", // Daily at noon
  },
  system: {
    cacheDir: "./cache",
    logLevel: "INFO",
  },
};

/**
 * Load and setup the application configuration
 */
export async function setupConfig(): Promise<Config> {
  try {
    // Load environment variables with allowEmptyValues to make the new variables optional
    const env = await loadEnv({ 
      allowEmptyValues: true,
      export: true,
      examplePath: null // Don't use example file
    });
    
    // Start with default config
    const config = { ...defaultConfig };
    
    // Override with environment variables
    if (env.ELEVATION_API_KEY) {
      config.apis.elevation.apiKey = env.ELEVATION_API_KEY;
    }
    
    if (env.ELEVATION_PROVIDER) {
      config.apis.elevation.provider = env.ELEVATION_PROVIDER;
    }
    
    if (env.ELEVATION_BASE_URL) {
      config.apis.elevation.baseUrl = env.ELEVATION_BASE_URL;
    }
    
    if (env.BLUESKY_HANDLE) {
      config.bluesky.handle = env.BLUESKY_HANDLE;
    }
    
    if (env.BLUESKY_APP_PASSWORD) {
      config.bluesky.appPassword = env.BLUESKY_APP_PASSWORD;
    }
    
    // Create cache directory if it doesn't exist
    const cacheDir = path.resolve(config.system.cacheDir);
    try {
      await fs.ensureDir(cacheDir);
      
      // Ensure the images directory exists
      const imagesDir = path.join(cacheDir, "images");
      await fs.ensureDir(imagesDir);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn(`Failed to create cache directory: ${errorMessage}`);
    }
    
    return config;
  } catch (error) {
    console.error("Error loading configuration:", error);
    throw error;
  }
} 