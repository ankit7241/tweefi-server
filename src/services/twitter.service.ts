import { BaseService } from "./base.service.js";
import { Profile, Scraper, Tweet } from "agent-twitter-client";
import axios from "axios";
import fs from "fs/promises";
import { isAxiosError } from "axios";
import { join, dirname } from "path";
import { AnyType } from "src/utils.js";
import { CacheService } from "./cache.service.js";
import { fileURLToPath } from "url";

// const __dirname = dirname(new URL(import.meta.url).pathname);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const twitterCookiesPath = join(
  __dirname,
  "..",
  "..",
  "..",
  "twitter-cookies.json"
);

export class TwitterService extends BaseService {
  private static instance: TwitterService;
  private scraper: Scraper | null = null;
  private isConnected: boolean = false;
  public me: Profile | undefined = undefined;

  private constructor() {
    super();
  }

  public static getInstance(): TwitterService {
    if (!TwitterService.instance) {
      TwitterService.instance = new TwitterService();
    }
    return TwitterService.instance;
  }

  public async start(): Promise<void> {
    try {
      console.log("[TwitterService] Starting service...");
      if (!(await fs.stat(twitterCookiesPath).catch(() => false))) {
        throw new Error(
          "Twitter cookies not found. Please run the `pnpm login-x` script first."
        );
      }
      console.log(
        "[TwitterService] Loading Twitter cookies from:",
        twitterCookiesPath
      );
      const cookieJson = await fs.readFile(twitterCookiesPath, "utf-8");
      const cookiesJSON = JSON.parse(cookieJson);
      this.scraper = new Scraper();
      await this.scraper.setCookies(cookiesJSON.cookies);
      console.log("[TwitterService] Starting service with existing cookies...");
      const connected = await this.scraper.isLoggedIn();
      if (!connected) {
        throw new Error("Failed to login with existing cookies.");
      }
      this.me = await this.scraper.me();
      this.isConnected = true;
    } catch (error) {
      console.error("[TwitterService] Error:", error);
      throw new Error(
        "Twitter cookies not found. Please run the `pnpm letsgo` script first."
      );
    }
  }

  public async stop(): Promise<void> {
    if (this.isConnected && this.scraper) {
      await this.scraper.clearCookies();
      this.isConnected = false;
    }
  }

  public getScraper(): Scraper {
    if (!this.scraper) {
      throw new Error("Twitter service not started");
    }
    return this.scraper;
  }

  public async *getMentions(): AsyncGenerator<Tweet> {
    try {
      const _axiosClient = axios.create({
        headers: {
          Authorization: `Bearer ${process.env.TWITTER_BEARER_TOKEN}`,
        },
        baseURL: "https://api.twitter.com/2",
      });
      const { data } = await _axiosClient.get(
        `/users/${this.me?.userId}/mentions?expansions=author_id&tweet.fields=author_id,id,text`,
        {
          params: {
            max_results: 5,
          },
        }
      );
      console.log("[TwitterService] Fetched mentions:", data.data);

      if (!data.data || !Array.isArray(data.data)) {
        console.warn(
          "[TwitterService] No mentions data found or invalid format"
        );
        return;
      }
      const cacheService = CacheService.getInstance();
      await cacheService.set(
        "last_tweet_fetched_at",
        Date.now(),
        30 * 24 * 60 * 60 // 30 days
      );
      for (const tweet of data.data) {
        const author = data.includes?.users?.find(
          (user: AnyType) => user.id === tweet.author_id
        );
        yield {
          id: tweet.id,
          text: tweet.text,
          userId: tweet.author_id,
          username: author?.username,
          hashtags: [],
          mentions: [],
          photos: [],
          urls: [],
          videos: [],
          thread: [],
        };
      }
    } catch (error) {
      const cacheService = CacheService.getInstance();
      await cacheService.set(
        "last_tweet_fetched_at",
        Date.now(),
        30 * 24 * 60 * 60 // 30 days
      );
      if (isAxiosError(error)) {
        console.error("[TwitterService] Axios error:", error.response?.data);
      } else {
        console.error("[TwitterService] Error getting mentions:", error);
      }
      // In a generator, we don't return an empty array on error
      // Instead, we just finish the generator
    }
  }
}
