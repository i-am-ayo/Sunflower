import { readLocalStorageJSON, writeLocalStorageJSON } from "lib/localStorage";

/**
 * MetaMask wallet support for Farm Tasks.
 *
 * Stage rewards are paid into the connected wallet's in-game balance (Task
 * Stars credited per address). There is no on-chain transfer, so the deployed
 * offline build works without a backend or contract.
 */

const ADDRESS_KEY = "farmTasks:wallet:address:v1";
const REWARDS_KEY = "farmTasks:wallet:rewards:v1";
const CLAIM_RUN_KEY = "farmTasks:wallet:claimRun:v1";

/** Fired on `window` whenever the connected address changes. */
export const WALLET_CHANGE_EVENT = "farmTasks:wallet-changed";

export interface WalletBalance {
  stars: number;
  coins: number;
}

export type WalletRewards = Record<string, WalletBalance>;

interface EthereumProvider {
  isMetaMask?: boolean;
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
}

const getProvider = (): EthereumProvider | undefined => {
  const ethereum = (window as unknown as { ethereum?: EthereumProvider })
    .ethereum;
  if (!ethereum?.request) return undefined;
  return ethereum;
};

export const isMetaMaskInstalled = (): boolean => !!getProvider()?.isMetaMask;

export const loadWalletAddress = (): string | undefined => {
  const address = readLocalStorageJSON<string>(ADDRESS_KEY);
  return typeof address === "string" && address.startsWith("0x")
    ? address
    : undefined;
};

const notifyWalletChange = () => {
  try {
    window.dispatchEvent(new Event(WALLET_CHANGE_EVENT));
  } catch {
    // ignore environments without a real window (tests)
  }
};

export const saveWalletAddress = (address: string): void => {
  writeLocalStorageJSON(ADDRESS_KEY, address);
  notifyWalletChange();
};

export const disconnectWallet = (): void => {
  try {
    localStorage.removeItem(ADDRESS_KEY);
  } catch {
    // ignore quota / privacy mode errors
  }
  notifyWalletChange();
};

/** Asks MetaMask for the first account; rejects when it isn't installed. */
export const connectMetaMask = async (): Promise<string> => {
  const provider = getProvider();
  if (!provider || !provider.isMetaMask) throw new Error("METAMASK_MISSING");

  const accounts = (await provider.request({
    method: "eth_requestAccounts",
  })) as string[];

  const address = accounts?.[0];
  if (!address) throw new Error("METAMASK_NO_ACCOUNT");

  return address;
};

/**
 * Loads the per-address reward ledger. Older saves stored a plain star count,
 * so normalise those to `{ stars, coins: 0 }`.
 */
export const loadWalletRewards = (): WalletRewards => {
  const stored =
    readLocalStorageJSON<Record<string, WalletBalance | number>>(REWARDS_KEY);
  if (!stored) return {};

  return Object.entries(stored).reduce<WalletRewards>(
    (acc, [address, value]) => {
      acc[address] =
        typeof value === "number"
          ? { stars: value, coins: 0 }
          : { stars: value?.stars ?? 0, coins: value?.coins ?? 0 };
      return acc;
    },
    {},
  );
};

/** Credits claimed Task Stars and coins to a wallet, returning the ledger. */
export const creditWalletReward = (
  address: string,
  stars: number,
  coins: number,
): WalletRewards => {
  const rewards = loadWalletRewards();
  const current = rewards[address] ?? { stars: 0, coins: 0 };
  const next = {
    ...rewards,
    [address]: {
      stars: current.stars + stars,
      coins: current.coins + coins,
    },
  };
  writeLocalStorageJSON(REWARDS_KEY, next);
  return next;
};

/**
 * The current Farm Tasks run. The stage-5 restart bumps it so the on-chain
 * claim key moves on and the player can claim MTOM again in the next run.
 * Lives under the preserved `farmTasks:wallet:` prefix, so it survives the
 * restart (which only clears progress, claims and the farm snapshot).
 */
export const loadClaimRun = (): number => {
  const run = readLocalStorageJSON<number>(CLAIM_RUN_KEY);
  return typeof run === "number" && Number.isFinite(run) && run > 0
    ? Math.floor(run)
    : 1;
};

export const bumpClaimRun = (): number => {
  const next = loadClaimRun() + 1;
  writeLocalStorageJSON(CLAIM_RUN_KEY, next);
  return next;
};

export const shortenAddress = (address: string): string =>
  `${address.slice(0, 5)}...${address.slice(-4)}`;
