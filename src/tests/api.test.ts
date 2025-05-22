import { setupConfig } from "../config/config.ts";
import { testElevationAPI } from "../api/elevation.ts";
import { testGeocodingAPI as testNominatimAPI } from "../api/geocoding.ts";

async function runApiTests(): Promise<void> {
  console.log("=== Bot Bluesky Reliefs: API Tests ===");
  
  // Load config
  console.log("\nLoading configuration...");
  const config = await setupConfig();
  console.log("Configuration loaded successfully");
  
  // Test elevation API
  console.log("\n=== Testing Elevation API ===");
  await testElevationAPI(config);
  
  // Test geocoding API
  console.log("\n=== Testing Geocoding API ===");
  await testNominatimAPI(config);
  
  // Test rate limits
  console.log("\n=== Testing Rate Limits ===");
  console.log("Testing elevation API rate limits...");
  await testElevationAPI(config);
  
  // Add a small delay between tests
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  console.log("\nTesting geocoding API rate limits...");
  await testNominatimAPI(config);
  
  console.log("\n=== API Tests Completed ===");
}

// Run tests
if (import.meta.main) {
  runApiTests().catch((error: unknown) => {
    console.error("API tests failed:", error);
    Deno.exit(1);
  });
} 