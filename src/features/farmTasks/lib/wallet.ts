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

/** Fired on `window` whenever the connected address changes. */
export const WALLET_CHANGE_EVENT = "farmTasks:wallet-changed";

export type WalletRewards = Record<string, number>;

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

export const loadWalletRewards = (): WalletRewards =>
  readLocalStorageJSON<WalletRewards>(REWARDS_KEY) ?? {};

/** Credits claimed Task Stars to a wallet address, returning the new ledger. */
export const creditWalletReward = (
  address: string,
  stars: number,
): WalletRewards => {
  const rewards = loadWalletRewards();
  const next = {
    ...rewards,
    [address]: (rewards[address] ?? 0) + stars,
  };
  writeLocalStorageJSON(REWARDS_KEY, next);
  return next;
};

export const shortenAddress = (address: string): string =>
  `${address.slice(0, 5)}...${address.slice(-4)}`;
