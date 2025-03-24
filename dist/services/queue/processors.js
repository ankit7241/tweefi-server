import { scraper } from "../twitter/scraper.js";
import { getAIRecommendation } from "../twitter/ai.js";
import { NgrokService } from "../ngrok.service.js";
import { TwitterService } from "../twitter.service.js";
import { CacheService } from "../cache.service.js";
import { TwitterUserService } from "../twitter-user.service.js";
const TWITTER_TOKEN_CACHE_PREFIX = "twitter_token_";
function extractMentions(text, botUsername) {
    const mentions = text.match(/@(\w+)/g) || [];
    return mentions
        .map((mention) => mention.substring(1))
        .filter((username) => username.toLowerCase() !== botUsername.toLowerCase());
}
async function sendPlayerCard(username, tweetId, action, customMessage) {
    var _a;
    console.log(`🔑 Sending player card to @${username}`);
    const ngrokURL = await NgrokService.getInstance().getUrl();
    const me = await TwitterService.getInstance().me;
    const claimURL = `${process.env.NEXT_PUBLIC_HOSTNAME}/claim/${action}`;
    const slug = Buffer.from(claimURL).toString("base64url") +
        ":" +
        Buffer.from((_a = me === null || me === void 0 ? void 0 : me.username) !== null && _a !== void 0 ? _a : "").toString("base64url");
    const cardURL = `${ngrokURL}/auth/twitter/card/${slug}/index.html`;
    const welcomeMessage = customMessage ||
        "Thanks for reaching out! To get started, please authenticate with Twitter using the link below:";
    const fullResponse = `${welcomeMessage}\n\n${cardURL}`;
    await scraper.sendTweet(fullResponse, tweetId);
    console.log(`✅ Successfully replied to @${username} with player card`);
}
async function replaceMentionsWithAddresses(text, mentions) {
    const twitterUserService = TwitterUserService.getInstance();
    let modifiedText = text;
    const userMapping = [];
    const unregisteredUsers = [];
    for (const username of mentions) {
        const user = await twitterUserService.getUserByUsername(username);
        if (user) {
            userMapping.push({ username, address: user.accountaddress });
            modifiedText = modifiedText.replace(new RegExp(`@${username}`, "gi"), user.accountaddress);
        }
        else {
            unregisteredUsers.push(username);
        }
    }
    return { text: modifiedText, userMapping, unregisteredUsers };
}
export async function processMention(job) {
    const { username, text, id: tweetId, userId } = job.data;
    try {
        console.log(`
🎯 Processing mention:
👤 From: @${username}
💬 Text: ${text}
🆔 Tweet ID: ${tweetId}
    `);
        const isLoggedIn = await scraper.isLoggedIn();
        if (!isLoggedIn) {
            throw new Error("Twitter client not logged in");
        }
        const cacheKey = `${TWITTER_TOKEN_CACHE_PREFIX}${userId}`;
        const accessToken = await CacheService.getInstance().get(cacheKey);
        const sender = await TwitterUserService.getInstance().getUserById(userId);
        const me = await TwitterService.getInstance().me;
        const mentions = extractMentions(text, (me === null || me === void 0 ? void 0 : me.username) || "higherthansudobot");
        if (accessToken && sender) {
            console.log(`🔑 Found existing user for @${username}, processing mentions`);
            const { text: tempProcessedText, unregisteredUsers, } = await replaceMentionsWithAddresses(text, mentions);
            const processedText = tempProcessedText
                .replace(new RegExp(`@${(me === null || me === void 0 ? void 0 : me.username) || "higherthansudobot"}`, "gi"), "")
                .trim();
            if (unregisteredUsers.length > 0) {
                await sendPlayerCard(unregisteredUsers.join(", "), tweetId, "signup", `Hey ${unregisteredUsers.map((u) => "@" + u).join(", ")}! 👋\n\nSomeone wants to send you tokens through Tweefi! 🎉\n\nTo receive them, you'll need to create an Aptos wallet first.\nIt's super easy - just click the link below to get started:`);
                return;
            }
            const recommendation = await getAIRecommendation(`Processed text: ${processedText}.`, userId, accessToken);
            console.log(`💡 Generated response: ${recommendation}`);
            await scraper.sendTweet(recommendation, tweetId);
            console.log(`✅ Successfully replied to @${username} with AI response`);
        }
        else {
            console.log(`🔑 No user found or session expired for @${username}, sending player card`);
            let welcomeMessage;
            if (sender)
                welcomeMessage =
                    "Session expired! Please authenticate with Twitter using the link below:";
            else
                welcomeMessage =
                    "Thanks for reaching out! To get started, please authenticate with Twitter using the link below:";
            await sendPlayerCard(username, tweetId, sender ? "login" : "signup", welcomeMessage);
        }
    }
    catch (error) {
        console.error(`❌ Failed to process mention from @${username}:`, error);
        await CacheService.getInstance().setTweetStatus(tweetId, "error");
        throw error;
    }
}
//# sourceMappingURL=processors.js.map