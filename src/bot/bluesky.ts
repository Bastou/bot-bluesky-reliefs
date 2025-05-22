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
} 