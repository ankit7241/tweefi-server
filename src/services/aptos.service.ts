import {
  Account,
  Aptos,
  AptosConfig,
  Network,
  AccountAddress,
  AnyRawTransaction,
  AccountAuthenticator,
  Deserializer,
  RawTransaction,
  SimpleTransaction,
  Ed25519PrivateKey,
} from "@aptos-labs/ts-sdk";
import {
  // LocalSigner,
  BaseSigner,
} from "move-agent-kit";

import { AgentRuntime, createAptosTools } from "move-agent-kit";
import { aptosConfig } from "../config/aptos.config.js";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage } from "@langchain/core/messages";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { resolve } from "path";
// import { fileURLToPath } from "url";
// import { dirname } from "path";
import fs from "fs";
import dotenv from "dotenv";
import axios, { AxiosInstance } from "axios";
import { getCollablandApiUrl } from "../utils.js";
import { CreateAptosAccountResponse } from "src/types.js";
import { isAxiosError } from "axios";
import { TwitterUserService } from "./twitter-user.service.js";
import { AptosCreateTokenTool } from "../tools/createToken.js";
import { AptosBatchTransferTool } from "../tools/batchedTransaction.js";

// Convert ESM module URL to filesystem path
// const __filename = fileURLToPath(import.meta.url);
// const __dirname = dirname(__filename);

// Load environment variables from root .env file
dotenv.config();

export type SignedTransactionResponse = {
  senderAuthenticator: AccountAuthenticator;
  signature?: Uint8Array<ArrayBufferLike>;
};

export class LitAptosSigner extends BaseSigner {
  private readonly _aptosClient: Aptos;
  private readonly _aptosAddress: string;
  private readonly _aptosPublicKey: string;
  private readonly _litCiphertext: string;
  private readonly _litDataToEncryptHash: string;
  private readonly _litIpfsHash: string;
  private readonly _accessToken: string;
  private readonly _axiosClient: AxiosInstance;
  /**
   * Initializes a new instance of the LitAptosSigner class. Uses Lit protocol to sign transactions on Aptos.
   * @param accountAddress - The account address of the signer
   * @param accountPublicKey - The public key of the signer
   * @param network - The Aptos network to connect to
   * @param ipfsHash - The IPFS hash of the Lit action
   * @param ciphertext - The encrypted data of the private key (for Lit protocol)
   * @param dataToEncryptHash - The hash of the data to encrypted data of the private key (for Lit protocol)
   * @param accessToken - The Twitter access token
   */
  constructor(
    accountAddress: string,
    accountPublicKey: string,
    network: Network,
    ipfsHash: string,
    ciphertext: string,
    dataToEncryptHash: string,
    accessToken: string
  ) {
    const config = new AptosConfig({ network });
    const client = new Aptos(config);
    const account = Account.generate(); // passing a random account, but won't be used
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
  getAddress(): AccountAddress {
    console.log("[LitAptosSigner] getAddress: %O", this._aptosAddress);
    return new AccountAddress(
      new Uint8Array(Buffer.from(this._aptosAddress.slice(2), "hex"))
    );
  }
  async signTransaction(
    transaction: AnyRawTransaction
  ): Promise<SignedTransactionResponse> {
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
      const chainId = 8453; // does not matter here, but is an API constraint
      const { data } = await this._axiosClient.post(
        `/telegrambot/executeLitActionUsingPKP?chainId=${chainId}`,
        {
          actionIpfs: this._litIpfsHash,
          actionJsParams: jsParams,
        }
      );
      const response = JSON.parse(data?.response?.response);
      console.log("[LitAptosSigner] response: %O", response);
      const sig = new Deserializer(
        new Uint8Array(Buffer.from(response.signature.slice(2), "hex"))
      );
      console.log("[LitAptosSigner] sig: %O", sig);
      const senderAuthenticator = AccountAuthenticator.deserialize(sig);
      console.log(
        "[LitAptosSigner] senderAuthenticator: %O",
        senderAuthenticator
      );
      return {
        senderAuthenticator,
      };
    } catch (error) {
      console.error("[LitAptosSigner] Failed to sign transaction:", error);
      if (isAxiosError(error)) {
        console.error("[LitAptosSigner] Axios error:", error.response?.data);
      }
      throw error;
    }
  }

  async sendTransaction(transaction: AnyRawTransaction) {
    console.log("[LitAptosSigner] sendTransaction: %O", transaction);
    const rawTx = transaction.rawTransaction;
    const newTx = new SimpleTransaction(
      new RawTransaction(
        rawTx.sender,
        rawTx.sequence_number,
        rawTx.payload,
        rawTx.max_gas_amount,
        rawTx.gas_unit_price,
        BigInt(Math.floor(Date.now() / 1000) + 5 * 60), // 5 minutes from now
        rawTx.chain_id
      )
    );
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

  async signMessage(message: string): Promise<string> {
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
      const chainId = 8453; // does not matter here, but is an API constraint
      const { data } = await this._axiosClient.post(
        `/telegrambot/executeLitActionUsingPKP?chainId=${chainId}`,
        {
          actionIpfs: this._litIpfsHash,
          actionJsParams: jsParams,
        }
      );
      const response = JSON.parse(data?.response?.response);
      console.log("[LitAptosSigner] response: %O", response);
      return response.signature;
    } catch (error) {
      console.error("[LitAptosSigner] Failed to sign message:", error);
      throw error;
    }
  }

  static async getDefaultIPFSHash(): Promise<string> {
    try {
      console.log("[LitAptosSigner] getDefaultIPFSHash");
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
      console.log("[LitAptosSigner] actionHashes: %O", actionHashes);
      const ipfsHash =
        actionHashes["aptos-accounts"].IpfsHash ??
        "QmaYdcg2N11RvhrJCRwsTkuoGb3anxt9aJF3oh8nQrGURJ";
      console.log("[LitAptosSigner] getDefaultIPFSHash: %s", ipfsHash);
      return ipfsHash;
    } catch (err) {
      console.error("[LitAptosSigner] Failed to get default IPFS hash:", err);
      return "QmaYdcg2N11RvhrJCRwsTkuoGb3anxt9aJF3oh8nQrGURJ";
    }
  }

  static async createAptosAccount(accountAddress: string) {
    try {
      const aptos = new Aptos(new AptosConfig({ network: Network.TESTNET }));
      let privateKeyHex;
      if (process.env.APTOS_PRIVATE_KEY) {
        privateKeyHex = process.env.APTOS_PRIVATE_KEY;
        const privateKey = new Ed25519PrivateKey(
          Buffer.from(privateKeyHex.slice(2), "hex")
        );

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
      } else {
        console.error("Private key not found in env");
      }
    } catch (error) {
      console.error(`❌ Error creating account : `, error);
    }
  }

  static async createAccount(
    accessToken: string,
    ipfsCID?: string
  ): Promise<CreateAptosAccountResponse> {
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
      const chainId = 8453; // does not matter here, but is an API constraint
      const jsParams = {
        method: "createAccount",
        ipfsCID: ipfsCID,
        accessToken: accessToken,
      };
      console.log("[LitAptosSigner] jsParams: %O", jsParams);
      const { data } = await instance.post(
        `/telegrambot/executeLitActionUsingPKP?chainId=${chainId}`,
        {
          actionIpfs: ipfsCID,
          actionJsParams: jsParams,
        }
      );
      console.log("[LitAptosSigner] response: %O", data);
      if (data?.response?.response) {
        const user = JSON.parse(data?.response?.response);
        await this.createAptosAccount(user.accountAddress);
        return user;
      }

      throw new Error("Failed to create account");
    } catch (error) {
      console.error("[LitAptosSigner] Failed to create account:", error);
      if (isAxiosError(error)) {
        console.error(
          "[LitAptosSigner] Failed to create account:",
          error.response?.data
        );
        throw new Error(
          error.response?.data?.message || "Failed to create account"
        );
      }
      throw error;
    }
  }
}

export class AptosService {
  private aptos: Aptos;
  private userAgents: Map<
    string,
    { agent: AgentRuntime; llmAgent: ReturnType<typeof createReactAgent> }
  >;

  constructor() {
    this.aptos = new Aptos(aptosConfig);
    this.userAgents = new Map();
  }

  private async initializeUserAgent(
    userId: string,
    accessToken: string
  ): Promise<void> {
    try {
      console.log(`Initializing Aptos service for user ${userId}...`);

      // Get user details from Supabase
      const twitterUserService = TwitterUserService.getInstance();
      const user = await twitterUserService.getUserById(userId);

      if (!user) {
        throw new Error(`User ${userId} not found in database`);
      }

      // Get IPFS hash for Lit Action
      const ipfsCID = await LitAptosSigner.getDefaultIPFSHash();

      // Create signer with user's details
      const signer = new LitAptosSigner(
        user.accountaddress,
        user.publickey,
        Network.TESTNET,
        ipfsCID,
        user.ciphertext,
        user.datatoencrypthash,
        accessToken
      );

      // Initialize agent runtime
      const agent = new AgentRuntime(signer, this.aptos, {
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      });
      let defaultTools = createAptosTools(agent);
      // remove the pre-defined aptos_create_token tool
      defaultTools = defaultTools.filter(
        (t) => t.name !== "aptos_create_token"
      );
      const tools = [
        ...defaultTools,
        new AptosBatchTransferTool(agent),
        new AptosCreateTokenTool(agent),
      ];
      console.log(
        "Aptos tools created for user:",
        tools.map((t) => t.name).join(", ")
      );

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

      // Store the agents for this user
      this.userAgents.set(userId, { agent, llmAgent });
      console.log(`LLM agent created and ready for user ${userId}`);
    } catch (error) {
      console.error(
        `Failed to initialize Aptos service for user ${userId}:`,
        error
      );
      throw error;
    }
  }

  async processRequest(
    userId: string,
    accessToken: string,
    prompt: string
  ): Promise<string> {
    try {
      // Check if we have an agent for this user, if not initialize one
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
      for await (const chunk of stream) {
        if ("agent" in chunk) {
          console.log("Agent response:", chunk.agent.messages[0].content);
          response = chunk.agent.messages[0].content;
        } else if ("tools" in chunk) {
          console.log("Tool execution:", chunk.tools.messages[0].content);
        }
      }

      console.log(`Final response for user ${userId}:`, response);
      return response;
    } catch (error: unknown) {
      console.error(`Failed to process request for user ${userId}:`, error);
      throw new Error(`Sorry, couldn't process your request: ${error}`);
    }
  }
}
