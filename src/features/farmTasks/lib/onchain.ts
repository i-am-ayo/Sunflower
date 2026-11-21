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
 * The MeadowFarm Sepolia deployment that ships with the teacher's package.
 * Stage vouchers need his reward-signer key (not in the archive), but the
 * token balance and the one-off faucet are open to any wallet.
 */
export const MEADOW_CHAIN = {
  game: "0x41370b425645c8552D04e19F8Ba003893225D57D" as Address,
  tom: "0x74a9736006abE045E1cbaa7670E8bf2986Ea433a" as Address,
  explorer: "https://sepolia.etherscan.io",
  faucetAmount: 200,
} as const;

const GAME_ABI = parseAbi([
  "function faucet()",
  "function faucetClaimed(address) view returns (bool)",
]);

const TOKEN_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
]);

const RPC_URL = "https://ethereum-sepolia-rpc.publicnode.com";

export interface OnchainTomState {
  balance: string;
  faucetClaimed: boolean;
}

const getPublicClient = () =>
  createPublicClient({ chain: sepolia, transport: http(RPC_URL) });

const getWalletClient = () => {
  const ethereum = (window as { ethereum?: EIP1193Provider }).ethereum;
  if (!ethereum) throw new Error("No browser wallet found");

  return createWalletClient({
    chain: sepolia,
    transport: custom(ethereum),
  });
};

export const readOnchainTom = async (
  address: Address,
): Promise<OnchainTomState> => {
  const client = getPublicClient();

  const [raw, decimals, faucetClaimed] = await Promise.all([
    client.readContract({
      address: MEADOW_CHAIN.tom,
      abi: TOKEN_ABI,
      functionName: "balanceOf",
      args: [address],
    }),
    client.readContract({
      address: MEADOW_CHAIN.tom,
      abi: TOKEN_ABI,
      functionName: "decimals",
    }),
    client.readContract({
      address: MEADOW_CHAIN.game,
      abi: GAME_ABI,
      functionName: "faucetClaimed",
      args: [address],
    }),
  ]);

  return {
    balance: formatUnits(raw, decimals),
    faucetClaimed,
  };
};

/** Claims the one-off 200 test TOM faucet on Sepolia. */
export const claimOnchainFaucet = async (address: Address) => {
  const client = getWalletClient();
  const account = address;

  try {
    await client.switchChain({ id: sepolia.id });
  } catch {
    await client.addChain({ chain: sepolia });
    await client.switchChain({ id: sepolia.id });
  }

  return client.writeContract({
    address: MEADOW_CHAIN.game,
    abi: GAME_ABI,
    functionName: "faucet",
    account,
    chain: sepolia,
  });
};
