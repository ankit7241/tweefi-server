import { Queue, Worker } from "bullmq";
import { processMention } from "./processors.js";
import dotenv from "dotenv";
// import { fileURLToPath } from "url";
// import { dirname, resolve } from "path";
// const __filename = fileURLToPath(import.meta.url);
// const __dirname = dirname(__filename);

// Load environment variables from root .env file
dotenv.config();
// Create queues
export const mentionsQueue = new Queue("mentions", {
  connection: {
    url: process.env.REDIS_URL,
  },
});

// Initialize workers
export const initializeWorkers = () => {
  new Worker("mentions", processMention, {
    connection: { url: process.env.REDIS_URL },
  });
};

// Helper to add mention to queue
export const queueMention = async (mention: {
  username: string;
  text: string;
  id: string;
  userId: string;
}) => {
  await mentionsQueue.add("process-mention", mention, {
    jobId: mention.id, // Use tweet ID as job ID to prevent duplicates
    removeOnComplete: true,
  });
};
