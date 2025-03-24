import { Scraper } from "agent-twitter-client";
import dotenv from "dotenv";
dotenv.config();
export const scraper = new Scraper();
export const initializeScraper = async () => {
    try {
        console.log(" Initializing Twitter client...");
        const username = process.env.TWITTER_USERNAME;
        const password = process.env.TWITTER_PASSWORD;
        const email = process.env.TWITTER_EMAIL;
        if (!username || !password) {
            throw new Error("Twitter credentials not found in environment variables");
        }
        await scraper.login(username, password, email, undefined, process.env.TWITTER_APP_KEY, process.env.TWITTER_APP_SECRET, process.env.TWITTER_COOKIES, process.env.TWITTER_CT0);
        console.log(" Successfully logged in with credentials");
    }
    catch (error) {
        console.error(" Twitter client initialization failed:", error);
        throw error;
    }
};
export const sendTweet = async (text, replyToId) => {
    try {
        console.log(` Sending tweet${replyToId ? " as reply" : ""}...`);
        const result = await scraper.sendTweet(text, replyToId);
        console.log(" Tweet sent successfully");
        return result;
    }
    catch (error) {
        console.error(" Failed to send tweet:", error);
        throw error;
    }
};
initializeScraper().catch(console.error);
//# sourceMappingURL=scraper.js.map