import React, { useState } from "react";

import { Modal } from "components/ui/Modal";
import { Panel } from "components/ui/Panel";
import { Button } from "components/ui/Button";
import { TextInput } from "components/ui/TextInput";
import { useAppTranslation } from "lib/i18n/useAppTranslations";

const NAME_KEY = "farmTasks:playerName:v1";

export const getPlayerName = (): string | undefined => {
  try {
    const raw = localStorage.getItem(NAME_KEY);
    if (!raw) return undefined;

    const name: unknown = JSON.parse(raw);
    return typeof name === "string" && name.trim() ? name : undefined;
  } catch {
    return undefined;
  }
};

/**
 * First-load name prompt for the class demo. Nothing else asks for a farmer
 * name in offline mode, so the player introduces themselves here and the name
 * is kept locally (cleared by the final-stage restart).
 */
export const PlayerNameGate: React.FC = () => {
  const { t } = useAppTranslation();
  const [name, setName] = useState("");
  const [finished, setFinished] = useState(() => !!getPlayerName());

  if (finished) return null;

  const submit = () => {
    const clean = name.trim().slice(0, 20);
    if (!clean) return;

    try {
      localStorage.setItem(NAME_KEY, JSON.stringify(clean));
    } catch {
      // If storage is unavailable the gate just closes for this session.
    }

    setFinished(true);
  };

  return (
    <Modal show onHide={() => undefined}>
      <Panel>
        <div className="p-3">
          <p className="text-sm mb-2">{t("farmTasks.name.title")}</p>
          <TextInput
            value={name}
            onValueChange={setName}
            onEnter={submit}
            placeholder={t("farmTasks.name.placeholder")}
            maxLength={20}
            autoFocus
          />
          <Button className="mt-2" disabled={!name.trim()} onClick={submit}>
            {t("farmTasks.name.start")}
          </Button>
        </div>
      </Panel>
    </Modal>
  );
};
