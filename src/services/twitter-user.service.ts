import { SupabaseClient } from "@supabase/supabase-js";
import { SupabaseService } from "./supabase.service.js";
interface TwitterProfile {
  data: {
    id: string;
    name: string;
    username: string;
    description?: string;
    profile_image_url?: string;
    public_metrics?: {
      followers_count: number;
      following_count: number;
      tweet_count: number;
    };
    verified?: boolean;
  };
}

export interface TwitterUser {
  id: string;
  accountaddress: string;
  publickey: string;
  datatoencrypthash: string;
  ciphertext: string;
  profile: TwitterProfile;
}

export class TwitterUserService {
  private static instance: TwitterUserService;
  private supabaseClient: SupabaseClient;

  private constructor() {
    // Don't initialize Supabase client in constructor
  }

  public static getInstance(): TwitterUserService {
    if (!TwitterUserService.instance) {
      TwitterUserService.instance = new TwitterUserService();
    }
    return TwitterUserService.instance;
  }

  private async ensureSupabaseClient() {
    if (!this.supabaseClient) {
      const supabaseService = SupabaseService.getInstance();
      this.supabaseClient = supabaseService.getClient();
    }
  }

  public async createUser(user: TwitterUser): Promise<void> {
    console.log("Creating user on supabase :", user);
    await this.ensureSupabaseClient();
    const newUser = await this.supabaseClient.from("users").insert(user);
    console.log("User added to supabase successfully : ", newUser);
  }

  public async getUserById(id: string): Promise<TwitterUser | null> {
    await this.ensureSupabaseClient();
    const { data, error } = await this.supabaseClient
      .from("users")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      console.error("Error getting user:", error);
      return null;
    }

    return data;
  }

  public async getUserByUsername(
    username: string
  ): Promise<TwitterUser | null> {
    await this.ensureSupabaseClient();
    const { data, error } = await this.supabaseClient
      .from("users")
      .select("*")
      .eq("profile->>username", username)
      .single();

    if (error) {
      console.error("Error getting user by username:", error);
      return null;
    }

    return data;
  }

  public async getUserByAddress(address: string): Promise<TwitterUser | null> {
    await this.ensureSupabaseClient();
    const { data, error } = await this.supabaseClient
      .from("users")
      .select("*")
      .eq("address", address)
      .single();

    if (error) {
      console.error("Error getting user by address:", error);
      return null;
    }

    return data;
  }

  async updateUser(
    id: string,
    updates: Partial<TwitterUser>
  ): Promise<TwitterUser> {
    const { data, error } = await this.supabaseClient
      .from("users")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }
}
