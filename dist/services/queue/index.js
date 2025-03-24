import { Queue, Worker } from "bullmq";
import { processMention } from "./processors.js";
import dotenv from "dotenv";
dotenv.config();
export const mentionsQueue = new Queue("mentions", {
    connection: {
        url: process.env.REDIS_URL,
    },
});
export const initializeWorkers = () => {
    new Worker("mentions", processMention, {
        connection: { url: process.env.REDIS_URL },
    });
};
export const queueMention = async (mention) => {
    await mentionsQueue.add("process-mention", mention, {
        jobId: mention.id,
        removeOnComplete: true,
    });
};
//# sourceMappingURL=index.js.map