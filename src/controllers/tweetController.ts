import { Request, Response } from "express";
import { scraper } from "../services/twitter/scraper.js";

export const tweetController = {
  postTweet: async (req: Request, res: Response): Promise<void> => {
    try {
      const { text, replyToId } = req.body;

      if (!text) {
        res.status(400).json({ error: "Tweet text is required" });
        return;
      }

      // Send tweet
      await scraper.sendTweet(text, replyToId);

      res.json({ success: true, message: "Tweet sent successfully" });
    } catch (error) {
      console.error("❌ Error sending tweet:", error);
      res.status(500).json({ error: "Failed to send tweet" });
    }
  },
};
