import { Router } from "express";
import { tweetController } from "../controllers/tweetController.js";
const router = Router();
router.post("/tweet", tweetController.postTweet);
export default router;
//# sourceMappingURL=tweet.routes.js.map