var _a;
import { Orbis } from "./orbis.service.js";
import axios from "axios";
import fs from "fs";
import { getCollablandApiUrl } from "../../../utils.js";
import path, { resolve } from "path";
import { fileURLToPath } from "url";
import { elizaLogger, getEmbeddingZeroVector } from "@ai16z/eliza";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const chainId = 8453;
const OPENAI_EMBEDDINGS = Boolean((_a = process.env.USE_OPENAI_EMBEDDING) !== null && _a !== void 0 ? _a : "false");
export class StorageService {
    constructor() {
        this.orbis = null;
        this.client = null;
        this.encryptActionHash = null;
        this.decryptActionHash = null;
        this.started = false;
    }
    static getInstance() {
        if (!StorageService.instance) {
            StorageService.instance = new StorageService();
        }
        return StorageService.instance;
    }
    async start() {
        if (this.started) {
            return;
        }
        try {
            this.orbis = Orbis.getInstance();
            this.client = axios.create({
                baseURL: getCollablandApiUrl(),
                headers: {
                    "X-API-KEY": process.env.COLLABLAND_API_KEY || "",
                    "X-TG-BOT-TOKEN": process.env.TELEGRAM_BOT_TOKEN || "",
                    "Content-Type": "application/json",
                },
                timeout: 5 * 60 * 1000,
            });
            const actionHashes = JSON.parse((await fs.readFileSync(resolve(__dirname, "..", "..", "..", "..", "..", "lit-actions", "actions", `ipfs.json`))).toString());
            this.encryptActionHash = actionHashes["encrypt-action"].IpfsHash;
            this.decryptActionHash = actionHashes["decrypt-action"].IpfsHash;
            this.started = true;
            return;
        }
        catch (error) {
            console.warn("Error starting StorageService:", error);
        }
    }
    isConfigured() {
        if (!this.orbis) {
            elizaLogger.info("[storage.service] Orbis is not initialized. Gated data is disabled.");
            return false;
        }
        if (!OPENAI_EMBEDDINGS) {
            elizaLogger.info("[storage.service] Not using OPENAI embeddings. Gated data is disabled.");
            return false;
        }
        if (!this.encryptActionHash) {
            elizaLogger.warn("[storage.service] Encrypt action hash is not initialized. Gated data is disabled.");
            return false;
        }
        if (!this.decryptActionHash) {
            elizaLogger.warn("[storage.service] Decrypt action hash is not initialized. Gated data is disabled.");
            return false;
        }
        if (!this.client) {
            elizaLogger.warn("[storage.service] is not initialized. Gated data is disabled.");
            return false;
        }
        return true;
    }
    async storeMessageWithEmbedding(context, embedding, is_user) {
        var _a;
        if (!this.isConfigured) {
            return null;
        }
        if (embedding == getEmbeddingZeroVector()) {
            throw new Error("Message embedding must not be the zero vector to persist");
        }
        elizaLogger.debug("[storage.service] attempting to encrypt data");
        try {
            const { data } = await this.client.post(`/telegrambot/executeLitActionUsingPKP?chainId=${chainId}`, {
                actionIpfs: this.encryptActionHash,
                actionJsParams: {
                    toEncrypt: context,
                },
            });
            if ((_a = data === null || data === void 0 ? void 0 : data.response) === null || _a === void 0 ? void 0 : _a.response) {
                const { ciphertext, dataToEncryptHash, message } = JSON.parse(data.response.response);
                elizaLogger.debug(`[storage.service] encryption message=${message}`);
                if (ciphertext && dataToEncryptHash) {
                    const content = {
                        content: JSON.stringify({ ciphertext, dataToEncryptHash }),
                        embedding,
                        is_user,
                    };
                    const doc = await this.orbis.updateOrbis(content);
                    return doc;
                }
                else {
                    throw new Error(`Encryption failed: data=${JSON.stringify(data)}`);
                }
            }
            else {
                elizaLogger.warn("[storage.service] did not get any response from lit action to persist");
                throw new Error("Failed to encrypt data");
            }
        }
        catch (error) {
            elizaLogger.error("[storage.service] Error storing message:", error);
            throw error;
        }
    }
    async getEmbeddingContext(array) {
        if (!this.isConfigured()) {
            return null;
        }
        try {
            const context = await this.orbis.queryKnowledgeEmbeddings(array);
            if (!context) {
                return null;
            }
            const decryptedRows = await Promise.all(context.rows.map(async (row) => {
                var _a;
                if (!this.client) {
                    throw new Error("Client is not initialized");
                }
                try {
                    const castRow = row;
                    const streamId = castRow === null || castRow === void 0 ? void 0 : castRow.stream_id;
                    if (!(row === null || row === void 0 ? void 0 : row.content)) {
                        elizaLogger.warn(`[storage.service] embedding missing content for stream_id=${castRow === null || castRow === void 0 ? void 0 : castRow.stream_id}`);
                        return null;
                    }
                    const { ciphertext, dataToEncryptHash } = JSON.parse(row.content);
                    if (!ciphertext || !dataToEncryptHash) {
                        elizaLogger.warn(`[storage.service] retrieved embedding missing ciphertext or dataToEncryptHash for stream_id=${streamId}`);
                        return null;
                    }
                    const { data } = await this.client.post(`/telegrambot/executeLitActionUsingPKP?chainId=${chainId}`, {
                        actionIpfs: this.decryptActionHash,
                        actionJsParams: {
                            ciphertext,
                            dataToEncryptHash,
                            chain: "base",
                        },
                    });
                    if ((_a = data === null || data === void 0 ? void 0 : data.response) === null || _a === void 0 ? void 0 : _a.response) {
                        const res = JSON.parse(data.response.response);
                        elizaLogger.debug(`[storage.service] Decrypt message="${res.message}" for stream_id=${streamId}`);
                        return res.decrypted;
                    }
                    else {
                        elizaLogger.warn("[storage.service] failed to retrieve decrypted data for row ", data === null || data === void 0 ? void 0 : data.response);
                        return null;
                    }
                }
                catch (err) {
                    elizaLogger.warn(`[storage.service] exception decrypting data `, err);
                    return null;
                }
            }));
            if (decryptedRows) {
                const concatenatedContext = decryptedRows === null || decryptedRows === void 0 ? void 0 : decryptedRows.join(" ");
                return concatenatedContext;
            }
            return null;
        }
        catch (error) {
            console.error("Error getting embedded context:", error);
            throw error;
        }
    }
    static isMemoryStorable(memory) {
        if (OPENAI_EMBEDDINGS && (memory === null || memory === void 0 ? void 0 : memory.embedding) != getEmbeddingZeroVector()) {
            return true;
        }
        return false;
    }
}
export const maskEmbedding = (key, value) => {
    if (key == "embedding") {
        if (value == getEmbeddingZeroVector()) {
            return "[masked zero embedding]";
        }
        else {
            return "[maskedEmbedding]";
        }
    }
    return value;
};
//# sourceMappingURL=storage.service.js.map