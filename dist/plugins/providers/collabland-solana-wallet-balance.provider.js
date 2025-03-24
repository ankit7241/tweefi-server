import { chainMap } from "../../utils.js";
import { clusterApiUrl, Connection, PublicKey, LAMPORTS_PER_SOL, } from "@solana/web3.js";
export class CollabLandSolanaWalletBalanceProvider {
    async get(_runtime, _message, _state) {
        let chain = null;
        const onChainMemoryManager = _runtime.getMemoryManager("onchain");
        const onChainMemories = await onChainMemoryManager.getMemories({
            roomId: _message.roomId,
            unique: false,
        });
        console.log("[CollabLandSolanaWalletBalanceProvider] onChainMemories", onChainMemories);
        for (const memory of onChainMemories) {
            if (memory.content.chain !== undefined) {
                chain = memory.content.chain;
                break;
            }
        }
        if (chain == null) {
            return "";
        }
        console.log("[CollabLandSolanaWalletBalanceProvider] chain found in memories", chain);
        const chainId = chainMap[chain];
        if (!chainId) {
            return "";
        }
        console.log("[CollabLandSolanaWalletBalanceProvider] chainId", chainId);
        if (!chainId.startsWith("sol")) {
            return "";
        }
        let account = null;
        for (const memory of onChainMemories) {
            if (memory.content.smartAccount &&
                memory.content.type === "solana" &&
                memory.content.network == chainId) {
                account = memory.content;
                break;
            }
        }
        if (!(account === null || account === void 0 ? void 0 : account.smartAccount)) {
            return "";
        }
        console.log("[CollabLandSolanaWalletBalanceProvider] account found in memories", account);
        const connection = new Connection(clusterApiUrl(chainId === "sol_dev" ? "devnet" : "mainnet-beta"), "confirmed");
        const wallet = new PublicKey(account.smartAccount);
        const balance = await connection.getBalance(wallet);
        const formattedBalance = balance / LAMPORTS_PER_SOL;
        console.log("[CollabLandSolanaWalletBalanceProvider] balance", formattedBalance);
        return `Agent's balance is ${formattedBalance} SOL on ${chain}`;
    }
}
//# sourceMappingURL=collabland-solana-wallet-balance.provider.js.map