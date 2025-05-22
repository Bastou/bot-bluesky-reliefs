import { Config } from "../config/config.ts";

export interface LocationData {
  name: string;
  country: string;
  countryCode: string;
  region?: string;
  locality?: string;
  latitude: number;
  longitude: number;
  formattedAddress?: string;
}

export interface GeocodingResponse {
  status: string;
  data?: LocationData;
  error?: string;
}

/**
 * Performs reverse geocoding for a given coordinate using Nominatim
 */
export async function reverseGeocode(
  latitude: number,
  longitude: number,
  config: Config
): Promise<GeocodingResponse> {
  try {
    const { baseUrl, rateLimit } = config.apis.geocoding;
    
    // Build the API URL for Nominatim
    const url = `${baseUrl}/reverse?format=json&lat=${latitude}&lon=${longitude}`;
    
    // Add required headers for Nominatim
    const headers = {
      "Accept": "application/json",
      "User-Agent": "BotBlueskyReliefs/1.0"
    };
    
    // Make the API request
    const response = await fetch(url, { headers });
    
    if (!response.ok) {
      throw new Error(`API returned ${response.status}: ${response.statusText}`);
    }
    
    // Parse the response
    const data = await response.json();
    
    // Normalize the response format
    return normalizeNominatimResponse(data);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Error in reverse geocoding: ${errorMessage}`);
    return {
      status: "error",
      error: errorMessage,
    };
  }
}

/**
 * Normalizes the response from Nominatim
 */
function normalizeNominatimResponse(data: any): GeocodingResponse {
  try {
    if (!data || !data.address) {
      return {
        status: "error",
        error: "No results found",
      };
    }
    
    const address = data.address;
    
    return {
      status: "success",
      data: {
        name: data.name || data.display_name.split(",")[0],
        country: address.country || "Unknown",
        countryCode: address.country_code || "unknown",
        region: address.state || address.county || undefined,
        locality: address.city || address.town || address.village || undefined,
        latitude: Number(data.lat),
        longitude: Number(data.lon),
        formattedAddress: data.display_name,
      },
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Error normalizing geocoding data: ${errorMessage}`);
    return {
      status: "error",
      error: `Failed to normalize response: ${errorMessage}`,
    };
  }
}

/**
 * Test function to verify the geocoding API is working
 */
export async function testGeocodingAPI(config: Config): Promise<void> {
  console.log("Testing Nominatim geocoding API...");
  
  // Test coordinates (Eiffel Tower)
  const latitude = 48.8584;
  const longitude = 2.2945;
  
  const result = await reverseGeocode(latitude, longitude, config);
  
  if (result.status === "success" && result.data) {
    console.log("Geocoding API test successful!");
    console.log(`Location at ${latitude}, ${longitude}:`);
    console.log(`Name: ${result.data.name}`);
    console.log(`Country: ${result.data.country} (${result.data.countryCode})`);
    if (result.data.region) console.log(`Region: ${result.data.region}`);
    if (result.data.locality) console.log(`Locality: ${result.data.locality}`);
    if (result.data.formattedAddress) console.log(`Address: ${result.data.formattedAddress}`);
  } else {
    console.error("Geocoding API test failed:", result.error);
  }
} 