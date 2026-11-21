import React, { useContext, useEffect, useRef, useState } from "react";
import { useSelector } from "@xstate/react";

import { Context } from "features/game/GameProvider";
import type { MachineState } from "features/game/lib/gameMachine";
import { Modal } from "components/ui/Modal";
import { Panel } from "components/ui/Panel";
import { Button } from "components/ui/Button";
import { Label } from "components/ui/Label";
import { ResizableBar } from "components/ui/ProgressBar";
import Switch from "components/ui/Switch";
import { SUNNYSIDE } from "assets/sunnyside";
import { PIXEL_SCALE } from "features/game/lib/constants";
import { useNow } from "lib/utils/hooks/useNow";
import { useAppTranslation } from "lib/i18n/useAppTranslations";
import trophyIcon from "assets/icons/trophy.png";
import metamaskIcon from "assets/icons/metamask_pixel.png";

import {
  applyAutoPlay,
  claimStage,
  createTaskState,
  FARM_TASK_STAGES,
  getGoalProgress,
  getTaskDay,
  isAllStagesClaimed,
  isAttemptComplete,
  isAttemptExpired,
  normalizeTaskState,
  setAutoPlay,
  startStage,
  type FarmTaskKind,
  type FarmTaskState,
} from "../lib/rules";
import {
  getActiveTaskStorageKey,
  loadTaskState,
  saveTaskState,
} from "../lib/storage";
import {
  REWARDS_ADDRESS,
  REWARDS_EXPLORER,
  claimOnchainRewards,
  isAlreadyClaimedError,
  readOnchainRewards,
  type OnchainRewardState,
} from "../lib/onchain";
import {
  connectMetaMask,
  creditWalletReward,
  disconnectWallet,
  loadWalletAddress,
  loadWalletRewards,
  saveWalletAddress,
  shortenAddress,
  WALLET_CHANGE_EVENT,
  type WalletRewards,
} from "../lib/wallet";

const _farmActivity = (state: MachineState) => state.context.state.farmActivity;
const _username = (state: MachineState) => state.context.state.username;

const GOAL_KEYS: Record<
  FarmTaskKind,
  | "farmTasks.goal.plant"
  | "farmTasks.goal.harvest"
  | "farmTasks.goal.cook"
  | "farmTasks.goal.deliver"
> = {
  plant: "farmTasks.goal.plant",
  harvest: "farmTasks.goal.harvest",
  cook: "farmTasks.goal.cook",
  deliver: "farmTasks.goal.deliver",
};

const formatCountdown = (milliseconds: number): string => {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

interface Props {
  show: boolean;
  onHide: () => void;
  onOpen?: () => void;
}

export const FarmTasksPanel: React.FC<Props> = ({ show, onHide, onOpen }) => {
  const { gameService } = useContext(Context);
  const { t } = useAppTranslation();

  const farmActivity = useSelector(gameService, _farmActivity);
  const username = useSelector(gameService, _username);

  const storageKey = getActiveTaskStorageKey(username);
  const [taskState, setTaskState] = useState<FarmTaskState>(
    () => loadTaskState(storageKey, Date.now()) ?? createTaskState(Date.now()),
  );

  const [walletAddress, setWalletAddress] = useState<string | undefined>(
    loadWalletAddress,
  );
  const [rewards, setRewards] = useState<WalletRewards>(loadWalletRewards);
  const [walletError, setWalletError] = useState<string>();
  // Live Sepolia MTOM balance from our deployed FarmRewards contract.
  const [onchain, setOnchain] = useState<OnchainRewardState>();
  const [onchainBusy, setOnchainBusy] = useState(false);
  const [onchainError, setOnchainError] = useState<string>();
  // Stage-completion banner shown in the HUD, even when the panel is closed.
  const [notice, setNotice] = useState<string>();
  // null until the first render, so loading a finished stage stays quiet.
  const wasComplete = useRef<boolean | null>(null);
  const wasAllDone = useRef<boolean | null>(null);
  const wasExpired = useRef<boolean | null>(null);
  // Rewards already paid to the connected wallet (stars + claimed stages).
  const creditedStars = useRef(taskState.stars);
  const creditedClaimed = useRef(taskState.claimed);

  const now = useNow({
    live: show || taskState.autoPlay,
    intervalMs: 1000,
    autoEndAt: taskState.attempt?.endsAt,
  });
  const taskDay = getTaskDay(now);

  const update = (next: FarmTaskState) => {
    setTaskState(next);
    saveTaskState(storageKey, next);
  };

  // Reload when the farm changes and reset once the UTC day rolls over.
  useEffect(() => {
    setTaskState(
      loadTaskState(storageKey, Date.now()) ?? createTaskState(Date.now()),
    );
  }, [storageKey]);

  useEffect(() => {
    const today = getTaskDay(now);
    if (taskState.day === today) return;

    update(normalizeTaskState(taskState, now));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, taskState.day]);

  // Auto-play starts, claims and retries stages without user input.
  useEffect(() => {
    const next = applyAutoPlay(taskState, farmActivity, now);
    if (next !== taskState) update(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskState, farmActivity, now]);

  // Delivery renewal and offline autosave live in `FarmTasksSync` (rendered by
  // the HUD), so they keep working while this panel is closed.

  // The HUD button can also connect/disconnect the wallet.
  useEffect(() => {
    const sync = () => {
      setWalletAddress(loadWalletAddress());
      setRewards(loadWalletRewards());
    };
    window.addEventListener(WALLET_CHANGE_EVENT, sync);
    return () => window.removeEventListener(WALLET_CHANGE_EVENT, sync);
  }, []);

  // Pay newly claimed rewards (stars + coins) into the connected wallet.
  useEffect(() => {
    const newClaims = taskState.claimed.filter(
      (stage) => !creditedClaimed.current.includes(stage),
    );
    const starDelta = taskState.stars - creditedStars.current;

    creditedClaimed.current = taskState.claimed;
    creditedStars.current = taskState.stars;

    if (!walletAddress || (newClaims.length === 0 && starDelta <= 0)) return;

    const coins = newClaims.reduce(
      (total, stage) => total + (FARM_TASK_STAGES[stage - 1]?.coinReward ?? 0),
      0,
    );

    setRewards(
      creditWalletReward(walletAddress, Math.max(0, starDelta), coins),
    );
  }, [taskState.claimed, taskState.stars, walletAddress]);

  const stage = FARM_TASK_STAGES[taskState.stage - 1];
  const attempt = taskState.attempt;
  const goals = getGoalProgress(taskState, farmActivity);
  const complete = isAttemptComplete(taskState, farmActivity, now);
  const expired = isAttemptExpired(taskState, now);
  const allDone = isAllStagesClaimed(taskState);

  // Stages claimed in-game that our Sepolia contract has not paid yet.
  const claimedMask = taskState.claimed.reduce(
    (mask, stage) => mask | (1 << (stage - 1)),
    0,
  );
  const payoutMask = claimedMask & ~(onchain?.claimedMask ?? 0);
  const payoutCoins = FARM_TASK_STAGES.filter(
    (stage) => payoutMask & (1 << (stage.stage - 1)),
  ).reduce((total, stage) => total + stage.coinReward, 0);

  // Tell the player the moment a stage finishes, panel open or not.
  useEffect(() => {
    if (wasComplete.current === null) {
      wasComplete.current = complete;
      return;
    }

    if (complete && !wasComplete.current && stage) {
      setNotice(
        t(
          taskState.autoPlay
            ? "farmTasks.notify.credited"
            : "farmTasks.notify.claim",
          {
            stage: stage.stage,
            coins: stage.coinReward,
            stars: stage.reward,
          },
        ),
      );
    }

    wasComplete.current = complete;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [complete, stage, taskState.autoPlay]);

  useEffect(() => {
    if (wasAllDone.current === null) {
      wasAllDone.current = allDone;
      return;
    }

    if (allDone && !wasAllDone.current) {
      setNotice(t("farmTasks.notify.allDone"));
    }

    wasAllDone.current = allDone;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allDone]);

  // Auto-hide the banner.
  useEffect(() => {
    if (!notice) return;

    const timeout = window.setTimeout(() => setNotice(undefined), 6000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  // Warn when a stage's timer runs out (auto-play then restarts it silently).
  useEffect(() => {
    const attemptStage = taskState.attempt?.stage;

    if (wasExpired.current === null) {
      wasExpired.current = expired;
      return;
    }

    if (expired && !wasExpired.current && attemptStage) {
      setNotice(t("farmTasks.notify.expired", { stage: attemptStage }));
    }

    wasExpired.current = expired;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expired, taskState.attempt?.stage]);

  const handleStart = () => update(startStage(taskState, now, farmActivity));
  const handleClaim = () => update(claimStage(taskState, farmActivity, now));

  const handleConnect = async () => {
    try {
      const address = await connectMetaMask();
      saveWalletAddress(address);
      setWalletError(undefined);
    } catch (e) {
      const code = e instanceof Error ? e.message : "";
      setWalletError(
        code === "METAMASK_MISSING"
          ? t("farmTasks.wallet.missing")
          : t("farmTasks.wallet.rejected"),
      );
    }
  };

  const handleDisconnect = () => {
    disconnectWallet();
    setWalletError(undefined);
  };

  // Read the Sepolia MTOM balance straight from our deployed contract.
  useEffect(() => {
    if (!walletAddress || !REWARDS_ADDRESS) {
      setOnchain(undefined);
      return;
    }

    let cancelled = false;
    readOnchainRewards(walletAddress as `0x${string}`, taskDay)
      .then((state) => {
        if (!cancelled) setOnchain(state);
      })
      .catch(() => {
        if (!cancelled) setOnchain(undefined);
      });

    return () => {
      cancelled = true;
    };
  }, [walletAddress, taskDay]);

  const handlePayOnchain = async () => {
    if (!walletAddress || !payoutMask) return;

    const payingMask = payoutMask;

    setOnchainBusy(true);
    setOnchainError(undefined);
    try {
      await claimOnchainRewards(
        walletAddress as `0x${string}`,
        taskDay,
        payingMask,
      );
      // Record the transfer immediately: the RPC read below can briefly return
      // the pre-claim mask, which used to leave the button enabled and let a
      // second click revert with AlreadyClaimed().
      setOnchain((prev) => ({
        balance: prev?.balance ?? "0",
        claimedMask: (prev?.claimedMask ?? 0) | payingMask,
      }));
      setOnchain(
        await readOnchainRewards(walletAddress as `0x${string}`, taskDay),
      );
    } catch (error) {
      if (isAlreadyClaimedError(error)) {
        setOnchain((prev) => ({
          balance: prev?.balance ?? "0",
          claimedMask: (prev?.claimedMask ?? 0) | payingMask,
        }));
        setOnchainError(t("farmTasks.onchain.already"));
      } else {
        setOnchainError(t("farmTasks.onchain.error"));
      }
    } finally {
      setOnchainBusy(false);
    }
  };

  return (
    <>
      {notice && (
        <div
          className="fixed left-4 bottom-24 z-[100] max-w-[320px] cursor-pointer"
          onClick={() => {
            onOpen?.();
            setNotice(undefined);
          }}
        >
          <Panel>
            <div className="flex items-center space-x-2 p-2">
              <img src={trophyIcon} className="w-5" />
              <p className="text-xs">{notice}</p>
            </div>
          </Panel>
        </div>
      )}

      <Modal show={show} onHide={onHide}>
        <Panel>
          <div className="relative p-2 w-full max-w-[350px]">
            <img
              src={SUNNYSIDE.icons.close}
              className="absolute cursor-pointer z-10"
              style={{
                top: `${PIXEL_SCALE * 2}px`,
                right: `${PIXEL_SCALE * 2}px`,
                width: `${PIXEL_SCALE * 8}px`,
              }}
              onClick={onHide}
            />

            <div className="flex items-center space-x-1 mb-1">
              <Label type="default">{t("farmTasks.title")}</Label>
              <div className="flex items-center space-x-1 ml-1">
                <img src={trophyIcon} className="w-4" />
                <span className="text-xs">{taskState.stars}</span>
              </div>
            </div>

            <p className="text-xxs mb-2">{t("farmTasks.subtitle")}</p>

            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center space-x-1 min-w-0">
                <img src={metamaskIcon} className="w-4" />
                {walletAddress ? (
                  <span className="text-xxs truncate">
                    {t("farmTasks.wallet.connected", {
                      address: shortenAddress(walletAddress),
                    })}
                  </span>
                ) : (
                  <span className="text-xxs opacity-70">
                    {t("farmTasks.wallet.connectHint")}
                  </span>
                )}
              </div>

              {walletAddress ? (
                <div className="flex items-center space-x-1">
                  <img src={SUNNYSIDE.ui.coins} className="w-4" />
                  <span className="text-xs">
                    {rewards[walletAddress]?.coins ?? 0}
                  </span>
                  <img src={trophyIcon} className="w-4" />
                  <span className="text-xs">
                    {rewards[walletAddress]?.stars ?? 0}
                  </span>
                  <span
                    className="text-xxs underline cursor-pointer"
                    onClick={handleDisconnect}
                  >
                    {t("farmTasks.wallet.disconnect")}
                  </span>
                </div>
              ) : (
                <span
                  className="text-xxs underline cursor-pointer"
                  onClick={handleConnect}
                >
                  {t("farmTasks.wallet.connect")}
                </span>
              )}
            </div>
            {walletError && (
              <p className="text-xxs text-red-500 mb-1">{walletError}</p>
            )}

            {walletAddress && REWARDS_ADDRESS && (
              <div className="mb-1">
                <div className="flex items-center justify-between">
                  <span className="text-xxs">
                    {t("farmTasks.onchain.balance", {
                      amount: onchain?.balance ?? "…",
                    })}
                  </span>
                  <a
                    className="text-xxs underline"
                    href={`${REWARDS_EXPLORER}/address/${walletAddress}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t("farmTasks.onchain.view")}
                  </a>
                </div>
                {payoutMask > 0 && (
                  <Button
                    className="w-full mt-1"
                    onClick={handlePayOnchain}
                    disabled={onchainBusy}
                  >
                    {onchainBusy
                      ? t("farmTasks.onchain.claiming")
                      : t("farmTasks.onchain.claim", { amount: payoutCoins })}
                  </Button>
                )}
                {onchainError && (
                  <p className="text-xxs text-red-500 mt-1">{onchainError}</p>
                )}
              </div>
            )}

            <Switch
              checked={taskState.autoPlay}
              onChange={() =>
                update(setAutoPlay(taskState, !taskState.autoPlay))
              }
              label={t("farmTasks.autoPlay")}
            />
            <p className="text-xxs opacity-70 mb-2">
              {t("farmTasks.autoPlayHint")}
            </p>

            {allDone ? (
              <div className="flex flex-col items-center py-3">
                <p className="text-xs text-center mb-2">
                  {t("farmTasks.allDone")}
                </p>
                <Button
                  onClick={() => {
                    // Start the next presentation from day one: drop every
                    // Farm Tasks key (progress, claims, wallet ledger, name).
                    Object.keys(localStorage)
                      .filter((key) => key.startsWith("farmTasks:"))
                      .forEach((key) => localStorage.removeItem(key));
                    window.location.reload();
                  }}
                >
                  {t("farmTasks.restart")}
                </Button>
              </div>
            ) : (
              <>
                <div className="flex flex-col space-y-0.5 mb-2">
                  {FARM_TASK_STAGES.map((entry) => {
                    const claimed = taskState.claimed.includes(entry.stage);
                    const isCurrent = entry.stage === taskState.stage;

                    return (
                      <div
                        key={entry.stage}
                        className="flex items-center justify-between text-xs"
                      >
                        <span>{`${entry.stage}. ${t(entry.nameKey)}`}</span>
                        {claimed ? (
                          <Label type="success">{t("farmTasks.claimed")}</Label>
                        ) : isCurrent ? (
                          <Label type="warning">{t("farmTasks.current")}</Label>
                        ) : (
                          <Label type="default">{t("farmTasks.locked")}</Label>
                        )}
                      </div>
                    );
                  })}
                </div>

                {stage && (
                  <div className="mb-2">
                    {(attempt
                      ? goals
                      : stage.goals.map((goal) => ({ ...goal, current: 0 }))
                    ).map((goal) => (
                      <div key={goal.kind + goal.target} className="mb-1">
                        <div className="flex justify-between items-center text-xs mb-0.5">
                          <span>
                            {t(GOAL_KEYS[goal.kind], { amount: goal.target })}
                          </span>
                          <span>{`${goal.current}/${goal.target}`}</span>
                        </div>
                        <ResizableBar
                          percentage={(goal.current / goal.target) * 100}
                          type="progress"
                          outerDimensions={{ width: 60, height: 7 }}
                        />
                      </div>
                    ))}

                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center space-x-1">
                        <img src={trophyIcon} className="w-4" />
                        <span className="text-xs">{stage.reward}</span>
                      </div>

                      {attempt && !expired && !complete && (
                        <Label type="info">
                          {formatCountdown(attempt.endsAt - now)}
                        </Label>
                      )}
                      {attempt && expired && (
                        <Label type="danger">{t("farmTasks.expired")}</Label>
                      )}
                      {attempt && complete && (
                        <Label type="success">{t("farmTasks.completed")}</Label>
                      )}
                    </div>

                    {(!attempt || expired) && (
                      <Button className="mt-2" onClick={handleStart}>
                        {attempt ? t("farmTasks.retry") : t("farmTasks.start")}
                      </Button>
                    )}

                    {attempt && complete && (
                      <Button className="mt-2" onClick={handleClaim}>
                        {t("farmTasks.claim")}
                      </Button>
                    )}
                  </div>
                )}
              </>
            )}

            <p className="text-xxs opacity-70">{t("farmTasks.localNote")}</p>
          </div>
        </Panel>
      </Modal>
    </>
  );
};
