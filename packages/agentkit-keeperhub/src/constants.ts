/** Basis URL layanan KeeperHub. */
export const KEEPERHUB_BASE_URL = "https://app.keeperhub.com";

/**
 * Chain yang didukung KeeperHub per 16 Sep 2026, dibaca dari
 * `GET https://app.keeperhub.com/api/chains` (endpoint publik, tanpa auth).
 *
 * Gnosis (100) SENGAJA tidak ada di sini: KeeperHub tidak mendukungnya, dan
 * mendaftarkannya hanya akan membuat aksi gagal jauh di belakang.
 */
export const SUPPORTED_CHAIN_IDS = [
  1, 10, 56, 137, 4217, 4663, 8453, 9745, 16661, 42161, 43114, // mainnet
  97, 9746, 16602, 42431, 43113, 46630, 80002, 84532, 421614, 11155111, 11155420, // testnet
] as const;

export const NETWORK_ID_TO_CHAIN_ID: Record<string, number> = {
  "ethereum-mainnet": 1,
  "optimism-mainnet": 10,
  "bnb-mainnet": 56,
  "polygon-mainnet": 137,
  "base-mainnet": 8453,
  "arbitrum-mainnet": 42161,
  "avalanche-mainnet": 43114,
  "base-sepolia": 84532,
  "ethereum-sepolia": 11155111,
  "arbitrum-sepolia": 421614,
  "optimism-sepolia": 11155420,
  "polygon-amoy": 80002,
};
