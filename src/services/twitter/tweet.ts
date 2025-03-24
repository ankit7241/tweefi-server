import { scraper } from "./scraper.js";

export async function sendTweet(text: string, replyToId?: string) {
  try {
    await scraper.sendTweet(text, replyToId);
    console.log("✅ Tweet sent successfully");
  } catch (error) {
    console.error("❌ Failed to send tweet:", error);
    throw error;
  }
}
