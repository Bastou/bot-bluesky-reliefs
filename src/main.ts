import { log } from "./deps.ts";
import { setupConfig } from "./config/config.ts";
import { generateRandomRelief } from "./generators/index.ts";
import { BlueskyBot } from "./bot/bluesky.ts";
import { reverseGeocode } from "./api/geocoding.ts";
import { parse } from "./deps.ts";

async function main() {
  try {
    console.log("Starting Bot Bluesky Reliefs...");
    
    // Parse command line arguments
    const args = parse(Deno.args, {
      boolean: ["skip-post"],
      default: { "skip-post": false },
    });
    
    // Setup configuration
    const config = await setupConfig();
    
    // Initialize logger
    log.info("Bot initialized");
  
    
    // Generate a random relief
    console.log("Generating a relief visualization...");
    const result = await generateRandomRelief(config);
    
    console.log("\nRelief Generation Result:");
    console.log(`- Style: ${result.style}`);
    console.log(`- Center: ${result.centerCoordinate.latitude}, ${result.centerCoordinate.longitude}`);
    console.log(`- Elevation Range: ${result.elevationStats.min}m to ${result.elevationStats.max}m`);
    console.log(`- Image Path: ${result.filePath}`);
    
    log.info("Relief generated");

    console.log("\nFetching location information...");
    const locationResult = await reverseGeocode(
      result.centerCoordinate.latitude,
      result.centerCoordinate.longitude,
      config
    );
    
    // Create a location string based on available data
    let locationString = `${result.centerCoordinate.latitude.toFixed(4)}, ${result.centerCoordinate.longitude.toFixed(4)}`;
    let locationName = "";
    
    if (locationResult.status === "success" && locationResult.data) {
      const locationData = locationResult.data;
      locationName = locationData.name || "";
      
      const locationParts = [];
      if (locationData.name) locationParts.push(locationData.name);
      if (locationData.region) locationParts.push(locationData.region);
      if (locationData.country) locationParts.push(locationData.country);
      
      if (locationParts.length > 0) {
        locationString = locationParts.join(", ");
      }
      
      log.info(`Location identified as: ${locationString}`);
    } else {
      console.log("Could not retrieve location name, using coordinates only");
    }
    
    // Skip posting if requested
    if (args["skip-post"]) {
      console.log("\nSkipping Bluesky post as requested with --skip-post flag");
      console.log("Relief generation completed successfully!");
      return;
    }
    
    // Initialize Bluesky bot
    log.info("Initializing Bluesky bot...");
    if (!config.bluesky.handle || !config.bluesky.appPassword) {
        throw new Error("Missing required Bluesky credentials in config");
    }
    const bot = new BlueskyBot(config.bluesky.handle, config.bluesky.appPassword);
    
    // Login to Bluesky
    console.log("Logging in to Bluesky...");
    await bot.login();
    
    // Create post content with relief information
    const renderNumber = await bot.getNextRenderNumber();
    const paddedNumber = renderNumber < 1000 
      ? renderNumber.toString().padStart(3, '0')
      : renderNumber.toString();
    const postText = `//\\ Relief #${paddedNumber}

Location: ${locationString}
Coordinates: ${result.centerCoordinate.latitude.toFixed(4)}, ${result.centerCoordinate.longitude.toFixed(4)}
Elevation Range: ${result.elevationStats.min}m to ${result.elevationStats.max}m
Terrain type: ${result.terrainType}

#ReliefOfTheDay #DataViz #Geography`;

    // Create alt text for accessibility
    let altText = `Relief visualization in ${result.style} style showing elevation data`;
    if (locationName) {
      altText += ` from ${locationName}`;
    }
    altText += ` at coordinates ${result.centerCoordinate.latitude.toFixed(4)}, ${result.centerCoordinate.longitude.toFixed(4)} with elevation range from ${result.elevationStats.min}m to ${result.elevationStats.max}m.`;
 
    console.log("Posting to Bluesky with postText: ", postText);
    await bot.postWithImage(postText, result.filePath, altText);
    
    log.info("Bot Bluesky Reliefs completed successfully!");
  } catch (error) {
    console.error("Error initializing Bot Bluesky Reliefs:", error);
    Deno.exit(1);
  }
}

if (import.meta.main) {
  main();
} 