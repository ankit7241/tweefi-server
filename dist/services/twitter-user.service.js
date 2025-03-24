import { SupabaseService } from "./supabase.service.js";
export class TwitterUserService {
    constructor() {
    }
    static getInstance() {
        if (!TwitterUserService.instance) {
            TwitterUserService.instance = new TwitterUserService();
        }
        return TwitterUserService.instance;
    }
    async ensureSupabaseClient() {
        if (!this.supabaseClient) {
            const supabaseService = SupabaseService.getInstance();
            this.supabaseClient = supabaseService.getClient();
        }
    }
    async createUser(user) {
        console.log("Creating user on supabase :", user);
        await this.ensureSupabaseClient();
        const newUser = await this.supabaseClient.from("users").insert(user);
        console.log("User added to supabase successfully : ", newUser);
    }
    async getUserById(id) {
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
    async getUserByUsername(username) {
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
    async getUserByAddress(address) {
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
    async updateUser(id, updates) {
        const { data, error } = await this.supabaseClient
            .from("users")
            .update(updates)
            .eq("id", id)
            .select()
            .single();
        if (error)
            throw error;
        return data;
    }
}
//# sourceMappingURL=twitter-user.service.js.map