import { Bot, webhookCallback } from "grammy";
import { BaseService } from "./base.service.js";
import { ElizaService } from "./eliza.service.js";
import { getCollablandApiUrl, getTokenMetadataPath, } from "../utils.js";
import fs from "fs";
import axios, { isAxiosError } from "axios";
import { parse as jsoncParse } from "jsonc-parser";
import path, { resolve } from "path";
import { keccak256, getBytes, toUtf8Bytes } from "ethers";
import { TwitterService } from "./twitter.service.js";
import { NgrokService } from "./ngrok.service.js";
import { AccountAuthenticator, Aptos, AptosConfig, Deserializer, Ed25519PublicKey, Ed25519Signature, Network, } from "@aptos-labs/ts-sdk";
import { LitAptosSigner } from "./aptos.service.js";
import { fileURLToPath } from "url";
const htmlEscape = (_key, val) => {
    if (typeof val === "string") {
        return val
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }
    return val;
};
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export class TelegramService extends BaseService {
    constructor(webhookUrl) {
        super();
        if (!process.env.TELEGRAM_BOT_TOKEN) {
            throw new Error("TELEGRAM_BOT_TOKEN is required");
        }
        if (webhookUrl != null) {
            this.webhookUrl = `${webhookUrl}/telegram/webhook`;
        }
        this.bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);
        this.elizaService = ElizaService.getInstance(this.bot);
    }
    static getInstance(webhookUrl) {
        if (!TelegramService.instance) {
            TelegramService.instance = new TelegramService(webhookUrl);
        }
        return TelegramService.instance;
    }
    async setWebhook(webhookUrl) {
        this.webhookUrl = `${webhookUrl}/telegram/webhook`;
        await this.bot.api.setWebhook(this.webhookUrl);
        console.log("Telegram webhook set:", this.webhookUrl);
    }
    getWebhookCallback() {
        return webhookCallback(this.bot, "express", {
            timeoutMilliseconds: 10 * 60 * 1000,
            onTimeout: "return",
        });
    }
    async start() {
        var _a;
        const client = axios.create({
            baseURL: getCollablandApiUrl(),
            headers: {
                "X-API-KEY": process.env.COLLABLAND_API_KEY || "",
                "X-TG-BOT-TOKEN": process.env.TELEGRAM_BOT_TOKEN || "",
                "Content-Type": "application/json",
            },
            timeout: 5 * 60 * 1000,
        });
        try {
            this.bot.api.setMyCommands([
                {
                    command: "start",
                    description: "Add any hello world functionality to your bot",
                },
                { command: "mint", description: "Mint a token on Wow.xyz" },
                { command: "eliza", description: "Talk to the AI agent" },
                { command: "lit", description: "Execute a Lit action" },
                { command: "aptos", description: "Execute an Aptos action" },
            ]);
            this.bot.command("start", (ctx) => ctx.reply("Hello!"));
            this.bot.catch(async (error) => {
                console.error("Telegram bot error:", error);
            });
            await this.elizaService.start();
            this.nGrokService = await NgrokService.getInstance();
            try {
                this.twitterService = await TwitterService.getInstance();
                await ((_a = this.twitterService) === null || _a === void 0 ? void 0 : _a.start());
                console.log("Twitter Bot Profile:", JSON.stringify(this.twitterService.me, null, 2));
            }
            catch (err) {
                console.log("[WARN] [telegram.service] Unable to use twitter. Functionality will be disabled", err);
            }
            this.bot.command("mint", async (ctx) => {
                var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
                try {
                    ctx.reply("Minting your token...");
                    const tokenPath = getTokenMetadataPath();
                    const tokenInfo = jsoncParse(fs.readFileSync(tokenPath, "utf8"));
                    console.log("TokenInfoToMint", tokenInfo);
                    console.log("Hitting Collab.Land APIs to mint token...");
                    const { data: _tokenData } = await client.post(`/telegrambot/evm/mint?chainId=8453`, {
                        name: tokenInfo.name,
                        symbol: tokenInfo.symbol,
                        metadata: {
                            description: (_a = tokenInfo.description) !== null && _a !== void 0 ? _a : "",
                            website_link: (_b = tokenInfo.websiteLink) !== null && _b !== void 0 ? _b : "",
                            twitter: (_c = tokenInfo.twitter) !== null && _c !== void 0 ? _c : "",
                            discord: (_d = tokenInfo.discord) !== null && _d !== void 0 ? _d : "",
                            telegram: (_e = tokenInfo.telegram) !== null && _e !== void 0 ? _e : "",
                            media: (_f = tokenInfo.image) !== null && _f !== void 0 ? _f : "",
                            nsfw: (_g = tokenInfo.nsfw) !== null && _g !== void 0 ? _g : false,
                        },
                    });
                    console.log("Mint response from Collab.Land:");
                    console.dir(_tokenData, { depth: null });
                    const tokenData = _tokenData.response.contract.fungible;
                    await ctx.reply(`Your token has been minted on wow.xyz 🥳
Token details:
<pre><code class="language-json">${JSON.stringify(tokenData, null, 2)}</code></pre>

You can view the token page below (it takes a few minutes to be visible)`, {
                        reply_markup: {
                            inline_keyboard: [
                                [
                                    {
                                        text: "View Wow.xyz Token Page",
                                        url: `https://wow.xyz/${tokenData.address}`,
                                    },
                                ],
                            ],
                        },
                        parse_mode: "HTML",
                    });
                    if (this.twitterService) {
                        const twitterBotInfo = this.twitterService.me;
                        const twitterClient = this.twitterService.getScraper();
                        const ngrokURL = this.nGrokService.getUrl();
                        await ctx.reply(`🐦 Posting a tweet about the new token...\n\n` +
                            `Twitter account details:\n<pre lang="json"><code>${JSON.stringify(twitterBotInfo, null, 2)}</code></pre>`, {
                            parse_mode: "HTML",
                        });
                        const claimURL = `${process.env.NEXT_PUBLIC_HOSTNAME}/claim/${tokenData.address}`;
                        const botUsername = twitterBotInfo === null || twitterBotInfo === void 0 ? void 0 : twitterBotInfo.username;
                        console.log("botUsername:", botUsername);
                        console.log("claimURL:", claimURL);
                        const slug = Buffer.from(claimURL).toString("base64url") +
                            ":" +
                            Buffer.from(botUsername).toString("base64url");
                        console.log("slug:", slug);
                        const cardURL = `${ngrokURL}/auth/twitter/card/${slug}/index.html`;
                        console.log("cardURL:", cardURL);
                        const twtRes = await twitterClient.sendTweet(`I just minted a token on Base using Wow!\nThe ticker is $${tokenData.symbol}\nClaim early alpha here: ${cardURL}`);
                        if (twtRes.ok) {
                            const tweetId = (await twtRes.json());
                            console.log("Tweet posted successfully:", tweetId);
                            const tweetURL = `https://twitter.com/${twitterBotInfo === null || twitterBotInfo === void 0 ? void 0 : twitterBotInfo.username}/status/${(_l = (_k = (_j = (_h = tweetId === null || tweetId === void 0 ? void 0 : tweetId.data) === null || _h === void 0 ? void 0 : _h.create_tweet) === null || _j === void 0 ? void 0 : _j.tweet_results) === null || _k === void 0 ? void 0 : _k.result) === null || _l === void 0 ? void 0 : _l.rest_id}`;
                            console.log("Tweet URL:", tweetURL);
                            await ctx.reply(`Tweet posted successfully!\n\n` +
                                `🎉 Tweet details: ${tweetURL}`, {
                                parse_mode: "HTML",
                            });
                        }
                        else {
                            console.error("Failed to post tweet:", await twtRes.json());
                            await ctx.reply("Failed to post tweet");
                        }
                    }
                }
                catch (error) {
                    if (isAxiosError(error)) {
                        console.error("Failed to mint token:", (_m = error.response) === null || _m === void 0 ? void 0 : _m.data);
                    }
                    else {
                        console.error("Failed to mint token:", error);
                    }
                    ctx.reply("Failed to mint token");
                }
            });
            this.bot.command("lit", async (ctx) => {
                var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x;
                try {
                    const action = ctx.match.split(" ")[0];
                    console.log("action:", action);
                    console.log("Directory path ", __dirname);
                    const actionHashes = JSON.parse((await fs.readFileSync(resolve(__dirname, "..", "..", "..", "lit-actions", "actions", `ipfs.json`))).toString());
                    console.log("actionHashes:", actionHashes);
                    const actionHash = actionHashes[action];
                    console.log("actionHash:", actionHash);
                    if (!actionHash) {
                        ctx.reply(`Action not found: ${action}`);
                        return;
                    }
                    let jsParams;
                    let transaction;
                    let aptosMethod;
                    const chainId = 8453;
                    switch (action) {
                        case "hello-action": {
                            const messageToSign = (_d = (_b = (_a = ctx.from) === null || _a === void 0 ? void 0 : _a.username) !== null && _b !== void 0 ? _b : (_c = ctx.from) === null || _c === void 0 ? void 0 : _c.first_name) !== null && _d !== void 0 ? _d : "";
                            const messageToSignDigest = keccak256(toUtf8Bytes(messageToSign));
                            jsParams = {
                                helloName: messageToSign,
                                toSign: Array.from(getBytes(messageToSignDigest)),
                            };
                            break;
                        }
                        case "decrypt-action": {
                            const toEncrypt = `encrypt-decrypt-test-${new Date().toUTCString()}`;
                            ctx.reply(`Invoking encrypt action with ${toEncrypt}`);
                            const { data } = await client.post(`/telegrambot/executeLitActionUsingPKP?chainId=${chainId}`, {
                                actionIpfs: actionHashes["encrypt-action"].IpfsHash,
                                actionJsParams: {
                                    toEncrypt,
                                },
                            });
                            console.log("encrypt response ", data);
                            const { ciphertext, dataToEncryptHash } = JSON.parse(data.response.response);
                            jsParams = {
                                ciphertext,
                                dataToEncryptHash,
                                chain: "base",
                            };
                            break;
                        }
                        case "encrypt-action": {
                            const message = (_h = (_f = (_e = ctx.from) === null || _e === void 0 ? void 0 : _e.username) !== null && _f !== void 0 ? _f : (_g = ctx.from) === null || _g === void 0 ? void 0 : _g.first_name) !== null && _h !== void 0 ? _h : "test data";
                            jsParams = {
                                toEncrypt: `${message}-${new Date().toUTCString()}`,
                            };
                            break;
                        }
                        case "aptos-accounts": {
                            aptosMethod = (_l = (_k = (_j = ctx.message) === null || _j === void 0 ? void 0 : _j.text) === null || _k === void 0 ? void 0 : _k.split(" ")[2]) !== null && _l !== void 0 ? _l : "createAccount";
                            const accessToken = (_p = (_o = (_m = ctx.message) === null || _m === void 0 ? void 0 : _m.text) === null || _o === void 0 ? void 0 : _o.split(" ")[3]) !== null && _p !== void 0 ? _p : "";
                            const messageToSign = (_t = (_r = (_q = ctx.from) === null || _q === void 0 ? void 0 : _q.username) !== null && _r !== void 0 ? _r : (_s = ctx.from) === null || _s === void 0 ? void 0 : _s.first_name) !== null && _t !== void 0 ? _t : "";
                            if (aptosMethod === "createAccount") {
                                jsParams = {
                                    method: aptosMethod,
                                    ipfsCID: actionHash.IpfsHash,
                                    accessToken,
                                };
                            }
                            else if (aptosMethod === "signTransaction") {
                                const config = new AptosConfig({ network: Network.TESTNET });
                                const aptos = new Aptos(config);
                                transaction = await aptos.transaction.build.simple({
                                    sender: "0x0eee7b6daea7801baa6c144bb99ab79c2fcd75ce4014f822372c9d0c925673a0",
                                    data: {
                                        function: "0x1::aptos_account::transfer",
                                        functionArguments: [
                                            "0x252905ac58960968895d53d5c11d27f520d1609ab2db95f2e68daea52ad246c9",
                                            100,
                                        ],
                                    },
                                });
                                const txToSign = transaction.rawTransaction.bcsToBytes();
                                jsParams = {
                                    method: aptosMethod,
                                    ipfsCID: actionHash.IpfsHash,
                                    ciphertext: "oTXmYzNr0Wu6VSOT10DKtDjGcUYMmedO47WZ8Y7Ff2+cQqw4y01oYP6VIWtan1QtY5ZWRaOap055BNnFH42ZY+nBj3Nascy3yoraYYHxfRdDedoWzTEgsVuw6+9CiVuFHWsWgMjnG5NAsoX69bwfqwqXlpa/Rn5AQp8Eeq6aM7rGVGfAagDgfpk6Wwhy8l4QF9I8oAI=",
                                    dataToEncryptHash: "42d8402d7fe88fdcdb5a8ce47d5f98fb74f9affeb20daa16d0c1bc45218e5910",
                                    accountAddress: "0x0eee7b6daea7801baa6c144bb99ab79c2fcd75ce4014f822372c9d0c925673a0",
                                    publicKey: "0x8803f0e2bf400ffe2a253f701a7d39eae95a02e3b5ec316f0aa73bb1efb2f66b",
                                    toSign: Array.from(txToSign),
                                };
                            }
                            else {
                                jsParams = {
                                    method: aptosMethod,
                                    ipfsCID: actionHash.IpfsHash,
                                    ciphertext: "oTXmYzNr0Wu6VSOT10DKtDjGcUYMmedO47WZ8Y7Ff2+cQqw4y01oYP6VIWtan1QtY5ZWRaOap055BNnFH42ZY+nBj3Nascy3yoraYYHxfRdDedoWzTEgsVuw6+9CiVuFHWsWgMjnG5NAsoX69bwfqwqXlpa/Rn5AQp8Eeq6aM7rGVGfAagDgfpk6Wwhy8l4QF9I8oAI=",
                                    dataToEncryptHash: "42d8402d7fe88fdcdb5a8ce47d5f98fb74f9affeb20daa16d0c1bc45218e5910",
                                    accountAddress: "0x0eee7b6daea7801baa6c144bb99ab79c2fcd75ce4014f822372c9d0c925673a0",
                                    publicKey: "0x8803f0e2bf400ffe2a253f701a7d39eae95a02e3b5ec316f0aa73bb1efb2f66b",
                                    toSign: Array.from(new TextEncoder().encode(messageToSign)),
                                };
                            }
                            break;
                        }
                        default: {
                            ctx.reply(`Action not handled: ${action}`);
                            return;
                        }
                    }
                    await ctx.reply("Executing action..." +
                        `\n\nAction Hash: <code>${actionHash.IpfsHash}</code>\n\nParams:\n<pre lang="json"><code>${JSON.stringify(jsParams, htmlEscape, 2)}</code></pre>`, {
                        parse_mode: "HTML",
                    });
                    console.log(`[telegram.service] executing lit action with hash ${actionHash.IpfsHash} on chain ${chainId}`);
                    const { data } = await client.post(`/telegrambot/executeLitActionUsingPKP?chainId=${chainId}`, {
                        actionIpfs: actionHash.IpfsHash,
                        actionJsParams: jsParams,
                    });
                    console.log(`Action with hash ${actionHash.IpfsHash} executed on Lit Nodes 🔥`);
                    console.log("Result:", data);
                    ctx.reply(`Action executed on Lit Nodes 🔥\n\n` +
                        `Action: <code>${actionHash.IpfsHash}</code>\n` +
                        `Result:\n<pre lang="json"><code>${JSON.stringify(data, null, 2)}</code></pre>`, {
                        parse_mode: "HTML",
                    });
                    if (aptosMethod === "signTransaction" && transaction != null) {
                        const config = new AptosConfig({ network: Network.TESTNET });
                        const aptos = new Aptos(config);
                        const response = JSON.parse((_u = data === null || data === void 0 ? void 0 : data.response) === null || _u === void 0 ? void 0 : _u.response);
                        console.log("response: %O", response);
                        const sig = new Deserializer(new Uint8Array(Buffer.from(response.signature.slice(2), "hex")));
                        console.log("sig: %O", sig);
                        const pub = new Ed25519PublicKey((_v = jsParams === null || jsParams === void 0 ? void 0 : jsParams.publicKey) !== null && _v !== void 0 ? _v : "");
                        console.log("pub: %O", pub);
                        const senderAuthenticator = AccountAuthenticator.deserialize(sig);
                        console.log("senderAuthenticator: %O", senderAuthenticator);
                        const pendingTransaction = await aptos.transaction.submit.simple({
                            transaction: transaction,
                            senderAuthenticator: senderAuthenticator,
                        });
                        console.log("pendingTransaction: %O", pendingTransaction);
                        await ctx.reply(`Transaction submitted successfully:\n` +
                            `Transaction Hash: <code>${pendingTransaction.hash}</code>\n`, {
                            parse_mode: "HTML",
                        });
                        const committedTransaction = await aptos.waitForTransaction({
                            transactionHash: pendingTransaction.hash,
                        });
                        console.log("committedTransaction: %O", committedTransaction);
                        await ctx.reply(`Transaction committed successfully:\n` +
                            `Transaction Hash: <code>${committedTransaction.hash}</code>\n`, {
                            parse_mode: "HTML",
                        });
                    }
                }
                catch (error) {
                    if (isAxiosError(error)) {
                        console.error("Failed to execute Lit action:", (_w = error.response) === null || _w === void 0 ? void 0 : _w.data);
                        ctx.reply("Failed to execute Lit action" +
                            `\n\nError: <pre lang="json"><code>${JSON.stringify((_x = error.response) === null || _x === void 0 ? void 0 : _x.data, htmlEscape, 2)}</code></pre>`, {
                            parse_mode: "HTML",
                        });
                    }
                    else {
                        console.error("Failed to execute Lit action:", error);
                        ctx.reply("Failed to execute Lit action" +
                            `\n\nError: <pre lang="json"><code>${JSON.stringify(error === null || error === void 0 ? void 0 : error.message, null, 2)}</code></pre>`, {
                            parse_mode: "HTML",
                        });
                    }
                }
            });
            this.bot.command("aptos", async (ctx) => {
                var _a, _b;
                const ipfsCID = "QmSKuJA2zgjzE3MX5Eft5uKBwZMUpATrDdZXjjkSdqJSbS";
                const ciphertext = "oTXmYzNr0Wu6VSOT10DKtDjGcUYMmedO47WZ8Y7Ff2+cQqw4y01oYP6VIWtan1QtY5ZWRaOap055BNnFH42ZY+nBj3Nascy3yoraYYHxfRdDedoWzTEgsVuw6+9CiVuFHWsWgMjnG5NAsoX69bwfqwqXlpa/Rn5AQp8Eeq6aM7rGVGfAagDgfpk6Wwhy8l4QF9I8oAI=";
                const dataToEncryptHash = "42d8402d7fe88fdcdb5a8ce47d5f98fb74f9affeb20daa16d0c1bc45218e5910";
                const accountAddress = "0x0eee7b6daea7801baa6c144bb99ab79c2fcd75ce4014f822372c9d0c925673a0";
                const publicKey = "0x8803f0e2bf400ffe2a253f701a7d39eae95a02e3b5ec316f0aa73bb1efb2f66b";
                const accessToken = process.env.TEMP_X_ACCESS_TOKEN;
                const signer = new LitAptosSigner(accountAddress, publicKey, Network.TESTNET, ipfsCID, ciphertext, dataToEncryptHash, accessToken);
                const action = (_b = (_a = ctx.message) === null || _a === void 0 ? void 0 : _a.text) === null || _b === void 0 ? void 0 : _b.split(" ")[1];
                if (action === "signMessage") {
                    const message = "Hello, Aptos!";
                    await ctx.reply(`Signing message: ${message}`);
                    const signature = await signer.signMessage(message);
                    await ctx.reply(`Signature: ${signature}`);
                    const pub = new Ed25519PublicKey(publicKey);
                    const args = {
                        signature: new Ed25519Signature(signature),
                        message: new TextEncoder().encode(message),
                    };
                    const result = await pub.verifySignature(args);
                    await ctx.reply(`Verification result: ${result}`);
                    console.log("result: %O", result);
                }
                else if (action === "signTransaction") {
                    const aptos = new Aptos(new AptosConfig({ network: Network.TESTNET }));
                    const transaction = await aptos.transaction.build.simple({
                        sender: accountAddress,
                        data: {
                            function: "0x1::aptos_account::transfer",
                            functionArguments: [
                                "0x252905ac58960968895d53d5c11d27f520d1609ab2db95f2e68daea52ad246c9",
                                100,
                            ],
                        },
                    });
                    const txToSign = transaction.rawTransaction.bcsToBytes();
                    await ctx.reply(`Transaction to sign: ${txToSign}`);
                    const txHash = await signer.sendTransaction(transaction);
                    await ctx.reply(`TX Hash: ${txHash}`);
                }
                else {
                    await ctx.reply(`Action not handled: ${action}`);
                }
            });
        }
        catch (error) {
            console.error("Failed to start Telegram bot:", error);
            throw error;
        }
    }
    getBotInfo() {
        return this.bot.api.getMe();
    }
    async stop() {
        try {
            await this.bot.api.deleteWebhook();
        }
        catch (error) {
            console.error("Error stopping Telegram bot:", error);
        }
    }
}
//# sourceMappingURL=telegram.service.js.map