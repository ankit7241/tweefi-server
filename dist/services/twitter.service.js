var __await = (this && this.__await) || function (v) { return this instanceof __await ? (this.v = v, this) : new __await(v); }
var __asyncGenerator = (this && this.__asyncGenerator) || function (thisArg, _arguments, generator) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var g = generator.apply(thisArg, _arguments || []), i, q = [];
    return i = Object.create((typeof AsyncIterator === "function" ? AsyncIterator : Object).prototype), verb("next"), verb("throw"), verb("return", awaitReturn), i[Symbol.asyncIterator] = function () { return this; }, i;
    function awaitReturn(f) { return function (v) { return Promise.resolve(v).then(f, reject); }; }
    function verb(n, f) { if (g[n]) { i[n] = function (v) { return new Promise(function (a, b) { q.push([n, v, a, b]) > 1 || resume(n, v); }); }; if (f) i[n] = f(i[n]); } }
    function resume(n, v) { try { step(g[n](v)); } catch (e) { settle(q[0][3], e); } }
    function step(r) { r.value instanceof __await ? Promise.resolve(r.value.v).then(fulfill, reject) : settle(q[0][2], r); }
    function fulfill(value) { resume("next", value); }
    function reject(value) { resume("throw", value); }
    function settle(f, v) { if (f(v), q.shift(), q.length) resume(q[0][0], q[0][1]); }
};
import { BaseService } from "./base.service.js";
import { Scraper } from "agent-twitter-client";
import axios from "axios";
import fs from "fs/promises";
import { isAxiosError } from "axios";
import { join, dirname } from "path";
import { CacheService } from "./cache.service.js";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const twitterCookiesPath = join(__dirname, "..", "..", "..", "twitter-cookies.json");
export class TwitterService extends BaseService {
    constructor() {
        super();
        this.scraper = null;
        this.isConnected = false;
        this.me = undefined;
    }
    static getInstance() {
        if (!TwitterService.instance) {
            TwitterService.instance = new TwitterService();
        }
        return TwitterService.instance;
    }
    async start() {
        try {
            console.log("[TwitterService] Starting service...");
            if (!(await fs.stat(twitterCookiesPath).catch(() => false))) {
                throw new Error("Twitter cookies not found. Please run the `pnpm login-x` script first.");
            }
            console.log("[TwitterService] Loading Twitter cookies from:", twitterCookiesPath);
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
        }
        catch (error) {
            console.error("[TwitterService] Error:", error);
            throw new Error("Twitter cookies not found. Please run the `pnpm letsgo` script first.");
        }
    }
    async stop() {
        if (this.isConnected && this.scraper) {
            await this.scraper.clearCookies();
            this.isConnected = false;
        }
    }
    getScraper() {
        if (!this.scraper) {
            throw new Error("Twitter service not started");
        }
        return this.scraper;
    }
    getMentions() {
        return __asyncGenerator(this, arguments, function* getMentions_1() {
            var _a, _b, _c, _d;
            try {
                const _axiosClient = axios.create({
                    headers: {
                        Authorization: `Bearer ${process.env.TWITTER_BEARER_TOKEN}`,
                    },
                    baseURL: "https://api.twitter.com/2",
                });
                const { data } = yield __await(_axiosClient.get(`/users/${(_a = this.me) === null || _a === void 0 ? void 0 : _a.userId}/mentions?expansions=author_id&tweet.fields=author_id,id,text`, {
                    params: {
                        max_results: 5,
                    },
                }));
                console.log("[TwitterService] Fetched mentions:", data.data);
                if (!data.data || !Array.isArray(data.data)) {
                    console.warn("[TwitterService] No mentions data found or invalid format");
                    return yield __await(void 0);
                }
                const cacheService = CacheService.getInstance();
                yield __await(cacheService.set("last_tweet_fetched_at", Date.now(), 30 * 24 * 60 * 60));
                for (const tweet of data.data) {
                    const author = (_c = (_b = data.includes) === null || _b === void 0 ? void 0 : _b.users) === null || _c === void 0 ? void 0 : _c.find((user) => user.id === tweet.author_id);
                    yield yield __await({
                        id: tweet.id,
                        text: tweet.text,
                        userId: tweet.author_id,
                        username: author === null || author === void 0 ? void 0 : author.username,
                        hashtags: [],
                        mentions: [],
                        photos: [],
                        urls: [],
                        videos: [],
                        thread: [],
                    });
                }
            }
            catch (error) {
                const cacheService = CacheService.getInstance();
                yield __await(cacheService.set("last_tweet_fetched_at", Date.now(), 30 * 24 * 60 * 60));
                if (isAxiosError(error)) {
                    console.error("[TwitterService] Axios error:", (_d = error.response) === null || _d === void 0 ? void 0 : _d.data);
                }
                else {
                    console.error("[TwitterService] Error getting mentions:", error);
                }
            }
        });
    }
}
//# sourceMappingURL=twitter.service.js.map