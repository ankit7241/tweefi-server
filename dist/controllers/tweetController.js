import { scraper } from "../services/twitter/scraper.js";
export const tweetController = {
    postTweet: async (req, res) => {
        try {
            const { text, replyToId } = req.body;
            if (!text) {
                res.status(400).json({ error: "Tweet text is required" });
                return;
            }
            await scraper.sendTweet(text, replyToId);
            res.json({ success: true, message: "Tweet sent successfully" });
        }
        catch (error) {
            console.error("❌ Error sending tweet:", error);
            res.status(500).json({ error: "Failed to send tweet" });
        }
    },
};
//# sourceMappingURL=tweetController.js.map