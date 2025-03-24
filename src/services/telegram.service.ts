import { Bot, webhookCallback } from "grammy";
import { BaseService } from "./base.service.js";
import { ElizaService } from "./eliza.service.js";
import {
  AnyType,
  getCollablandApiUrl,
  getTokenMetadataPath,
  MintResponse,
  TokenMetadata,
} from "../utils.js";
import fs from "fs";
import axios, { AxiosResponse, isAxiosError } from "axios";
import { parse as jsoncParse } from "jsonc-parser";
import path, { resolve } from "path";
import { keccak256, getBytes, toUtf8Bytes } from "ethers";
import { TwitterService } from "./twitter.service.js";
import { NgrokService } from "./ngrok.service.js";
import {
  AccountAuthenticator,
  Aptos,
  AptosConfig,
  Deserializer,
  Ed25519PublicKey,
  Ed25519Signature,
  Network,
  SimpleTransaction,
  VerifySignatureArgs,
} from "@aptos-labs/ts-sdk";
import { LitAptosSigner } from "./aptos.service.js";
import { fileURLToPath } from "url";

// hack to avoid 400 errors sending params back to telegram. not even close to perfect
const htmlEscape = (_key: AnyType, val: AnyType) => {
  if (typeof val === "string") {
    return val
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;"); // single quote
  }
  return val;
};

// const __dirname = path.dirname(new URL(import.meta.url).pathname);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export class TelegramService extends BaseService {
  private static instance: TelegramService;
  private bot: Bot;
  private webhookUrl: string;
  private elizaService: ElizaService;
  private nGrokService: NgrokService;
  private twitterService?: TwitterService;

  private constructor(webhookUrl?: string) {
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

  public static getInstance(webhookUrl?: string): TelegramService {
    if (!TelegramService.instance) {
      TelegramService.instance = new TelegramService(webhookUrl);
    }
    return TelegramService.instance;
  }

  public async setWebhook(webhookUrl: string): Promise<void> {
    this.webhookUrl = `${webhookUrl}/telegram/webhook`;
    await this.bot.api.setWebhook(this.webhookUrl);
    console.log("Telegram webhook set:", this.webhookUrl);
  }

  public getWebhookCallback() {
    return webhookCallback(this.bot, "express", {
      timeoutMilliseconds: 10 * 60 * 1000,
      onTimeout: "return",
    });
  }

  public async start(): Promise<void> {
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
      //all command descriptions can be added here
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
      // all command handlers can be registered here
      this.bot.command("start", (ctx) => ctx.reply("Hello!"));
      this.bot.catch(async (error) => {
        console.error("Telegram bot error:", error);
      });
      await this.elizaService.start();
      // required when starting server for telegram webooks
      this.nGrokService = await NgrokService.getInstance();
      try {
        // try starting the twitter service
        this.twitterService = await TwitterService.getInstance();
        await this.twitterService?.start();
        console.log(
          "Twitter Bot Profile:",
          JSON.stringify(this.twitterService.me, null, 2)
        );
      } catch (err) {
        console.log(
          "[WARN] [telegram.service] Unable to use twitter. Functionality will be disabled",
          err
        );
      }

      this.bot.command("mint", async (ctx) => {
        try {
          ctx.reply("Minting your token...");
          const tokenPath = getTokenMetadataPath();
          const tokenInfo = jsoncParse(
            fs.readFileSync(tokenPath, "utf8")
          ) as TokenMetadata;
          console.log("TokenInfoToMint", tokenInfo);
          console.log("Hitting Collab.Land APIs to mint token...");
          const { data: _tokenData } = await client.post<
            AnyType,
            AxiosResponse<MintResponse>
          >(`/telegrambot/evm/mint?chainId=8453`, {
            name: tokenInfo.name,
            symbol: tokenInfo.symbol,
            metadata: {
              description: tokenInfo.description ?? "",
              website_link: tokenInfo.websiteLink ?? "",
              twitter: tokenInfo.twitter ?? "",
              discord: tokenInfo.discord ?? "",
              telegram: tokenInfo.telegram ?? "",
              media: tokenInfo.image ?? "",
              nsfw: tokenInfo.nsfw ?? false,
            },
          });
          console.log("Mint response from Collab.Land:");
          console.dir(_tokenData, { depth: null });
          const tokenData = _tokenData.response.contract.fungible;
          await ctx.reply(
            `Your token has been minted on wow.xyz 🥳
Token details:
<pre><code class="language-json">${JSON.stringify(tokenData, null, 2)}</code></pre>

You can view the token page below (it takes a few minutes to be visible)`,
            {
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
            }
          );
          if (this.twitterService) {
            const twitterBotInfo = this.twitterService.me;
            const twitterClient = this.twitterService.getScraper();
            const ngrokURL = this.nGrokService.getUrl();
            await ctx.reply(
              `🐦 Posting a tweet about the new token...\n\n` +
                `Twitter account details:\n<pre lang="json"><code>${JSON.stringify(
                  twitterBotInfo,
                  null,
                  2
                )}</code></pre>`,
              {
                parse_mode: "HTML",
              }
            );
            const claimURL = `${process.env.NEXT_PUBLIC_HOSTNAME}/claim/${tokenData.address}`;
            const botUsername = twitterBotInfo?.username;
            console.log("botUsername:", botUsername);
            console.log("claimURL:", claimURL);
            const slug =
              Buffer.from(claimURL).toString("base64url") +
              ":" +
              Buffer.from(botUsername!).toString("base64url");
            console.log("slug:", slug);
            const cardURL = `${ngrokURL}/auth/twitter/card/${slug}/index.html`;
            console.log("cardURL:", cardURL);
            const twtRes = await twitterClient.sendTweet(
              `I just minted a token on Base using Wow!\nThe ticker is $${tokenData.symbol}\nClaim early alpha here: ${cardURL}`
            );
            if (twtRes.ok) {
              const tweetId = (await twtRes.json()) as AnyType;
              console.log("Tweet posted successfully:", tweetId);
              const tweetURL = `https://twitter.com/${twitterBotInfo?.username}/status/${tweetId?.data?.create_tweet?.tweet_results?.result?.rest_id}`;
              console.log("Tweet URL:", tweetURL);
              await ctx.reply(
                `Tweet posted successfully!\n\n` +
                  `🎉 Tweet details: ${tweetURL}`,
                {
                  parse_mode: "HTML",
                }
              );
            } else {
              console.error("Failed to post tweet:", await twtRes.json());
              await ctx.reply("Failed to post tweet");
            }
          }
        } catch (error) {
          if (isAxiosError(error)) {
            console.error("Failed to mint token:", error.response?.data);
          } else {
            console.error("Failed to mint token:", error);
          }
          ctx.reply("Failed to mint token");
        }
      });

      this.bot.command("lit", async (ctx) => {
        try {
          const action = ctx.match.split(" ")[0];
          console.log("action:", action);
          console.log("Directory path ", __dirname);
          const actionHashes = JSON.parse(
            (
              await fs.readFileSync(
                resolve(
                  __dirname,
                  "..",
                  "..",
                  "..",
                  "lit-actions",
                  "actions",
                  `ipfs.json`
                )
              )
            ).toString()
          );
          console.log("actionHashes:", actionHashes);
          const actionHash = actionHashes[action];
          console.log("actionHash:", actionHash);
          if (!actionHash) {
            ctx.reply(`Action not found: ${action}`);
            return;
          }
          // ! NOTE: You can send any jsParams you want here, it depends on your Lit action code
          let jsParams;
          let transaction: SimpleTransaction;
          let aptosMethod: string;
          // ! NOTE: You can change the chainId to any chain you want to execute the action on
          const chainId = 8453;
          switch (action) {
            case "hello-action": {
              // ! NOTE: The message to sign can be any normal message, or raw TX
              // ! In order to sign EIP-191 message, you need to encode it properly, Lit protocol does raw signatures
              const messageToSign =
                ctx.from?.username ?? ctx.from?.first_name ?? "";
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
              const { data } = await client.post(
                `/telegrambot/executeLitActionUsingPKP?chainId=${chainId}`,
                {
                  actionIpfs: actionHashes["encrypt-action"].IpfsHash,
                  actionJsParams: {
                    toEncrypt,
                  },
                }
              );
              console.log("encrypt response ", data);
              const { ciphertext, dataToEncryptHash } = JSON.parse(
                data.response.response
              );
              jsParams = {
                ciphertext,
                dataToEncryptHash,
                chain: "base",
              };
              break;
            }
            case "encrypt-action": {
              const message =
                ctx.from?.username ?? ctx.from?.first_name ?? "test data";
              jsParams = {
                toEncrypt: `${message}-${new Date().toUTCString()}`,
              };
              break;
            }
            case "aptos-accounts": {
              aptosMethod = ctx.message?.text?.split(" ")[2] ?? "createAccount";
              const accessToken = ctx.message?.text?.split(" ")[3] ?? "";
              const messageToSign =
                ctx.from?.username ?? ctx.from?.first_name ?? "";
              if (aptosMethod === "createAccount") {
                jsParams = {
                  method: aptosMethod,
                  ipfsCID: actionHash.IpfsHash,
                  accessToken,
                };
              } else if (aptosMethod === "signTransaction") {
                const config = new AptosConfig({ network: Network.TESTNET });
                const aptos = new Aptos(config);
                transaction = await aptos.transaction.build.simple({
                  sender:
                    "0x0eee7b6daea7801baa6c144bb99ab79c2fcd75ce4014f822372c9d0c925673a0",
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
                  ciphertext:
                    "oTXmYzNr0Wu6VSOT10DKtDjGcUYMmedO47WZ8Y7Ff2+cQqw4y01oYP6VIWtan1QtY5ZWRaOap055BNnFH42ZY+nBj3Nascy3yoraYYHxfRdDedoWzTEgsVuw6+9CiVuFHWsWgMjnG5NAsoX69bwfqwqXlpa/Rn5AQp8Eeq6aM7rGVGfAagDgfpk6Wwhy8l4QF9I8oAI=",
                  dataToEncryptHash:
                    "42d8402d7fe88fdcdb5a8ce47d5f98fb74f9affeb20daa16d0c1bc45218e5910",
                  accountAddress:
                    "0x0eee7b6daea7801baa6c144bb99ab79c2fcd75ce4014f822372c9d0c925673a0",
                  publicKey:
                    "0x8803f0e2bf400ffe2a253f701a7d39eae95a02e3b5ec316f0aa73bb1efb2f66b",
                  toSign: Array.from(txToSign),
                };
              } else {
                jsParams = {
                  method: aptosMethod,
                  ipfsCID: actionHash.IpfsHash,
                  ciphertext:
                    "oTXmYzNr0Wu6VSOT10DKtDjGcUYMmedO47WZ8Y7Ff2+cQqw4y01oYP6VIWtan1QtY5ZWRaOap055BNnFH42ZY+nBj3Nascy3yoraYYHxfRdDedoWzTEgsVuw6+9CiVuFHWsWgMjnG5NAsoX69bwfqwqXlpa/Rn5AQp8Eeq6aM7rGVGfAagDgfpk6Wwhy8l4QF9I8oAI=",
                  dataToEncryptHash:
                    "42d8402d7fe88fdcdb5a8ce47d5f98fb74f9affeb20daa16d0c1bc45218e5910",
                  accountAddress:
                    "0x0eee7b6daea7801baa6c144bb99ab79c2fcd75ce4014f822372c9d0c925673a0",
                  publicKey:
                    "0x8803f0e2bf400ffe2a253f701a7d39eae95a02e3b5ec316f0aa73bb1efb2f66b",
                  toSign: Array.from(new TextEncoder().encode(messageToSign)),
                };
              }
              break;
            }
            default: {
              // they typed something random or a dev forgot to update this list
              ctx.reply(`Action not handled: ${action}`);
              return;
            }
          }
          await ctx.reply(
            "Executing action..." +
              `\n\nAction Hash: <code>${actionHash.IpfsHash}</code>\n\nParams:\n<pre lang="json"><code>${JSON.stringify(
                jsParams,
                htmlEscape,
                2
              )}</code></pre>`,
            {
              parse_mode: "HTML",
            }
          );
          console.log(
            `[telegram.service] executing lit action with hash ${actionHash.IpfsHash} on chain ${chainId}`
          );
          const { data } = await client.post(
            `/telegrambot/executeLitActionUsingPKP?chainId=${chainId}`,
            {
              actionIpfs: actionHash.IpfsHash,
              actionJsParams: jsParams,
            }
          );
          console.log(
            `Action with hash ${actionHash.IpfsHash} executed on Lit Nodes 🔥`
          );
          console.log("Result:", data);
          ctx.reply(
            `Action executed on Lit Nodes 🔥\n\n` +
              `Action: <code>${actionHash.IpfsHash}</code>\n` +
              `Result:\n<pre lang="json"><code>${JSON.stringify(
                data,
                null,
                2
              )}</code></pre>`,
            {
              parse_mode: "HTML",
            }
          );
          //@ts-expect-error aptosMethod is defined
          if (aptosMethod === "signTransaction" && transaction != null) {
            const config = new AptosConfig({ network: Network.TESTNET });
            const aptos = new Aptos(config);
            const response = JSON.parse(data?.response?.response);
            console.log("response: %O", response);
            const sig = new Deserializer(
              new Uint8Array(Buffer.from(response.signature.slice(2), "hex"))
            );
            console.log("sig: %O", sig);
            const pub = new Ed25519PublicKey(jsParams?.publicKey ?? "");
            console.log("pub: %O", pub);

            const senderAuthenticator = AccountAuthenticator.deserialize(sig);
            console.log("senderAuthenticator: %O", senderAuthenticator);
            const pendingTransaction = await aptos.transaction.submit.simple({
              transaction: transaction,
              senderAuthenticator: senderAuthenticator,
            });
            console.log("pendingTransaction: %O", pendingTransaction);
            await ctx.reply(
              `Transaction submitted successfully:\n` +
                `Transaction Hash: <code>${pendingTransaction.hash}</code>\n`,
              {
                parse_mode: "HTML",
              }
            );
            const committedTransaction = await aptos.waitForTransaction({
              transactionHash: pendingTransaction.hash,
            });
            console.log("committedTransaction: %O", committedTransaction);
            await ctx.reply(
              `Transaction committed successfully:\n` +
                `Transaction Hash: <code>${committedTransaction.hash}</code>\n`,
              {
                parse_mode: "HTML",
              }
            );
          }
        } catch (error) {
          if (isAxiosError(error)) {
            console.error(
              "Failed to execute Lit action:",
              error.response?.data
            );
            ctx.reply(
              "Failed to execute Lit action" +
                `\n\nError: <pre lang="json"><code>${JSON.stringify(
                  error.response?.data,
                  htmlEscape,
                  2
                )}</code></pre>`,
              {
                parse_mode: "HTML",
              }
            );
          } else {
            console.error("Failed to execute Lit action:", error);
            ctx.reply(
              "Failed to execute Lit action" +
                `\n\nError: <pre lang="json"><code>${JSON.stringify(
                  error?.message,
                  null,
                  2
                )}</code></pre>`,
              {
                parse_mode: "HTML",
              }
            );
          }
        }
      });
      this.bot.command("aptos", async (ctx) => {
        //FIXME: Hard-coding the values to test
        const ipfsCID = "QmSKuJA2zgjzE3MX5Eft5uKBwZMUpATrDdZXjjkSdqJSbS";
        const ciphertext =
          "oTXmYzNr0Wu6VSOT10DKtDjGcUYMmedO47WZ8Y7Ff2+cQqw4y01oYP6VIWtan1QtY5ZWRaOap055BNnFH42ZY+nBj3Nascy3yoraYYHxfRdDedoWzTEgsVuw6+9CiVuFHWsWgMjnG5NAsoX69bwfqwqXlpa/Rn5AQp8Eeq6aM7rGVGfAagDgfpk6Wwhy8l4QF9I8oAI=";
        const dataToEncryptHash =
          "42d8402d7fe88fdcdb5a8ce47d5f98fb74f9affeb20daa16d0c1bc45218e5910";
        const accountAddress =
          "0x0eee7b6daea7801baa6c144bb99ab79c2fcd75ce4014f822372c9d0c925673a0";
        const publicKey =
          "0x8803f0e2bf400ffe2a253f701a7d39eae95a02e3b5ec316f0aa73bb1efb2f66b";
        const accessToken = process.env.TEMP_X_ACCESS_TOKEN!;
        const signer = new LitAptosSigner(
          accountAddress,
          publicKey,
          Network.TESTNET,
          ipfsCID,
          ciphertext,
          dataToEncryptHash,
          accessToken
        );
        const action = ctx.message?.text?.split(" ")[1];
        if (action === "signMessage") {
          const message = "Hello, Aptos!";
          await ctx.reply(`Signing message: ${message}`);
          const signature = await signer.signMessage(message);
          await ctx.reply(`Signature: ${signature}`);
          const pub = new Ed25519PublicKey(publicKey);
          const args: VerifySignatureArgs = {
            signature: new Ed25519Signature(signature),
            message: new TextEncoder().encode(message),
          };
          const result = await pub.verifySignature(args);
          await ctx.reply(`Verification result: ${result}`);
          console.log("result: %O", result);
        } else if (action === "signTransaction") {
          const aptos = new Aptos(
            new AptosConfig({ network: Network.TESTNET })
          );
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
        } else {
          await ctx.reply(`Action not handled: ${action}`);
        }
      });
    } catch (error) {
      console.error("Failed to start Telegram bot:", error);
      throw error;
    }
  }

  public getBotInfo() {
    return this.bot.api.getMe();
  }

  public async stop(): Promise<void> {
    try {
      await this.bot.api.deleteWebhook();
    } catch (error) {
      console.error("Error stopping Telegram bot:", error);
    }
  }
}
