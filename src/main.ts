import { log } from "./deps.ts";
import { setupConfig } from "./config/config.ts";
import { generateRandomRelief, generateReliefFromCoordinate } from "./generators/index.ts";
import { BlueskyBot, isValidCoordinate } from "./bot/bluesky.ts";
import { reverseGeocode } from "./api/geocoding.ts";
import { parse } from "./deps.ts";

async function main() {
  try {
    console.log("Starting Bot Bluesky Reliefs...");
    
    // Parse command line arguments
    const args = parse(Deno.args, {
      boolean: ["skip-post"],
      string: ["coords"],
      default: { 
        "skip-post": false
      },
    });
    
    // Setup configuration
    const config = await setupConfig();
    
    // Initialize logger
    log.info("Bot initialized");
    
    // Check for coordinate simulation from CLI args
    let simulatedCoordinates: { latitude: number; longitude: number; author: string } | null = null;
    
    if (args.coords) {
      const coordParts = args.coords.split(',');
      
      if (coordParts.length !== 2) {
        console.error("Error: Coordinates must be provided in format 'latitude,longitude'");
        console.error("Usage: --coords <latitude>,<longitude>");
        console.error("Example: --coords 48.8566,2.3522 or --coords 64.1821,-99.6629");
        Deno.exit(1);
      }
      
      const latitude = parseFloat(coordParts[0].trim());
      const longitude = parseFloat(coordParts[1].trim());
      
      if (!isValidCoordinate(latitude, longitude)) {
        console.error(`Error: Invalid coordinates provided`);
        console.error(`Latitude must be between -90 and 90, longitude between -180 and 180`);
        console.error(`Provided: lat=${latitude}, lon=${longitude}`);
        Deno.exit(1);
      }
      
      simulatedCoordinates = {
        latitude,
        longitude,
        author: "CLI-simulation"
      };
      
      console.log(`Using simulated coordinates from CLI: ${latitude}, ${longitude}`);
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
    
    // Check for coordinate requests
    let requestedCoordinates = simulatedCoordinates;
    if (!simulatedCoordinates) {
      console.log("Checking for coordinate requests in latest post comments...");
      requestedCoordinates = await bot.getRequestedCoordinates();
    }
    
    // Generate relief visualization
    let result;
    let isRequestedLocation = false;
    let requesterHandle = "";
    
    if (requestedCoordinates) {
      const source = simulatedCoordinates ? "CLI simulation" : `@${requestedCoordinates.author}`;
      console.log(`Using requested coordinates: ${requestedCoordinates.latitude}, ${requestedCoordinates.longitude} (requested by ${source})`);
      
      try {
        result = await generateReliefFromCoordinate(
          { latitude: requestedCoordinates.latitude, longitude: requestedCoordinates.longitude },
          config
        );
        isRequestedLocation = true;
        requesterHandle = requestedCoordinates.author;
      } catch (error) {
        // fall back to random generation
        if (error instanceof Error && error.message.includes("water location")) {
          console.log(`Failed to generate relief for requested coordinates (${error.message.toLowerCase()}). Falling back to random generation...`);
          result = await generateRandomRelief(config);
          isRequestedLocation = false;
          requesterHandle = "";
        } else {
          throw error;
        }
      }
    } else {
      console.log("No coordinate requests found, generating random relief...");
      result = await generateRandomRelief(config);
    }
    
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
    
    // Create post content with relief information
    const renderNumber = await bot.getNextRenderNumber();
    const paddedNumber = renderNumber < 1000 
      ? renderNumber.toString().padStart(3, '0')
      : renderNumber.toString();
    let postText = `//\\ Relief #${paddedNumber}

Location: ${locationString}
Coordinates: ${result.centerCoordinate.latitude.toFixed(4)}, ${result.centerCoordinate.longitude.toFixed(4)}
Elevation Range: ${result.elevationStats.min}m to ${result.elevationStats.max}m
Terrain type: ${result.terrainType}`;

    // Add requester attribution if applicable 
    if (isRequestedLocation && requesterHandle && requesterHandle !== "CLI-simulation") {
      postText += `\n\nRequested by @${requesterHandle}`;
    }

    postText += `\n\n#ReliefOfTheDay #DataViz #Geography`;

    // Create alt text for accessibility
    let altText = `Relief visualization in ${result.style} style showing elevation data`;
    if (locationName) {
      altText += ` from ${locationName}`;
    }
    altText += ` at coordinates ${result.centerCoordinate.latitude.toFixed(4)}, ${result.centerCoordinate.longitude.toFixed(4)} with elevation range from ${result.elevationStats.min}m to ${result.elevationStats.max}m.`;
    
    if (isRequestedLocation && requesterHandle && requesterHandle !== "CLI-simulation") {
      altText += ` This location was requested by @${requesterHandle}.`;
    }

    console.log("\n=== POST CONTENT ===");
    console.log(postText);
    console.log("\n=== ALT TEXT ===");
    console.log(altText);
    console.log("===================\n");
    
    // Skip posting if requested
    if (args["skip-post"]) {
      console.log("Skipping Bluesky post as requested with --skip-post flag");
      console.log("Relief generation completed successfully!");
      return;
    }
    
    console.log("Posting to Bluesky...");
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