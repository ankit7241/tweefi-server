import { Scraper } from "agent-twitter-client";
import dotenv from "dotenv";
// import fs from "fs";
// import path, { resolve } from "path";
// import { fileURLToPath } from "url";
// import { dirname } from "path";
// Convert ESM module URL to filesystem path
// const __filename = fileURLToPath(import.meta.url);
// const __dirname = dirname(__filename);

// Load environment variables from root .env file
dotenv.config();

// const COOKIES_PATH = path.join(
//   __dirname,
//   "..",
//   "..",
//   "..",
//   "..",
//   "twitter-cookies.json"
// );

export const scraper = new Scraper();

// Initialize scraper with authentication
export const initializeScraper = async () => {
  try {
    console.log(" Initializing Twitter client...");
    // console.log("Cookies path : ", COOKIES_PATH);
    // First try to authenticate with stored cookies from file
    // if (fs.existsSync(COOKIES_PATH)) {
    //   try {
    //     const storedCookies = JSON.parse(
    //       fs.readFileSync(COOKIES_PATH, "utf-8")
    //     ).cookies;
    //     await scraper.setCookies(storedCookies);
    //     const isLoggedIn = await scraper.isLoggedIn();
    //     if (isLoggedIn) {
    //       console.log(" Successfully authenticated with stored cookies");
    //       return;
    //     }
    //   } catch (error) {
    //     console.warn(
    //       " Failed to authenticate with stored cookies, falling back to credentials"
    //     );
    //   }
    // }

    // Fall back to username/password authentication
    const username = process.env.TWITTER_USERNAME;
    const password = process.env.TWITTER_PASSWORD;
    const email = process.env.TWITTER_EMAIL;

    if (!username || !password) {
      throw new Error("Twitter credentials not found in environment variables");
    }

    await scraper.login(
      username,
      password,
      email,
      undefined,
      process.env.TWITTER_APP_KEY,
      process.env.TWITTER_APP_SECRET,
      process.env.TWITTER_COOKIES,
      process.env.TWITTER_CT0
    );
    console.log(" Successfully logged in with credentials");

    // Store cookies in file for future use
    // const newCookies = await scraper.getCookies();
    // console.log(" Saving cookies to file for future use");
    // fs.writeFileSync(
    //   COOKIES_PATH,
    //   JSON.stringify({
    //     cookies: newCookies.map((cookie) => cookie.toString()),
    //   })
    // );
    // console.log(` Cookies saved to: ${COOKIES_PATH}`);
  } catch (error) {
    console.error(" Twitter client initialization failed:", error);
    throw error;
  }
};

// Send a tweet
export const sendTweet = async (text: string, replyToId?: string) => {
  try {
    console.log(` Sending tweet${replyToId ? " as reply" : ""}...`);
    const result = await scraper.sendTweet(text, replyToId);
    console.log(" Tweet sent successfully");
    return result;
  } catch (error) {
    console.error(" Failed to send tweet:", error);
    throw error;
  }
};

// Initialize immediately
initializeScraper().catch(console.error);
