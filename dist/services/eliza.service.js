import { BaseService } from "./base.service.js";
import { AgentRuntime, defaultCharacter, ModelProviderName, elizaLogger, MemoryManager, } from "@ai16z/eliza";
elizaLogger.closeByNewLine = false;
elizaLogger.verbose = true;
import { SqliteDatabaseAdapter } from "@ai16z/adapter-sqlite";
import Database from "better-sqlite3";
import path, { resolve } from "path";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { gateDataPlugin } from "../plugins/gated-storage-plugin/index.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { composeContext } from "@ai16z/eliza";
import { getEmbeddingZeroVector } from "@ai16z/eliza";
import { ModelClass, CacheManager, MemoryCacheAdapter, } from "@ai16z/eliza";
import { stringToUuid } from "@ai16z/eliza";
import { generateMessageResponse, generateShouldRespond } from "@ai16z/eliza";
import { messageCompletionFooter, shouldRespondFooter } from "@ai16z/eliza";
import { bootstrapPlugin } from "@ai16z/plugin-bootstrap";
import { collablandPlugin } from "../plugins/collabland.plugin.js";
import { StorageService } from "../plugins/gated-storage-plugin/services/storage.service.js";
const MAX_MESSAGE_LENGTH = 4096;
const telegramShouldRespondTemplate = `# About {{agentName}}:
{{bio}}

# RESPONSE EXAMPLES
{{user1}}: I just saw a really great movie
{{user2}}: Oh? Which movie?
Result: [IGNORE]

{{agentName}}: Oh, this is my favorite scene
{{user1}}: sick
{{user2}}: wait, why is it your favorite scene
Result: [RESPOND]

{{user1}}: stfu bot
Result: [STOP]

{{user1}}: Hey {{agent}}, can you help me with something
Result: [RESPOND]

{{user1}}: {{agentName}} stfu plz
Result: [STOP]

{{user1}}: i need help
{{agentName}}: how can I help you?
{{user1}}: no. i need help from someone else
Result: [IGNORE]

{{user1}}: Hey {{agent}}, can I ask you a question
{{agentName}}: Sure, what is it
{{user1}}: can you ask claude to create a basic react module that demonstrates a counter
Result: [RESPOND]

{{user1}}: {{agentName}} can you tell me a story
{{agentName}}: uhhh...
{{user1}}: please do it
{{agentName}}: okay
{{agentName}}: once upon a time, in a quaint little village, there was a curious girl named elara
{{user1}}: I'm loving it, keep going
Result: [RESPOND]

{{user1}}: {{agentName}} stop responding plz
Result: [STOP]

{{user1}}: okay, i want to test something. {{agentName}}, can you say marco?
{{agentName}}: marco
{{user1}}: great. okay, now do it again
Result: [RESPOND]

Response options are [RESPOND], [IGNORE] and [STOP].

{{agentName}} is in a room with other users and should only respond when they are being addressed, and should not respond if they are continuing a conversation that is very long.

Respond with [RESPOND] to messages that are directed at {{agentName}}, or participate in conversations that are interesting or relevant to their background.
If a message is not interesting, relevant, or does not directly address {{agentName}}, respond with [IGNORE]

Also, respond with [IGNORE] to messages that are very short or do not contain much information.

If a user asks {{agentName}} to be quiet, respond with [STOP]
If {{agentName}} concludes a conversation and isn't part of the conversation anymore, respond with [STOP]

IMPORTANT: {{agentName}} is particularly sensitive about being annoying, so if there is any doubt, it is better to respond with [IGNORE].
If {{agentName}} is conversing with a user and they have not asked to stop, it is better to respond with [RESPOND].

The goal is to decide whether {{agentName}} should respond to the last message.

{{recentMessages}}

Thread of Tweets You Are Replying To:

{{formattedConversation}}

# INSTRUCTIONS: Choose the option that best describes {{agentName}}'s response to the last message. Ignore messages if they are addressed to someone else.
` + shouldRespondFooter;
const telegramMessageHandlerTemplate = `# Action Names
{{actionNames}}

# Action Examples
{{actionExamples}}
(Action examples are for reference only. Do not use the information from them in your response.)

# Knowledge
{{knowledge}}

# Task: Generate dialog and actions for the character {{agentName}}.
About {{agentName}}:
{{bio}}
{{lore}}

Examples of {{agentName}}'s dialog and actions:
{{messageExamples}}

{{providers}}

{{attachments}}

{{actions}}

# Capabilities
Note that {{agentName}} is capable of reading/seeing/hearing various forms of media, including images, videos, audio, plaintext and PDFs. Recent attachments have been included above under the "Attachments" section.

{{messageDirections}}

{{recentMessages}}

# Task: Generate a post/reply in the voice, style and perspective of {{agentName}} (@{{twitterUserName}}) while using the thread of tweets as additional context:
Current Post:
{{currentPost}}
Thread of Tweets You Are Replying To:

{{formattedConversation}}
` + messageCompletionFooter;
export class MessageManager {
    constructor(bot, runtime) {
        this.bot = bot;
        this.runtime = runtime;
    }
    async processImage(message) {
        var _a, _b;
        try {
            let imageUrl = null;
            if ("photo" in message && message.photo.length > 0) {
                const photo = message.photo[message.photo.length - 1];
                const fileLink = await this.bot.api.getFile(photo.file_id);
                imageUrl = fileLink.toString();
            }
            else if ("document" in message &&
                ((_b = (_a = message.document) === null || _a === void 0 ? void 0 : _a.mime_type) === null || _b === void 0 ? void 0 : _b.startsWith("image/"))) {
                const doc = message.document;
                const fileLink = await this.bot.api.getFile(doc.file_id);
                imageUrl = fileLink.toString();
            }
            if (imageUrl) {
                const { title, description } = await this.imageService.describeImage(imageUrl);
                const fullDescription = `[Image: ${title}\n${description}]`;
                return { description: fullDescription };
            }
        }
        catch (error) {
            console.error("❌ Error processing image:", error);
        }
        return null;
    }
    async _shouldRespond(message, state) {
        var _a, _b, _c, _d, _e, _f, _g;
        if ("text" in message &&
            ((_a = message.text) === null || _a === void 0 ? void 0 : _a.includes(`@${(_b = this.bot.botInfo) === null || _b === void 0 ? void 0 : _b.username}`))) {
            return true;
        }
        if (message.chat.type === "private") {
            return true;
        }
        if ("photo" in message ||
            ("document" in message &&
                ((_d = (_c = message.document) === null || _c === void 0 ? void 0 : _c.mime_type) === null || _d === void 0 ? void 0 : _d.startsWith("image/")))) {
            return false;
        }
        if ("text" in message || ("caption" in message && message.caption)) {
            const shouldRespondContext = composeContext({
                state,
                template: ((_e = this.runtime.character.templates) === null || _e === void 0 ? void 0 : _e.telegramShouldRespondTemplate) ||
                    ((_g = (_f = this.runtime.character) === null || _f === void 0 ? void 0 : _f.templates) === null || _g === void 0 ? void 0 : _g.shouldRespondTemplate) ||
                    telegramShouldRespondTemplate,
            });
            const response = await generateShouldRespond({
                runtime: this.runtime,
                context: shouldRespondContext,
                modelClass: ModelClass.MEDIUM,
            });
            return response === "RESPOND";
        }
        return false;
    }
    async sendMessageInChunks(ctx, content, replyToMessageId) {
        const chunks = this.splitMessage(content);
        const sentMessages = [];
        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            const sentMessage = (await this.bot.api.sendMessage(ctx.chat.id, chunk, {
                reply_parameters: i === 0 && replyToMessageId
                    ? { message_id: replyToMessageId }
                    : undefined,
            }));
            sentMessages.push(sentMessage);
        }
        return sentMessages;
    }
    splitMessage(text) {
        const chunks = [];
        let currentChunk = "";
        const lines = text.split("\n");
        for (const line of lines) {
            if (currentChunk.length + line.length + 1 <= MAX_MESSAGE_LENGTH) {
                currentChunk += (currentChunk ? "\n" : "") + line;
            }
            else {
                if (currentChunk)
                    chunks.push(currentChunk);
                currentChunk = line;
            }
        }
        if (currentChunk)
            chunks.push(currentChunk);
        return chunks;
    }
    async _generateResponse(message, _state, context) {
        const { userId, roomId } = message;
        elizaLogger.debug("[_generateResponse] check1");
        const response = await generateMessageResponse({
            runtime: this.runtime,
            context,
            modelClass: ModelClass.MEDIUM,
        });
        elizaLogger.debug("[_generateResponse] check2");
        if (!response) {
            console.error("❌ No response from generateMessageResponse");
            return null;
        }
        elizaLogger.debug("[_generateResponse] check3");
        await this.runtime.databaseAdapter.log({
            body: { message, context, response },
            userId: userId,
            roomId,
            type: "response",
        });
        elizaLogger.debug("[_generateResponse] check4");
        return response;
    }
    async handleMessage(ctx) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j;
        if (!ctx.message || !ctx.from) {
            return;
        }
        if (((_b = (_a = this.runtime.character.clientConfig) === null || _a === void 0 ? void 0 : _a.telegram) === null || _b === void 0 ? void 0 : _b.shouldIgnoreBotMessages) &&
            ctx.from.is_bot) {
            return;
        }
        if (((_d = (_c = this.runtime.character.clientConfig) === null || _c === void 0 ? void 0 : _c.telegram) === null || _d === void 0 ? void 0 : _d.shouldIgnoreDirectMessages) &&
            ((_e = ctx.chat) === null || _e === void 0 ? void 0 : _e.type) === "private") {
            return;
        }
        const message = ctx.message;
        try {
            const userId = stringToUuid(ctx.from.id.toString());
            const userName = ctx.from.username || ctx.from.first_name || "Unknown User";
            const chatId = stringToUuid(((_f = ctx.chat) === null || _f === void 0 ? void 0 : _f.id.toString()) + "-" + this.runtime.agentId);
            const agentId = this.runtime.agentId;
            const roomId = chatId;
            await this.runtime.ensureConnection(userId, roomId, userName, userName, "telegram");
            const messageId = stringToUuid(message.message_id.toString() + "-" + this.runtime.agentId);
            const imageInfo = await this.processImage(message);
            let messageText = "";
            if ("text" in message) {
                messageText = ctx.match;
            }
            else if ("caption" in message && message.caption) {
                messageText = message.caption;
            }
            const fullText = imageInfo
                ? `${messageText} ${imageInfo.description}`
                : messageText;
            if (!fullText) {
                return;
            }
            const content = {
                text: fullText,
                source: "telegram",
                inReplyTo: "reply_to_message" in message && message.reply_to_message
                    ? stringToUuid(message.reply_to_message.message_id.toString() +
                        "-" +
                        this.runtime.agentId)
                    : undefined,
            };
            const memory = await this.runtime.messageManager.addEmbeddingToMemory({
                id: messageId,
                agentId,
                userId,
                roomId,
                content,
                createdAt: message.date * 1000,
            });
            await this.runtime.messageManager.createMemory(memory, true);
            let state = await this.runtime.composeState(memory);
            state = await this.runtime.updateRecentMessageState(state);
            const shouldRespond = await this._shouldRespond(message, state);
            if (shouldRespond) {
                const context = composeContext({
                    state,
                    template: ((_g = this.runtime.character.templates) === null || _g === void 0 ? void 0 : _g.telegramMessageHandlerTemplate) ||
                        ((_j = (_h = this.runtime.character) === null || _h === void 0 ? void 0 : _h.templates) === null || _j === void 0 ? void 0 : _j.messageHandlerTemplate) ||
                        telegramMessageHandlerTemplate,
                });
                elizaLogger.debug("[handleMessage] context", JSON.stringify(context, null, 2));
                const responseContent = await this._generateResponse(memory, state, context);
                if (!responseContent || !responseContent.text)
                    return;
                const callback = async (content) => {
                    const sentMessages = await this.sendMessageInChunks(ctx, content.text, message.message_id);
                    const memories = [];
                    for (let i = 0; i < sentMessages.length; i++) {
                        const sentMessage = sentMessages[i];
                        const isLastMessage = i === sentMessages.length - 1;
                        const memory = {
                            id: stringToUuid(sentMessage.message_id.toString() + "-" + this.runtime.agentId),
                            agentId,
                            userId,
                            roomId,
                            content: Object.assign(Object.assign({}, content), { text: sentMessage.text, inReplyTo: messageId }),
                            createdAt: sentMessage.date * 1000,
                            embedding: getEmbeddingZeroVector(),
                        };
                        elizaLogger.info(`[eliza.service] memory action ${memory.content.action}`);
                        memory.content.action = !isLastMessage ? "IGNORE" : content.action;
                        await this.runtime.messageManager.createMemory(memory);
                        memories.push(memory);
                    }
                    return memories;
                };
                const responseMessages = await callback(responseContent);
                state = await this.runtime.updateRecentMessageState(state);
                elizaLogger.debug("[eliza.service] processing resulting actions");
                await this.runtime.processActions(memory, responseMessages, state, callback);
                elizaLogger.debug("[eliza.service] evaluating");
                const data = await this.runtime.evaluate(memory, state, shouldRespond);
                elizaLogger.debug(`[eliza.service] evaluated ${data}`);
            }
        }
        catch (error) {
            console.error("❌ Error handling message:", error);
            console.error("Error sending message:", error);
        }
    }
}
export class ElizaService extends BaseService {
    constructor(bot) {
        super();
        let character;
        if (!process.env.ELIZA_CHARACTER_PATH) {
            elizaLogger.info("No ELIZA_CHARACTER_PATH defined, using default character");
            character = defaultCharacter;
        }
        else {
            try {
                const fullPath = resolve(__dirname, "../../..", process.env.ELIZA_CHARACTER_PATH);
                elizaLogger.info(`Loading character from: ${fullPath}`);
                if (!existsSync(fullPath)) {
                    throw new Error(`Character file not found at ${fullPath}`);
                }
                const fileContent = readFileSync(fullPath, "utf-8");
                character = JSON.parse(fileContent);
                elizaLogger.info("Successfully loaded custom character:", character.name);
            }
            catch (error) {
                console.error(`Failed to load character from ${process.env.ELIZA_CHARACTER_PATH}:`, error);
                elizaLogger.info("Falling back to default character");
                character = defaultCharacter;
            }
        }
        const sqlitePath = path.join(__dirname, "..", "..", "..", "eliza.sqlite");
        elizaLogger.info("Using SQLite database at:", sqlitePath);
        const db = new SqliteDatabaseAdapter(new Database(sqlitePath));
        db.init()
            .then(() => {
            elizaLogger.info("Database initialized.");
        })
            .catch((error) => {
            console.error("Failed to initialize database:", error);
            throw error;
        });
        try {
            this.runtime = new AgentRuntime({
                databaseAdapter: db,
                token: process.env.OPENAI_API_KEY || "",
                modelProvider: character.modelProvider || ModelProviderName.OPENAI,
                character,
                conversationLength: 4096,
                plugins: [bootstrapPlugin, collablandPlugin, gateDataPlugin],
                cacheManager: new CacheManager(new MemoryCacheAdapter()),
                logging: true,
            });
            const onChainMemory = new MemoryManager({
                tableName: "onchain",
                runtime: this.runtime,
            });
            this.runtime.registerMemoryManager(onChainMemory);
            this.messageManager = new MessageManager(bot, this.runtime);
            this.bot = bot;
        }
        catch (error) {
            console.error("Failed to initialize Eliza runtime:", error);
            throw error;
        }
    }
    static getInstance(bot) {
        if (!ElizaService.instance) {
            ElizaService.instance = new ElizaService(bot);
        }
        return ElizaService.instance;
    }
    async start() {
        try {
            await StorageService.getInstance().start();
        }
        catch (err) {
            elizaLogger.warn("[eliza] gated storage service is unavailable");
        }
        try {
            this.bot.command("eliza", (ctx) => this.messageManager.handleMessage(ctx));
            elizaLogger.info("Eliza service started successfully");
        }
        catch (error) {
            console.error("Failed to start Eliza service:", error);
            throw error;
        }
    }
    getRuntime() {
        return this.runtime;
    }
    async stop() {
        try {
            elizaLogger.info("Eliza service stopped");
        }
        catch (error) {
            console.error("Error stopping Eliza service:", error);
        }
    }
}
//# sourceMappingURL=eliza.service.js.map