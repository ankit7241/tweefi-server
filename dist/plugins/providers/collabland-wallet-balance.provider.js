import { ethers } from "ethers";
import { chainMap } from "../../utils.js";
export class CollabLandWalletBalanceProvider {
    async get(_runtime, _message, _state) {
        let chain = null;
        const onChainMemoryManager = _runtime.getMemoryManager("onchain");
        const onChainMemories = await onChainMemoryManager.getMemories({
            roomId: _message.roomId,
            unique: false,
        });
        console.log("[CollabLandWalletBalanceProvider] onChainMemories", onChainMemories);
        for (const memory of onChainMemories) {
            if (memory.content.chain !== undefined) {
                chain = memory.content.chain;
                break;
            }
        }
        if (chain == null) {
            return "";
        }
        console.log("[CollabLandWalletBalanceProvider] chain found in memories", chain);
        const chainId = chainMap[chain];
        if (!chainId) {
            return "";
        }
        let account = null;
        for (const memory of onChainMemories) {
            if (memory.content.smartAccount &&
                memory.content.type === "evm" &&
                memory.content.chainId == chainId) {
                account = memory.content;
                break;
            }
        }
        if (!(account === null || account === void 0 ? void 0 : account.smartAccount)) {
            return "";
        }
        console.log("[CollabLandWalletBalanceProvider] account found in memories", account);
        const provider = ethers.getDefaultProvider(account.chainId);
        const balance = await provider.getBalance(account.smartAccount);
        const formattedBalance = ethers.formatEther(balance);
        console.log("[CollabLandWalletBalanceProvider] balance", formattedBalance);
        return `Agent's balance is ${formattedBalance} ETH on ${chain}`;
    }
}
//# sourceMappingURL=collabland-wallet-balance.provider.js.map