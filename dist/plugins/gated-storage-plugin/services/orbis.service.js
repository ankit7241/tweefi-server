import { OrbisDB } from "@useorbis/db-sdk";
import { OrbisKeyDidAuth } from "@useorbis/db-sdk/auth";
import { elizaLogger } from "@ai16z/eliza";
import { maskEmbedding } from "./storage.service.js";
export class Orbis {
    constructor() {
        let message = "";
        if (!process.env.ORBIS_GATEWAY_URL) {
            message +=
                "ORBIS_GATEWAY_URL is not defined in the environment variables. ";
        }
        if (!process.env.CERAMIC_NODE_URL) {
            message +=
                "CERAMIC_NODE_URL is not defined in the environment variables. ";
        }
        if (!process.env.ORBIS_TABLE_ID) {
            message += "ORBIS_TABLE_ID is not defined in the environment variables. ";
        }
        if (!process.env.ORBIS_ENV) {
            message += "ORBIS_ENV is not defined in the environment variables. ";
        }
        if (!process.env.ORBIS_CONTEXT_ID) {
            message +=
                "ORBIS_CONTEXT_ID is not defined in the environment variables. ";
        }
        if (!process.env.ORBIS_SEED) {
            message += "ORBIS_SEED is not defined in the environment variables. ";
        }
        if (message) {
            throw new Error(message);
        }
        this.contextId = process.env.ORBIS_CONTEXT_ID;
        this.seed = new Uint8Array(JSON.parse(process.env.ORBIS_SEED));
        this.tableId = process.env.ORBIS_TABLE_ID;
        this.db = new OrbisDB({
            ceramic: {
                gateway: process.env.CERAMIC_NODE_URL,
            },
            nodes: [
                {
                    gateway: process.env.ORBIS_GATEWAY_URL,
                    env: process.env.ORBIS_ENV,
                },
            ],
        });
    }
    static getInstance() {
        if (!Orbis.instance) {
            Orbis.instance = new Orbis();
        }
        return Orbis.instance;
    }
    async getAuthenticatedInstance() {
        const auth = await OrbisKeyDidAuth.fromSeed(this.seed);
        return await this.db.connectUser({ auth });
    }
    async getController() {
        var _a, _b;
        await this.getAuthenticatedInstance();
        if (!((_a = this.db.did) === null || _a === void 0 ? void 0 : _a.id)) {
            throw new Error("Ceramic DID not initialized");
        }
        return (_b = this.db.did) === null || _b === void 0 ? void 0 : _b.id;
    }
    async updateOrbis(content) {
        try {
            await this.getAuthenticatedInstance();
            const res = await this.db
                .insert(this.tableId)
                .value(content)
                .context(this.contextId)
                .run();
            return res;
        }
        catch (err) {
            elizaLogger.warn("[orbis.service] failed to store data ", JSON.stringify(content, maskEmbedding, 2));
            throw err;
        }
    }
    async queryKnowledgeEmbeddings(embedding) {
        const formattedEmbedding = `ARRAY[${embedding.join(", ")}]::vector`;
        const query = `
          SELECT stream_id, content, is_user, embedding <=> ${formattedEmbedding} AS similarity
          FROM ${this.tableId}
          ORDER BY similarity ASC
          LIMIT 5;
          `;
        const context = await this.queryKnowledgeIndex(query);
        return context;
    }
    async queryKnowledgeIndex(text) {
        await this.getAuthenticatedInstance();
        const result = await this.db.select().raw(text).run();
        return result;
    }
}
//# sourceMappingURL=orbis.service.js.map