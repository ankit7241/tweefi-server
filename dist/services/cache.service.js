import { Redis } from "ioredis";
import { BaseService } from "./base.service.js";
export class CacheService extends BaseService {
    constructor() {
        super();
        this.tweetStatusKey = "tweet_status";
        console.log("Redis URL:", process.env.REDIS_URL);
        this.cache = new Redis(process.env.REDIS_URL, {
            maxRetriesPerRequest: null,
        });
    }
    static getInstance() {
        if (!CacheService.instance) {
            CacheService.instance = new CacheService();
        }
        return CacheService.instance;
    }
    async set(key, value, ttl = 600) {
        return this.cache.set(key, JSON.stringify(value), "EX", ttl);
    }
    async get(key) {
        const cached = await this.cache.get(key);
        if (cached) {
            return JSON.parse(cached);
        }
        return undefined;
    }
    async del(key) {
        return this.cache.del(key);
    }
    async getClient() {
        if (!this.cache) {
            throw new Error("Cache client not initialized");
        }
        return this.cache;
    }
    async start() {
        if (!process.env.REDIS_URL) {
            throw new Error("REDIS_URL is required");
        }
        try {
            this.cache = new Redis(process.env.REDIS_URL, {
                maxRetriesPerRequest: null,
            });
            console.log("Cache client initialized");
        }
        catch (error) {
            console.error("Cache initialization error:", error);
            throw new Error("Failed to initialize cache client");
        }
    }
    async stop() {
        if (!this.cache) {
            throw new Error("Cache client not initialized");
        }
        await this.cache.quit();
    }
    async setTweetStatus(tweetId, status) {
        return this.cache.hset(this.tweetStatusKey, tweetId, status);
    }
    async getTweetStatus(tweetId) {
        return this.cache.hget(this.tweetStatusKey, tweetId);
    }
}
//# sourceMappingURL=cache.service.js.map