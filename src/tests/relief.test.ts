import { setupConfig } from "../config/config.ts";
import { generateReliefFromCoordinate } from "../generators/index.ts";

interface Location {
  latitude: number;
  longitude: number;
}

async function testLocationRelief(location: Location, config: any, gridResolution?: number, style?: string): Promise<void> {
  console.log("\n=== Generating Relief for Location ===");
  console.log(`Coordinates: ${location.latitude}, ${location.longitude}`);
  if (gridResolution) {
    console.log(`Grid Resolution: ${gridResolution}`);
  }
  
  try {
    // Use provided style or test multiple styles
    const styles = style ? [style] : ["graph", "dotgrid", "perspective"];
    
    for (const currentStyle of styles) {
      console.log(`\nGenerating ${currentStyle} style visualization...`);
      const result = await generateReliefFromCoordinate(
        location,
        config,
        currentStyle,
        gridResolution
      );
      console.log(`${currentStyle.toUpperCase()} style generation successful!`);
      console.log(`Elevation range: ${result.elevationStats.min}m to ${result.elevationStats.max}m`);
      console.log(`Image saved to: ${result.filePath}`);
    }
  } catch (error) {
    console.error("Error generating relief:", error);
    throw error;
  }
}

async function runAllTests(): Promise<void> {
  console.log("=== Bot Bluesky Reliefs: Comprehensive Tests ===");
  
  // Load config
  console.log("\nLoading configuration...");
  const config = await setupConfig();
  console.log("Configuration loaded successfully");

  // Test custom location if provided
  const args = Deno.args;
  if (args.length >= 3) {
    const latitude = parseFloat(args[0]);
    const longitude = parseFloat(args[1]);
    const gridResolution = parseInt(args[2]);
    const style = args.length >= 4 ? args[3] : undefined;
    
    if (!isNaN(latitude) && !isNaN(longitude) && !isNaN(gridResolution)) {
      if (latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180 && gridResolution > 0) {
        console.log("\n=== Testing Custom Location Relief ===");
        await testLocationRelief({ latitude, longitude }, config, gridResolution, style);
      } else {
        console.warn("Invalid custom location parameters provided, skipping custom location test");
      }
    }
  } else {
  // Test Mont Blanc
  console.log("\n=== Testing Mont Blanc Relief ===");
  await testLocationRelief({
    latitude: 45.8326,
    longitude: 6.8652,
  }, config);
  
  }
  
  console.log("\n=== All Tests Completed ===");
}

// Run tests
if (import.meta.main) {
  runAllTests().catch((error: unknown) => {
    console.error("Tests failed:", error);
    Deno.exit(1);
  });
} 