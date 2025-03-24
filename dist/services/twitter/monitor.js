var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
import { scraper } from "./scraper.js";
import { SearchMode } from "agent-twitter-client";
import { queueMention } from "../queue/index.js";
import dotenv from "dotenv";
import { CacheService } from "../cache.service.js";
dotenv.config();
const cacheService = CacheService.getInstance();
await cacheService.start();
async function checkMentions() {
    var _a, e_1, _b, _c;
    try {
        const lastTweetFetchedAt = await cacheService.get("last_tweet_fetched_at");
        console.log("Last tweet fetched at:", new Date(Number(lastTweetFetchedAt)).toLocaleString());
        console.log("\n🔍 Checking for new mentions...");
        const query = `to:${process.env.TWITTER_USERNAME} -is:retweet`;
        const maxMentions = 5;
        try {
            for (var _d = true, _e = __asyncValues(scraper.searchTweets(query, maxMentions, SearchMode.Latest)), _f; _f = await _e.next(), _a = _f.done, !_a; _d = true) {
                _c = _f.value;
                _d = false;
                const tweet = _c;
                if (tweet.username === process.env.TWITTER_USERNAME) {
                    continue;
                }
                if (!tweet.id || !tweet.text || !tweet.username || !tweet.userId) {
                    console.log("⚠️ Skipping tweet with missing data");
                    continue;
                }
                const tweetStatus = await cacheService.getTweetStatus(tweet.id);
                if (tweetStatus === "processed" || tweetStatus === "processing") {
                    continue;
                }
                await cacheService.setTweetStatus(tweet.id, "processing");
                console.log(`
📥 New mention found:
👤 From: @${tweet.username}
💬 Text: ${tweet.text}
🆔 Tweet ID: ${tweet.id}
      `);
                try {
                    await queueMention({
                        username: tweet.username,
                        text: tweet.text,
                        id: tweet.id,
                        userId: tweet.userId,
                    });
                    console.log(`✅ Queued mention from @${tweet.username} for processing`);
                    await cacheService.setTweetStatus(tweet.id, "processed");
                }
                catch (processingError) {
                    console.error(`❌ Error processing tweet ID: ${tweet.id}`, processingError);
                    await cacheService.setTweetStatus(tweet.id, "error");
                }
            }
        }
        catch (e_1_1) { e_1 = { error: e_1_1 }; }
        finally {
            try {
                if (!_d && !_a && (_b = _e.return)) await _b.call(_e);
            }
            finally { if (e_1) throw e_1.error; }
        }
    }
    catch (error) {
        console.error("❌ Error checking mentions:", error);
    }
}
export const startMentionMonitor = () => {
    console.log("🤖 Starting mention monitor...");
    setInterval(checkMentions, 10 * 1000);
};
//# sourceMappingURL=monitor.js.map