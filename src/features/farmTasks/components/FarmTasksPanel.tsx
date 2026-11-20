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
  getTaskStorageKey,
  loadTaskState,
  saveTaskState,
} from "../lib/storage";
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
}

export const FarmTasksPanel: React.FC<Props> = ({ show, onHide }) => {
  const { gameService } = useContext(Context);
  const { t } = useAppTranslation();

  const farmActivity = useSelector(gameService, _farmActivity);
  const username = useSelector(gameService, _username);

  const storageKey = getTaskStorageKey(username);
  const [taskState, setTaskState] = useState<FarmTaskState>(
    () => loadTaskState(storageKey, Date.now()) ?? createTaskState(Date.now()),
  );

  const [walletAddress, setWalletAddress] = useState<string | undefined>(
    loadWalletAddress,
  );
  const [rewards, setRewards] = useState<WalletRewards>(loadWalletRewards);
  const [walletError, setWalletError] = useState<string>();
  // Stars already paid to the connected wallet, so only new claims are credited.
  const creditedStars = useRef(taskState.stars);

  const now = useNow({
    live: show || taskState.autoPlay,
    intervalMs: 1000,
    autoEndAt: taskState.attempt?.endsAt,
  });

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

  // The HUD button can also connect/disconnect the wallet.
  useEffect(() => {
    const sync = () => {
      setWalletAddress(loadWalletAddress());
      setRewards(loadWalletRewards());
    };
    window.addEventListener(WALLET_CHANGE_EVENT, sync);
    return () => window.removeEventListener(WALLET_CHANGE_EVENT, sync);
  }, []);

  // Pay stars earned since the last claim into the connected wallet.
  useEffect(() => {
    const delta = taskState.stars - creditedStars.current;
    creditedStars.current = taskState.stars;
    if (delta <= 0 || !walletAddress) return;

    setRewards(creditWalletReward(walletAddress, delta));
  }, [taskState.stars, walletAddress]);

  const stage = FARM_TASK_STAGES[taskState.stage - 1];
  const attempt = taskState.attempt;
  const goals = getGoalProgress(taskState, farmActivity);
  const complete = isAttemptComplete(taskState, farmActivity, now);
  const expired = isAttemptExpired(taskState, now);
  const allDone = isAllStagesClaimed(taskState);

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

  return (
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
                <img src={trophyIcon} className="w-4" />
                <span className="text-xs">{rewards[walletAddress] ?? 0}</span>
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

          <Switch
            checked={taskState.autoPlay}
            onChange={() => update(setAutoPlay(taskState, !taskState.autoPlay))}
            label={t("farmTasks.autoPlay")}
          />
          <p className="text-xxs opacity-70 mb-2">
            {t("farmTasks.autoPlayHint")}
          </p>

          {allDone ? (
            <p className="text-xs text-center py-3">{t("farmTasks.allDone")}</p>
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
  );
};
