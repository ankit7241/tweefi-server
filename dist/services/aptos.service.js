var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
import { Account, Aptos, AptosConfig, Network, AccountAddress, AccountAuthenticator, Deserializer, RawTransaction, SimpleTransaction, Ed25519PrivateKey, } from "@aptos-labs/ts-sdk";
import { BaseSigner, } from "move-agent-kit";
import { AgentRuntime, createAptosTools } from "move-agent-kit";
import { aptosConfig } from "../config/aptos.config.js";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage } from "@langchain/core/messages";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { resolve } from "path";
import fs from "fs";
import dotenv from "dotenv";
import axios from "axios";
import { getCollablandApiUrl } from "../utils.js";
import { isAxiosError } from "axios";
import { TwitterUserService } from "./twitter-user.service.js";
import { AptosCreateTokenTool } from "../tools/createToken.js";
import { AptosBatchTransferTool } from "../tools/batchedTransaction.js";
dotenv.config();
export class LitAptosSigner extends BaseSigner {
    constructor(accountAddress, accountPublicKey, network, ipfsHash, ciphertext, dataToEncryptHash, accessToken) {
        const config = new AptosConfig({ network });
        const client = new Aptos(config);
        const account = Account.generate();
        super(account, client);
        this._aptosClient = client;
        this._aptosAddress = accountAddress;
        this._aptosPublicKey = accountPublicKey;
        this._litCiphertext = ciphertext;
        this._litDataToEncryptHash = dataToEncryptHash;
        this._litIpfsHash = ipfsHash;
        this._accessToken = accessToken;
        this._axiosClient = axios.create({
            baseURL: getCollablandApiUrl(),
            headers: {
                "X-API-KEY": process.env.COLLABLAND_API_KEY || "",
                "X-TG-BOT-TOKEN": process.env.TELEGRAM_BOT_TOKEN || "",
                "Content-Type": "application/json",
            },
            timeout: 5 * 60 * 1000,
        });
        console.log("[LitAptosSigner] initialized:");
        console.dir({
            _aptosAddress: this._aptosAddress,
            _litCiphertext: this._litCiphertext,
            _litDataToEncryptHash: this._litDataToEncryptHash,
            _litIpfsHash: this._litIpfsHash,
            _accessToken: this._accessToken,
        });
    }
    getAddress() {
        console.log("[LitAptosSigner] getAddress: %O", this._aptosAddress);
        return new AccountAddress(new Uint8Array(Buffer.from(this._aptosAddress.slice(2), "hex")));
    }
    async signTransaction(transaction) {
        var _a, _b;
        console.log("[LitAptosSigner] signTransaction: %O", transaction);
        const tx = transaction.rawTransaction.bcsToBytes();
        console.log("[LitAptosSigner] tx: %O", tx);
        const jsParams = {
            method: "signTransaction",
            ipfsCID: this._litIpfsHash,
            ciphertext: this._litCiphertext,
            dataToEncryptHash: this._litDataToEncryptHash,
            accountAddress: this._aptosAddress,
            publicKey: this._aptosPublicKey,
            toSign: Array.from(tx),
            accessToken: this._accessToken,
        };
        console.log("[LitAptosSigner] jsParams: %O", jsParams);
        try {
            const chainId = 8453;
            const { data } = await this._axiosClient.post(`/telegrambot/executeLitActionUsingPKP?chainId=${chainId}`, {
                actionIpfs: this._litIpfsHash,
                actionJsParams: jsParams,
            });
            const response = JSON.parse((_a = data === null || data === void 0 ? void 0 : data.response) === null || _a === void 0 ? void 0 : _a.response);
            console.log("[LitAptosSigner] response: %O", response);
            const sig = new Deserializer(new Uint8Array(Buffer.from(response.signature.slice(2), "hex")));
            console.log("[LitAptosSigner] sig: %O", sig);
            const senderAuthenticator = AccountAuthenticator.deserialize(sig);
            console.log("[LitAptosSigner] senderAuthenticator: %O", senderAuthenticator);
            return {
                senderAuthenticator,
            };
        }
        catch (error) {
            console.error("[LitAptosSigner] Failed to sign transaction:", error);
            if (isAxiosError(error)) {
                console.error("[LitAptosSigner] Axios error:", (_b = error.response) === null || _b === void 0 ? void 0 : _b.data);
            }
            throw error;
        }
    }
    async sendTransaction(transaction) {
        console.log("[LitAptosSigner] sendTransaction: %O", transaction);
        const rawTx = transaction.rawTransaction;
        const newTx = new SimpleTransaction(new RawTransaction(rawTx.sender, rawTx.sequence_number, rawTx.payload, rawTx.max_gas_amount, rawTx.gas_unit_price, BigInt(Math.floor(Date.now() / 1000) + 5 * 60), rawTx.chain_id));
        console.log("Raw Transaction : ", newTx);
        const signedTx = await this.signTransaction(newTx);
        console.log("Signed Transaction : ", signedTx);
        const submittedTx = await this._aptosClient.transaction.submit.simple({
            transaction: newTx,
            senderAuthenticator: signedTx.senderAuthenticator,
        });
        console.log("[LitAptosSigner] submittedTx: %O", submittedTx);
        const result = await this._aptosClient.waitForTransaction({
            transactionHash: submittedTx.hash,
        });
        console.log("[LitAptosSigner] result: %O", result);
        return result.hash;
    }
    async signMessage(message) {
        var _a;
        console.log("[LitAptosSigner] signMessage: %O", message);
        const jsParams = {
            method: "signMessage",
            ipfsCID: this._litIpfsHash,
            ciphertext: this._litCiphertext,
            dataToEncryptHash: this._litDataToEncryptHash,
            accountAddress: this._aptosAddress,
            publicKey: this._aptosPublicKey,
            toSign: Array.from(new TextEncoder().encode(message)),
            accessToken: this._accessToken,
        };
        console.log("[LitAptosSigner] jsParams: %O", jsParams);
        try {
            const chainId = 8453;
            const { data } = await this._axiosClient.post(`/telegrambot/executeLitActionUsingPKP?chainId=${chainId}`, {
                actionIpfs: this._litIpfsHash,
                actionJsParams: jsParams,
            });
            const response = JSON.parse((_a = data === null || data === void 0 ? void 0 : data.response) === null || _a === void 0 ? void 0 : _a.response);
            console.log("[LitAptosSigner] response: %O", response);
            return response.signature;
        }
        catch (error) {
            console.error("[LitAptosSigner] Failed to sign message:", error);
            throw error;
        }
    }
    static async getDefaultIPFSHash() {
        var _a;
        try {
            console.log("[LitAptosSigner] getDefaultIPFSHash");
            console.log("Directory path ", __dirname);
            const actionHashes = JSON.parse((await fs.readFileSync(resolve(__dirname, "..", "..", "..", "lit-actions", "actions", `ipfs.json`))).toString());
            console.log("[LitAptosSigner] actionHashes: %O", actionHashes);
            const ipfsHash = (_a = actionHashes["aptos-accounts"].IpfsHash) !== null && _a !== void 0 ? _a : "QmaYdcg2N11RvhrJCRwsTkuoGb3anxt9aJF3oh8nQrGURJ";
            console.log("[LitAptosSigner] getDefaultIPFSHash: %s", ipfsHash);
            return ipfsHash;
        }
        catch (err) {
            console.error("[LitAptosSigner] Failed to get default IPFS hash:", err);
            return "QmaYdcg2N11RvhrJCRwsTkuoGb3anxt9aJF3oh8nQrGURJ";
        }
    }
    static async createAptosAccount(accountAddress) {
        try {
            const aptos = new Aptos(new AptosConfig({ network: Network.TESTNET }));
            let privateKeyHex;
            if (process.env.APTOS_PRIVATE_KEY) {
                privateKeyHex = process.env.APTOS_PRIVATE_KEY;
                const privateKey = new Ed25519PrivateKey(Buffer.from(privateKeyHex.slice(2), "hex"));
                const signer = Account.fromPrivateKey({ privateKey });
                const senderAddress = signer.accountAddress.toString();
                console.log("Sender Address:", senderAddress);
                const transaction = await aptos.transaction.build.simple({
                    sender: senderAddress,
                    data: {
                        function: "0x1::aptos_account::create_account",
                        functionArguments: [accountAddress],
                    },
                });
                const committedTxn = await aptos.signAndSubmitTransaction({
                    signer: signer,
                    transaction: transaction,
                });
                await aptos.waitForTransaction({ transactionHash: committedTxn.hash });
                console.log(`Committed transaction: ${committedTxn.hash}`);
                console.log(`Account creation successfully completed`);
            }
            else {
                console.error("Private key not found in env");
            }
        }
        catch (error) {
            console.error(`❌ Error creating account : `, error);
        }
    }
    static async createAccount(accessToken, ipfsCID) {
        var _a, _b, _c, _d, _e;
        ipfsCID = ipfsCID || (await this.getDefaultIPFSHash());
        const instance = axios.create({
            baseURL: getCollablandApiUrl(),
            headers: {
                "X-API-KEY": process.env.COLLABLAND_API_KEY || "",
                "X-TG-BOT-TOKEN": process.env.TELEGRAM_BOT_TOKEN || "",
                "Content-Type": "application/json",
            },
            timeout: 5 * 60 * 1000,
        });
        console.log("[LitAptosSigner] createAccount: %O", { accessToken, ipfsCID });
        try {
            const chainId = 8453;
            const jsParams = {
                method: "createAccount",
                ipfsCID: ipfsCID,
                accessToken: accessToken,
            };
            console.log("[LitAptosSigner] jsParams: %O", jsParams);
            const { data } = await instance.post(`/telegrambot/executeLitActionUsingPKP?chainId=${chainId}`, {
                actionIpfs: ipfsCID,
                actionJsParams: jsParams,
            });
            console.log("[LitAptosSigner] response: %O", data);
            if ((_a = data === null || data === void 0 ? void 0 : data.response) === null || _a === void 0 ? void 0 : _a.response) {
                const user = JSON.parse((_b = data === null || data === void 0 ? void 0 : data.response) === null || _b === void 0 ? void 0 : _b.response);
                await this.createAptosAccount(user.accountAddress);
                return user;
            }
            throw new Error("Failed to create account");
        }
        catch (error) {
            console.error("[LitAptosSigner] Failed to create account:", error);
            if (isAxiosError(error)) {
                console.error("[LitAptosSigner] Failed to create account:", (_c = error.response) === null || _c === void 0 ? void 0 : _c.data);
                throw new Error(((_e = (_d = error.response) === null || _d === void 0 ? void 0 : _d.data) === null || _e === void 0 ? void 0 : _e.message) || "Failed to create account");
            }
            throw error;
        }
    }
}
export class AptosService {
    constructor() {
        this.aptos = new Aptos(aptosConfig);
        this.userAgents = new Map();
    }
    async initializeUserAgent(userId, accessToken) {
        try {
            console.log(`Initializing Aptos service for user ${userId}...`);
            const twitterUserService = TwitterUserService.getInstance();
            const user = await twitterUserService.getUserById(userId);
            if (!user) {
                throw new Error(`User ${userId} not found in database`);
            }
            const ipfsCID = await LitAptosSigner.getDefaultIPFSHash();
            const signer = new LitAptosSigner(user.accountaddress, user.publickey, Network.TESTNET, ipfsCID, user.ciphertext, user.datatoencrypthash, accessToken);
            const agent = new AgentRuntime(signer, this.aptos, {
                OPENAI_API_KEY: process.env.OPENAI_API_KEY,
            });
            let defaultTools = createAptosTools(agent);
            defaultTools = defaultTools.filter((t) => t.name !== "aptos_create_token");
            const tools = [
                ...defaultTools,
                new AptosBatchTransferTool(agent),
                new AptosCreateTokenTool(agent),
            ];
            console.log("Aptos tools created for user:", tools.map((t) => t.name).join(", "));
            const llm = new ChatOpenAI({
                modelName: "gpt-4o-mini",
                temperature: 0.7,
            });
            const llmAgent = createReactAgent({
                llm,
                tools,
                messageModifier: `
          You are a helpful agent that can interact with the Aptos blockchain using Move Agent Kit.
          You have access to various tools for interacting with the Aptos blockchain.
          When responding to requests:
          1. For balance inquiries: Use AptosBalanceTool and respond with "Your balance is X APT"
          2. For transfers: Respond in this format: "Successfully transferred X APT to the given wallet address or addresses(whichever is appropriate). Track the transaction here: https://explorer.aptoslabs.com/txn/{txn_id}?network=testnet (mention all the transaction hash here). No need to mention the usernames or wallet addresses to which you are transferring"
          3. For errors: Provide clear error messages starting with "Sorry, "
          4. For token details: Use AptosGetTokenDetailTool and provide token information
          5. For transactions: Use AptosTransactionTool to get transaction details
          6. If more than one recipient is given for transfer then do the execution one by one, like after the completion of a pending transaction start transferring to the other transaction, give the transaction hash for all the recipients in the last agent response, i.e. last response from agent should surely contain all the transaction hashes even from previous transactions, it should appear like this : "Successfully transferred X APT to the given wallet addresses. Track the transaction here: https://explorer.aptoslabs.com/txn/{txn_id_!}?network=testnet and https://explorer.aptoslabs.com/txn/{txn_id_2}?network=testnet and etc  (mention all the transaction hash here), don't use any brackets or anything just the hash. No need to mention the usernames or wallet addresses to which you are transferring"
          7. For token creation: Use AptosCreateTokenTool to create a new token

          Always be precise and include relevant details in your responses.
          If you encounter any errors, explain what went wrong clearly.
          Log all tool usage and their results.
        `,
            });
            this.userAgents.set(userId, { agent, llmAgent });
            console.log(`LLM agent created and ready for user ${userId}`);
        }
        catch (error) {
            console.error(`Failed to initialize Aptos service for user ${userId}:`, error);
            throw error;
        }
    }
    async processRequest(userId, accessToken, prompt) {
        var _a, e_1, _b, _c;
        try {
            if (!this.userAgents.has(userId)) {
                await this.initializeUserAgent(userId, accessToken);
            }
            const userAgent = this.userAgents.get(userId);
            if (!userAgent) {
                throw new Error(`No agent found for user ${userId}`);
            }
            console.log(`Processing request for user ${userId}:`, prompt);
            const stream = await userAgent.llmAgent.stream({
                messages: [new HumanMessage(prompt)],
            });
            let response = "";
            try {
                for (var _d = true, stream_1 = __asyncValues(stream), stream_1_1; stream_1_1 = await stream_1.next(), _a = stream_1_1.done, !_a; _d = true) {
                    _c = stream_1_1.value;
                    _d = false;
                    const chunk = _c;
                    if ("agent" in chunk) {
                        console.log("Agent response:", chunk.agent.messages[0].content);
                        response = chunk.agent.messages[0].content;
                    }
                    else if ("tools" in chunk) {
                        console.log("Tool execution:", chunk.tools.messages[0].content);
                    }
                }
            }
            catch (e_1_1) { e_1 = { error: e_1_1 }; }
            finally {
                try {
                    if (!_d && !_a && (_b = stream_1.return)) await _b.call(stream_1);
                }
                finally { if (e_1) throw e_1.error; }
            }
            console.log(`Final response for user ${userId}:`, response);
            return response;
        }
        catch (error) {
            console.error(`Failed to process request for user ${userId}:`, error);
            throw new Error(`Sorry, couldn't process your request: ${error}`);
        }
    }
}
//# sourceMappingURL=aptos.service.js.map