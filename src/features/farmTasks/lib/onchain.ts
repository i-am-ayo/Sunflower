import {
  createPublicClient,
  createWalletClient,
  custom,
  formatUnits,
  http,
  parseAbi,
  type Address,
  type EIP1193Provider,
} from "viem";
import { sepolia } from "viem/chains";

/**
 * Our own FarmTasks reward token (contracts/FarmRewards.sol), deployed by the
 * player on Sepolia. Set `VITE_FARM_REWARDS_ADDRESS` to the deployed address.
 */
const configuredAddress = (
  import.meta.env as Record<string, string | undefined>
).VITE_FARM_REWARDS_ADDRESS;

export const REWARDS_ADDRESS: Address | undefined =
  configuredAddress && /^0x[0-9a-fA-F]{40}$/.test(configuredAddress)
    ? (configuredAddress as Address)
    : undefined;

export const REWARDS_EXPLORER = "https://sepolia.etherscan.io";

const RPC_URL = "https://ethereum-sepolia-rpc.publicnode.com";

const REWARDS_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function claimedMask(address, uint64) view returns (uint8)",
  "function claimRewards(uint64 day, uint8 mask) returns (uint256)",
]);

export interface OnchainRewardState {
  balance: string;
  claimedMask: number;
}

const getPublicClient = () =>
  createPublicClient({ chain: sepolia, transport: http(RPC_URL) });

const getWalletClient = () => {
  const ethereum = (window as { ethereum?: EIP1193Provider }).ethereum;
  if (!ethereum) throw new Error("No browser wallet found");

  return createWalletClient({ chain: sepolia, transport: custom(ethereum) });
};

export const readOnchainRewards = async (
  address: Address,
  day: number,
): Promise<OnchainRewardState> => {
  if (!REWARDS_ADDRESS) throw new Error("Rewards contract not configured");

  const client = getPublicClient();

  const [raw, decimals, claimedMask] = await Promise.all([
    client.readContract({
      address: REWARDS_ADDRESS,
      abi: REWARDS_ABI,
      functionName: "balanceOf",
      args: [address],
    }),
    client.readContract({
      address: REWARDS_ADDRESS,
      abi: REWARDS_ABI,
      functionName: "decimals",
    }),
    client.readContract({
      address: REWARDS_ADDRESS,
      abi: REWARDS_ABI,
      functionName: "claimedMask",
      args: [address, BigInt(day)],
    }),
  ]);

  return {
    balance: formatUnits(raw, decimals),
    claimedMask: Number(claimedMask),
  };
};

/** Pays the given stage mask (bit 0 = stage 1) to the player on Sepolia. */
export const claimOnchainRewards = async (
  address: Address,
  day: number,
  mask: number,
): Promise<`0x${string}`> => {
  if (!REWARDS_ADDRESS) throw new Error("Rewards contract not configured");

  const client = getWalletClient();

  try {
    await client.switchChain({ id: sepolia.id });
  } catch {
    await client.addChain({ chain: sepolia });
    await client.switchChain({ id: sepolia.id });
  }

  return client.writeContract({
    address: REWARDS_ADDRESS,
    abi: REWARDS_ABI,
    functionName: "claimRewards",
    args: [BigInt(day), mask],
    account: address,
    chain: sepolia,
  });
};
