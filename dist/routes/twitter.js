import { Router } from "express";
import axios, { AxiosError } from "axios";
import crypto from "crypto";
import { NgrokService } from "../services/ngrok.service.js";
import { CacheService } from "../services/cache.service.js";
import { getCardHTML, getCollablandApiUrl } from "../utils.js";
import { WowXYZERC20__factory } from "../contracts/types/index.js";
import { parseEther, toBeHex } from "ethers";
import { TwitterService } from "../services/twitter.service.js";
import { TwitterUserService } from "../services/twitter-user.service.js";
import { LitAptosSigner } from "../services/aptos.service.js";
const router = Router();
const twitterUserService = TwitterUserService.getInstance();
function generateCodeVerifier() {
    const buffer = crypto.randomBytes(32);
    const verifier = buffer
        .toString("base64")
        .replace(/[^a-zA-Z0-9]/g, "")
        .substring(0, 128);
    return verifier;
}
function generateCodeChallenge(verifier) {
    const hash = crypto.createHash("sha256");
    hash.update(verifier);
    const rawDigest = hash.digest("base64");
    return rawDigest
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=/g, "");
}
router.post("/init", async (req, res) => {
    try {
        const ngrokURL = await NgrokService.getInstance().getUrl();
        const { success_uri } = req.body;
        console.log("Success URI:", success_uri);
        const state = crypto.randomBytes(16).toString("hex");
        const codeVerifier = generateCodeVerifier();
        const codeChallenge = generateCodeChallenge(codeVerifier);
        await CacheService.getInstance().set(state, {
            verifier: codeVerifier,
            successUri: success_uri,
        });
        const authUrl = new URL("https://twitter.com/i/oauth2/authorize");
        const params = {
            response_type: "code",
            client_id: process.env.TWITTER_CLIENT_ID,
            redirect_uri: `${ngrokURL}/auth/twitter/callback`,
            scope: "tweet.read users.read offline.access tweet.write",
            state: state,
            code_challenge: codeChallenge,
            code_challenge_method: "S256",
        };
        Object.entries(params).forEach(([key, value]) => {
            authUrl.searchParams.append(key, value);
        });
        console.log("[Twitter Init] Redirecting to Twitter authorization URL:", authUrl.toString());
        res.json({ authUrl: authUrl.toString() });
    }
    catch (error) {
        console.error("[Twitter Auth] Error:", error);
        res.status(500).json({ error: "Auth initialization failed" });
    }
});
router.get("/callback", async (req, res) => {
    var _a, _b, _c, _d, _e;
    try {
        const ngrokURL = await NgrokService.getInstance().getUrl();
        const { code, state } = req.query;
        const stored = await CacheService.getInstance().get(state);
        if (!stored) {
            throw new Error("Invalid state parameter");
        }
        const { verifier: codeVerifier, successUri } = stored;
        const basicAuth = Buffer.from(`${process.env.TWITTER_CLIENT_ID}:${process.env.TWITTER_CLIENT_SECRET}`).toString("base64");
        const params = new URLSearchParams({
            code: code,
            grant_type: "authorization_code",
            client_id: process.env.TWITTER_CLIENT_ID,
            redirect_uri: `${ngrokURL}/auth/twitter/callback`,
            code_verifier: codeVerifier,
        });
        const tokenResponse = await axios.post("https://api.twitter.com/2/oauth2/token", params.toString(), {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Authorization: `Basic ${basicAuth}`,
            },
        });
        await CacheService.getInstance().del(state);
        try {
            const profileResponse = await axios.get("https://api.twitter.com/2/users/me", {
                headers: {
                    Authorization: `Bearer ${tokenResponse.data.access_token}`,
                },
            });
            if (profileResponse.data && profileResponse.data.data) {
                const username = profileResponse.data.data.username;
                const userId = profileResponse.data.data.id;
                await CacheService.getInstance().set(`twitter_token_${userId}`, tokenResponse.data.access_token, 24 * 60 * 60);
                console.log(`[Twitter Callback] Stored token for @${username} [${userId}]`);
            }
        }
        catch (profileError) {
            console.error("[Twitter Callback] Error fetching profile:", profileError);
        }
        const redirectUrl = successUri || `/auth/twitter/success`;
        return res.redirect(302, `${redirectUrl}?token=${tokenResponse.data.access_token}`);
    }
    catch (error) {
        console.error("[Twitter Callback] Error:", error);
        if (error instanceof AxiosError) {
            console.error("[Twitter Callback] Response data:", (_a = error.response) === null || _a === void 0 ? void 0 : _a.data);
            console.error("[Twitter Callback] Response status:", (_b = error.response) === null || _b === void 0 ? void 0 : _b.status);
            console.error("[Twitter Callback] Response headers:", (_c = error.response) === null || _c === void 0 ? void 0 : _c.headers);
            console.error("[Twitter Callback] Request URL:", (_d = error.config) === null || _d === void 0 ? void 0 : _d.url);
            console.error("[Twitter Callback] Request params:", (_e = error.config) === null || _e === void 0 ? void 0 : _e.params);
        }
        return res.redirect(302, `/auth/twitter/error`);
    }
});
router.get("/error", (_req, _res) => {
    _res.status(400).json({
        success: false,
        error: "Failed to fetch profile information",
    });
});
router.get("/success", async (req, res) => {
    var _a;
    try {
        const { token } = req.query;
        if (!token) {
            throw new Error("No token provided");
        }
        const profileResponse = await axios.get("https://api.twitter.com/2/users/me", {
            headers: {
                Authorization: `Bearer ${token}`,
            },
            params: {
                "user.fields": "description,profile_image_url,public_metrics,verified",
            },
        });
        const profile = profileResponse.data;
        if (profile && profile.data && profile.data.username) {
            const username = profile.data.username;
            const userId = profile.data.id;
            await CacheService.getInstance().set(`twitter_token_${userId}`, token, 24 * 60 * 60);
            console.log(`[Twitter Success] Stored token for @${username} [${userId}]`);
        }
        res.json({
            success: true,
            message: "Twitter authentication successful",
            token,
            profile,
        });
    }
    catch (error) {
        console.error("[Twitter Success] Error:", error);
        if (error instanceof AxiosError) {
            console.error("[Twitter Success] Response:", (_a = error.response) === null || _a === void 0 ? void 0 : _a.data);
        }
        res.status(400).json({
            success: false,
            error: "Failed to fetch profile information",
        });
    }
});
router.get("/card/:slug/index.html", (req, res) => {
    const slug = req.params.slug;
    const claimURLBase64 = slug.split(":")[0];
    let claimURL = Buffer.from(claimURLBase64, "base64").toString("ascii");
    console.log("Claim URL:", claimURL);
    const _claimURL = new URL(claimURL);
    _claimURL.hostname = process.env.NEXT_PUBLIC_HOSTNAME;
    claimURL = _claimURL.toString();
    console.log("Updated Claim URL:", claimURL);
    const botUsernameBase64 = slug.split(":")[1];
    const botUsername = Buffer.from(botUsernameBase64, "base64").toString("ascii");
    console.log("Bot Username:", botUsername);
    res.setHeader("Content-Type", "text/html");
    res.send(getCardHTML(botUsername, claimURL));
});
router.get("/getAccountAddress", async (req, res) => {
    var _a, _b;
    try {
        const { userId } = req.query;
        console.log("Getting account address for Twitter User ID:", userId);
        if (!userId) {
            throw new Error("No user id provided");
        }
        const v2ApiUrl = getCollablandApiUrl().replace("v1", "v2");
        const { data } = await axios.post(`${v2ApiUrl}/evm/calculateAccountAddress`, {
            platform: "twitter",
            userId: userId,
        }, {
            headers: {
                "X-API-KEY": process.env.COLLABLAND_API_KEY,
            },
        });
        console.log("[Twitter Success] Account address for Twitter User ID:", userId, data);
        const accountAddress = (_a = data.evm.find((account) => account.chainId === 8453)) === null || _a === void 0 ? void 0 : _a.address;
        res.json({
            success: true,
            account: accountAddress,
        });
    }
    catch (error) {
        console.error("[Twitter Success] Error:", error);
        if (error instanceof AxiosError) {
            console.error("[Twitter Success] Response:", (_b = error.response) === null || _b === void 0 ? void 0 : _b.data);
        }
        res.status(400).json({
            success: false,
            error: "Failed to fetch profile information",
        });
    }
});
router.get("/sendAirdrop/:tokenId/:recipient", async (req, res) => {
    var _a, _b;
    req.setTimeout(10 * 60 * 1000);
    res.setTimeout(10 * 60 * 1000);
    try {
        const { tokenId, recipient } = req.params;
        console.log(`[Twitter Airdrop] Sending airdrop for token ${tokenId} to ${recipient}`);
        const chainId = 8453;
        const contract = WowXYZERC20__factory.connect(tokenId);
        const calldata = contract.interface.encodeFunctionData("buy", [
            recipient,
            recipient,
            recipient,
            `Airdrop for ${recipient}`,
            0,
            0,
            0,
        ]);
        const value = parseEther("0.0000001");
        const payload = {
            target: tokenId,
            calldata: calldata,
            value: toBeHex(value),
        };
        console.log("[Twitter Airdrop] Payload:", payload);
        console.log("Hitting Collab.Land APIs to submit UserOperation...");
        const apiUrl = getCollablandApiUrl();
        const { data } = await axios.post(`${apiUrl}/telegrambot/evm/submitUserOperation?chainId=${chainId}`, payload, {
            headers: {
                "X-API-KEY": process.env.COLLABLAND_API_KEY,
                "X-TG-BOT-TOKEN": process.env.TELEGRAM_BOT_TOKEN,
            },
            timeout: 10 * 60 * 1000,
        });
        console.log("[Twitter Airdrop] UserOperation submitted:", data);
        const userOp = data.userOperationHash;
        console.log("Hitting Collab.Land APIs to confirm UserOperation", userOp);
        const { data: userOpData } = await axios.get(`${apiUrl}/telegrambot/evm/userOperationReceipt?chainId=${chainId}&userOperationHash=${userOp}`, {
            headers: {
                "X-API-KEY": process.env.COLLABLAND_API_KEY,
                "X-TG-BOT-TOKEN": process.env.TELEGRAM_BOT_TOKEN,
            },
            timeout: 10 * 60 * 1000,
        });
        console.log("[Twitter Airdrop] UserOperation confirmed:", userOpData);
        const txHash = (_a = userOpData.receipt) === null || _a === void 0 ? void 0 : _a.transactionHash;
        console.log("[Twitter Airdrop] Transaction hash:", txHash);
        console.log("[Twitter Airdrop] Airdrop sent with tx hash:", txHash);
        res.json({
            success: true,
            txHash: txHash,
        });
    }
    catch (error) {
        console.error("[Twitter Airdrop] Error:", error);
        if (error instanceof AxiosError) {
            console.error("[Twitter Airdrop] Response:", (_b = error.response) === null || _b === void 0 ? void 0 : _b.data);
        }
        res.status(400).json({
            success: false,
            error: "Failed to send airdrop",
        });
    }
});
router.post("/tweetCard", async (req, res) => {
    var _a, _b;
    try {
        const me = await TwitterService.getInstance().me;
        const { account } = req.body;
        const token = req.headers["x-auth-token"];
        if (!token) {
            throw new Error("No token provided");
        }
        const claimURL = process.env.NEXT_PUBLIC_HOSTNAME + `/claim/${account}`;
        const slug = Buffer.from(claimURL).toString("base64url") +
            ":" +
            Buffer.from((_a = me === null || me === void 0 ? void 0 : me.username) !== null && _a !== void 0 ? _a : "").toString("base64url");
        const ngrokURL = await NgrokService.getInstance().getUrl();
        const claimURLWithNgrok = ngrokURL + `/auth/twitter/card/${slug}/index.html`;
        console.log("[Tweet Card] Claim URL:", claimURLWithNgrok);
        const message = `🎉 Just created my Aptos wallet on TweeFi! Create yours now with @${me === null || me === void 0 ? void 0 : me.username} - get started below! 🚀\n\n${claimURLWithNgrok}`;
        console.log("[Tweet Card] Sending tweet:", message);
        const { data } = await axios.post("https://api.twitter.com/2/tweets", {
            text: message,
        }, {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });
        console.log("[Tweet Card] Tweet sent:", data);
        const tweetId = data.data.id;
        const replyMessage = `My Aptos wallet address: ${account}`;
        console.log("[Tweet Card] Replying to tweet:", replyMessage);
        const { data: replyData } = await axios.post("https://api.twitter.com/2/tweets", {
            text: replyMessage,
            reply: {
                in_reply_to_tweet_id: tweetId,
            },
        }, {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });
        console.log("[Tweet Card] Reply sent:", replyData);
        const tweetUrl = `https://twitter.com/i/web/status/${tweetId}`;
        console.log("[Twitter Success] Tweet sent successfully:", tweetUrl);
        res.json({
            success: true,
            tweetId,
            tweetUrl,
        });
    }
    catch (error) {
        console.error("[Tweet Card] Error:", error);
        if (error instanceof AxiosError) {
            console.error("[Tweet Card] Response:", (_b = error.response) === null || _b === void 0 ? void 0 : _b.data);
        }
        res.status(400).json({
            success: false,
            error: "Failed to send tweet",
        });
    }
});
router.post("/createAptosAccount", async (req, res) => {
    try {
        const { accessToken, profile } = req.body;
        if (!accessToken || !profile) {
            res.status(400).json({
                success: false,
                error: "Missing required parameters: accessToken and profile",
            });
            return;
        }
        const existingUser = await twitterUserService.getUserById(profile.data.id);
        if (existingUser) {
            res.json({ success: true, address: existingUser.accountaddress });
            return;
        }
        console.log("Profile : ", profile);
        const { accountAddress, publicKey, dataToEncryptHash, ciphertext } = await LitAptosSigner.createAccount(accessToken);
        await twitterUserService.createUser({
            id: profile.data.id,
            accountaddress: accountAddress,
            publickey: publicKey,
            datatoencrypthash: dataToEncryptHash,
            ciphertext,
            profile: profile.data,
        });
        await CacheService.getInstance().set(`twitter_token_${profile.data.id}`, accessToken, 24 * 60 * 60);
        console.log(`[Create Aptos Account] Created account for Twitter user @${profile.data.username} with address: ${accountAddress}`);
        res.status(200).json({
            success: true,
            address: accountAddress,
        });
        return;
    }
    catch (error) {
        console.error("[Create Aptos Account] Error:", error);
        res.status(500).json({
            success: false,
            error: "Failed to create Aptos account",
        });
        return;
    }
});
export default router;
//# sourceMappingURL=twitter.js.map