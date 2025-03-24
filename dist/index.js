import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import helloRouter from "./routes/hello.js";
import moveAgentRouter from "./routes/moveagent.routes.js";
import tweetRouter from "./routes/tweet.routes.js";
import { NgrokService } from "./services/ngrok.service.js";
import twitterRouter from "./routes/twitter.js";
import cookieParser from "cookie-parser";
import { isHttpError } from "http-errors";
import { startMentionMonitor } from "./services/twitter/monitor.js";
import { initializeScraper } from "./services/twitter/scraper.js";
import { initializeWorkers } from "./services/queue/index.js";
import { SupabaseService } from "./services/supabase.service.js";
import { CacheService } from "./services/cache.service.js";
const services = [];
dotenv.config();
console.log("Supabase URL:", process.env.SUPABASE_URL ? "Set" : "Not set");
console.log("Supabase Key:", process.env.SUPABASE_KEY ? "Set" : "Not set");
const app = express();
const port = process.env.PORT || 3001;
app.use(cors());
app.use(express.json());
app.use(cookieParser());
app.use("/hello", helloRouter);
app.use("/api", moveAgentRouter);
app.use("/api", tweetRouter);
app.use("/auth/twitter", twitterRouter);
app.use((_req, _res, _next) => {
    _res.status(404).json({
        message: `Route ${_req.method} ${_req.url} not found`,
    });
});
app.use((_err, _req, _res, _next) => {
    if (isHttpError(_err)) {
        _res.status(_err.statusCode).json({
            message: _err.message,
        });
    }
    else if (_err instanceof Error) {
        _res.status(500).json({
            message: `Internal Server Error: ${_err.message}`,
        });
    }
    else {
        _res.status(500).json({
            message: `Internal Server Error`,
        });
    }
});
app.listen(port, async () => {
    try {
        console.log(`Server running on PORT: ${port}`);
        console.log("Server Environment:", process.env.NODE_ENV);
        const cacheService = await CacheService.getInstance();
        await cacheService.start();
        services.push(cacheService);
        console.log("Cache service initialized");
        const supabaseService = SupabaseService.getInstance();
        await supabaseService.start();
        services.push(supabaseService);
        console.log("Supabase service initialized");
        const ngrokService = NgrokService.getInstance();
        await ngrokService.start();
        services.push(ngrokService);
        const ngrokUrl = ngrokService.getUrl();
        console.log("NGROK URL:", ngrokUrl);
        await initializeScraper();
        initializeWorkers();
        startMentionMonitor();
        console.log("Twitter services initialized");
    }
    catch (e) {
        console.error("Failed to start server:", e);
        process.exit(1);
    }
});
async function gracefulShutdown() {
    console.log("Shutting down gracefully...");
    await Promise.all(services.map((service) => service.stop()));
    process.exit(0);
}
process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);
//# sourceMappingURL=index.js.map