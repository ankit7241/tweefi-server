import { scraper } from "./scraper.js";
import { SearchMode } from "agent-twitter-client";
import { queueMention } from "../queue/index.js";
import dotenv from "dotenv";
// import { fileURLToPath } from "url";
// import { dirname, resolve } from "path";
import { CacheService } from "../cache.service.js";
// import { TwitterService } from "../twitter.service.js";

// const __filename = fileURLToPath(import.meta.url);
// const __dirname = dirname(__filename);

// Load environment variables from root .env file
// dotenv.config({
//   path: resolve(__dirname, "../../../.env"),
// });

dotenv.config();

const cacheService = CacheService.getInstance();
await cacheService.start();

async function checkMentions(): Promise<void> {
  try {
    const lastTweetFetchedAt = await cacheService.get("last_tweet_fetched_at");
    console.log(
      "Last tweet fetched at:",
      new Date(Number(lastTweetFetchedAt)).toLocaleString()
    );
    // const timeSinceLastFetch = Date.now() - Number(lastTweetFetchedAt);
    // if (Number(lastTweetFetchedAt) > 0 && timeSinceLastFetch < 16 * 60 * 1000) {
    //   // keeping 1 minute more as buffer
    //   console.log(
    //     `🔍 Skipping check for new mentions... [Time since last fetch: ${Math.round(timeSinceLastFetch / 1000)}s]`
    //   );
    //   return;
    // }
    console.log("\n🔍 Checking for new mentions...");
    const query = `to:${process.env.TWITTER_USERNAME} -is:retweet`;
    // console.log("Query: %s", query);
    const maxMentions = 5;
    // for await (const tweet of scraper.getUserTweets(query, maxMentions)) {
    // const v2Scraper = await TwitterService.getInstance();
    for await (const tweet of scraper.searchTweets(
      query,
      maxMentions,
      SearchMode.Latest
    )) {
      // for await (const tweet of v2Scraper.getMentions()) {
      // console.log("Fetched:", tweet.id);
      // Skip our own tweets
      if (tweet.username === process.env.TWITTER_USERNAME) {
        continue;
      }

      // Skip tweets without required data
      if (!tweet.id || !tweet.text || !tweet.username || !tweet.userId) {
        console.log("⚠️ Skipping tweet with missing data");
        continue;
      }

      // Check if tweet has already been processed
      const tweetStatus = await cacheService.getTweetStatus(tweet.id);
      if (tweetStatus === "processed" || tweetStatus === "processing") {
        continue;
      }

      // Set tweet status to 'processing'
      await cacheService.setTweetStatus(tweet.id, "processing");

      console.log(`
📥 New mention found:
👤 From: @${tweet.username}
💬 Text: ${tweet.text}
🆔 Tweet ID: ${tweet.id}
      `);

      try {
        // Queue the mention for processing
        await queueMention({
          username: tweet.username,
          text: tweet.text,
          id: tweet.id,
          userId: tweet.userId,
        });
        console.log(`✅ Queued mention from @${tweet.username} for processing`);

        // Set tweet status to 'processed'
        await cacheService.setTweetStatus(tweet.id, "processed");
      } catch (processingError) {
        console.error(
          `❌ Error processing tweet ID: ${tweet.id}`,
          processingError
        );

        await cacheService.setTweetStatus(tweet.id, "error");
      }
    }
  } catch (error) {
    console.error("❌ Error checking mentions:", error);
  }
}

// Export the monitor function
export const startMentionMonitor = () => {
  console.log("🤖 Starting mention monitor...");
  // Check every 10 seconds
  setInterval(checkMentions, 10 * 1000);
};
