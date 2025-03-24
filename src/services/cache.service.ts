import { Redis } from "ioredis";
import { BaseService } from "./base.service.js";

export class CacheService extends BaseService {
  private static instance: CacheService;
  private cache: Redis;
  private readonly tweetStatusKey = "tweet_status";

  private constructor() {
    super();
    console.log("Redis URL:", process.env.REDIS_URL);
    this.cache = new Redis(process.env.REDIS_URL!, {
      maxRetriesPerRequest: null,
    });
  }

  public static getInstance(): CacheService {
    if (!CacheService.instance) {
      CacheService.instance = new CacheService();
    }
    return CacheService.instance;
  }

  public async set<T>(key: string, value: T, ttl = 600): Promise<string> {
    return this.cache.set(key, JSON.stringify(value), "EX", ttl);
  }

  public async get<T>(key: string): Promise<T | undefined> {
    const cached = await this.cache.get(key);
    if (cached) {
      return JSON.parse(cached) as T;
    }
    return undefined;
  }

  public async del(key: string): Promise<number> {
    return this.cache.del(key);
  }

  public async getClient(): Promise<Redis> {
    if (!this.cache) {
      throw new Error("Cache client not initialized");
    }
    return this.cache;
  }

  public async start(): Promise<void> {
    if (!process.env.REDIS_URL) {
      throw new Error("REDIS_URL is required");
    }
    try {
      this.cache = new Redis(process.env.REDIS_URL, {
        maxRetriesPerRequest: null,
      });
      console.log("Cache client initialized");
    } catch (error) {
      console.error("Cache initialization error:", error);
      throw new Error("Failed to initialize cache client");
    }
  }

  public async stop(): Promise<void> {
    if (!this.cache) {
      throw new Error("Cache client not initialized");
    }
    await this.cache.quit();
  }

  public async setTweetStatus(
    tweetId: string,
    status: string
  ): Promise<number> {
    return this.cache.hset(this.tweetStatusKey, tweetId, status);
  }

  public async getTweetStatus(tweetId: string): Promise<string | null> {
    return this.cache.hget(this.tweetStatusKey, tweetId);
  }
}
