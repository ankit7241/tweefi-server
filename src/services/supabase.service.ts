import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { BaseService } from "./base.service.js";

export class SupabaseService extends BaseService {
  private static instance: SupabaseService;
  private client: SupabaseClient | null = null;

  private constructor() {
    super();
  }

  public static getInstance(): SupabaseService {
    if (!SupabaseService.instance) {
      console.log("Created Supabase instance successfully");
      SupabaseService.instance = new SupabaseService();
    }
    return SupabaseService.instance;
  }

  public async start(): Promise<void> {
    console.log("Starting Supabase service...");

    if (!process.env.SUPABASE_URL) {
      console.error("SUPABASE_URL is not set in environment variables");
      throw new Error("SUPABASE_URL is required");
    }
    if (!process.env.SUPABASE_KEY) {
      console.error("SUPABASE_KEY is not set in environment variables");
      throw new Error("SUPABASE_KEY is required");
    }

    try {
      console.log(
        "Initializing Supabase client with URL:",
        process.env.SUPABASE_URL
      );
      this.client = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_KEY,
        {}
      );

      console.log("Supabase client initialized and connected successfully");
    } catch (error) {
      console.error("Supabase initialization error:", error);
      if (error instanceof Error) {
        console.error("Error details:", error.message);
        console.error("Stack trace:", error.stack);
      }
      throw new Error("Failed to initialize Supabase client");
    }
  }

  public async stop(): Promise<void> {
    // Nothing to clean up
  }

  public getClient(): SupabaseClient {
    if (!this.client) {
      throw new Error("Supabase client not initialized");
    }
    return this.client;
  }
}
