import { scraper } from "./scraper.js";
export async function sendTweet(text, replyToId) {
    try {
        await scraper.sendTweet(text, replyToId);
        console.log("✅ Tweet sent successfully");
    }
    catch (error) {
        console.error("❌ Failed to send tweet:", error);
        throw error;
    }
}
//# sourceMappingURL=tweet.js.map