import React, { useEffect, useState } from "react";

import metamaskIcon from "assets/icons/metamask_pixel.png";
import { RoundButton } from "components/ui/RoundButton";
import { PIXEL_SCALE } from "features/game/lib/constants";
import { useAppTranslation } from "lib/i18n/useAppTranslations";

import {
  connectMetaMask,
  disconnectWallet,
  loadWalletAddress,
  saveWalletAddress,
  shortenAddress,
  WALLET_CHANGE_EVENT,
} from "../lib/wallet";

/**
 * HUD button that connects (or disconnects) MetaMask. Farm Task stage rewards
 * are credited to this address - see `lib/wallet.ts`.
 */
export const MetaMaskButton: React.FC = () => {
  const { t } = useAppTranslation();
  const [address, setAddress] = useState<string | undefined>(loadWalletAddress);
  const [error, setError] = useState<string>();

  // Keep in sync with the panel's connect/disconnect controls.
  useEffect(() => {
    const sync = () => setAddress(loadWalletAddress());
    window.addEventListener(WALLET_CHANGE_EVENT, sync);
    return () => window.removeEventListener(WALLET_CHANGE_EVENT, sync);
  }, []);

  const handleClick = async () => {
    if (address) {
      disconnectWallet();
      setAddress(undefined);
      return;
    }

    try {
      const next = await connectMetaMask();
      saveWalletAddress(next);
      setAddress(next);
      setError(undefined);
    } catch (e) {
      const code = e instanceof Error ? e.message : "";
      setError(
        code === "METAMASK_MISSING"
          ? t("farmTasks.wallet.missing")
          : t("farmTasks.wallet.rejected"),
      );
      window.setTimeout(() => setError(undefined), 4000);
    }
  };

  return (
    <div className="relative">
      <RoundButton onClick={handleClick}>
        <img
          src={metamaskIcon}
          className="absolute group-active:translate-y-[2px]"
          style={{
            top: `${PIXEL_SCALE * 3}px`,
            left: `${PIXEL_SCALE * 3.5}px`,
            width: `${PIXEL_SCALE * 13}px`,
          }}
        />
      </RoundButton>

      {(address || error) && (
        <div className="absolute left-12 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-sm bg-black/80 px-1 py-0.5">
          <p className="text-[10px] leading-none text-white">
            {error ?? shortenAddress(address as string)}
          </p>
        </div>
      )}
    </div>
  );
};
