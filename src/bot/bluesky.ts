import { AtpAgent, RichText } from 'npm:@atproto/api';

export class BlueskyBot {
  private agent: AtpAgent;
  private handle: string;
  private appPassword: string;

  constructor(handle: string, appPassword: string) {
    this.handle = handle;
    this.appPassword = appPassword;
    this.agent = new AtpAgent({ service: 'https://bsky.social' });
  }

  async login() {
    try {
      await this.agent.login({
        identifier: this.handle,
        password: this.appPassword,
      });
      console.log('Successfully logged in to Bluesky');
    } catch (error) {
      console.error('Failed to login:', error);
      throw error;
    }
  }

  async post(text: string) {
    try {
      const rt = new RichText({ text });
      await rt.detectFacets(this.agent);
      
      const response = await this.agent.post({
        text: rt.text,
        facets: rt.facets,
      });
      console.log('Successfully posted to Bluesky');
      return response;
    } catch (error) {
      console.error('Failed to post:', error);
      throw error;
    }
  }

  async postWithImage(text: string, imagePath: string, alt: string) {
    try {
      const rt = new RichText({ text });
      await rt.detectFacets(this.agent);
      
      const imageBytes = await Deno.readFile(imagePath);
      
      const uploadResponse = await this.agent.uploadBlob(imageBytes, {
        encoding: 'image/jpeg',
      });
      
      const response = await this.agent.post({
        text: rt.text,
        facets: rt.facets,
        embed: {
          $type: 'app.bsky.embed.images',
          images: [
            {
              alt: alt,
              image: uploadResponse.data.blob,
            },
          ],
        },
      });
      
      console.log('Successfully posted image to Bluesky');
      return response;
    } catch (error) {
      console.error('Failed to post with image:', error);
      throw error;
    }
  }

  async getLastRenderNumber(): Promise<number> {
    try {
      // Fetch only the last 5 posts from the user's timeline
      const response = await this.agent.getAuthorFeed({
        actor: this.handle,
        limit: 5
      });

      // Look for posts that start with "//\" followed by any text and then a number pattern
      const renderNumberRegex = /^\/\/\\\s+.*?#(\d+)/;
      
      for (const feedView of response.data.feed) {
        const postText = feedView.post?.record?.text;
        if (typeof postText === 'string') {
          const match = postText.match(renderNumberRegex);
          if (match) {
            return parseInt(match[1], 10);
          }
        }
      }

      return 0;
    } catch (error) {
      console.error('Failed to fetch last render number:', error);
      return 0;
    }
  }

  async getNextRenderNumber(): Promise<number> {
    const lastNumber = await this.getLastRenderNumber();
    return lastNumber + 1;
  }

  /**
   * Get comments/replies from the latest post 
   */
  async getLatestPostComments(): Promise<Array<{ text: string; author: string; timestamp: string }>> {
    try {
      // First get the latest post
      const response = await this.agent.getAuthorFeed({
        actor: this.handle,
        limit: 1
      });

      if (!response.data.feed || response.data.feed.length === 0) {
        console.log("No posts found");
        return [];
      }

      const latestPost = response.data.feed[0];
      const postUri = latestPost.post.uri;
      
      console.log(`Checking comments for latest post: ${postUri}`);

      // Get replies to the latest post
      const repliesResponse = await this.agent.getPostThread({
        uri: postUri,
        depth: 1
      });

      const comments: Array<{ text: string; author: string; timestamp: string }> = [];
      
      // Extract replies from the thread
      if (repliesResponse.data.thread && '$type' in repliesResponse.data.thread && 
          repliesResponse.data.thread.$type === 'app.bsky.feed.defs#threadViewPost' &&
          'replies' in repliesResponse.data.thread && repliesResponse.data.thread.replies) {
        for (const reply of repliesResponse.data.thread.replies) {
          if (reply && '$type' in reply && 
              reply.$type === 'app.bsky.feed.defs#threadViewPost' &&
              'post' in reply && reply.post?.record?.text && reply.post?.author?.handle) {
            comments.push({
              text: reply.post.record.text as string,
              author: reply.post.author.handle as string,
              timestamp: (reply.post.record as any)?.createdAt || new Date().toISOString()
            });
          }
        }
      }

      console.log(`Found ${comments.length} comments on latest post`);
      return comments;
    } catch (error) {
      console.error('Failed to fetch comments:', error);
      return [];
    }
  }

  /**
   * Check if there are any coordinate requests in the latest post comments
   */
  async getRequestedCoordinates(): Promise<{ latitude: number; longitude: number; author: string } | null> {
    try {
      const comments = await this.getLatestPostComments();
      
      // Sort comments by timestamp to get the earliest request (first-come, first-served)
      const sortedComments = comments.sort((a, b) => 
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
      
      for (const comment of sortedComments) {
        const coordinates = parseCoordinatesFromText(comment.text);
        if (coordinates) {
          console.log(`Found coordinate request from @${comment.author}: ${coordinates.latitude}, ${coordinates.longitude}`);
          return {
            ...coordinates,
            author: comment.author
          };
        }
      }
      
      return null;
    } catch (error) {
      console.error('Error checking for coordinate requests:', error);
      return null;
    }
  }
}

/**
 * Parse coordinates from comment text
 * Supports format: "45.8326, 6.8652"
 */
function parseCoordinatesFromText(text: string): { latitude: number; longitude: number } | null {
  const cleanText = text.trim();
  
  // Simple decimal coordinates "45.8326, 6.8652" or "48, 2"
  const simplePattern = /(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)/;
  const simpleMatch = cleanText.match(simplePattern);
  
  if (simpleMatch) {
    const lat = parseFloat(simpleMatch[1]);
    const lon = parseFloat(simpleMatch[2]);
    
    if (isValidCoordinate(lat, lon)) {
      return { latitude: lat, longitude: lon };
    }
  }
  
  return null;
}

/**
 * Validate that coordinates are within valid ranges
 */
export function isValidCoordinate(latitude: number, longitude: number): boolean {
  return (
    !isNaN(latitude) && 
    !isNaN(longitude) &&
    latitude >= -90 && 
    latitude <= 90 && 
    longitude >= -180 && 
    longitude <= 180
  );
} 