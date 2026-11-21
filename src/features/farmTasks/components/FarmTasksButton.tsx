import React, { useState } from "react";
import { PIXEL_SCALE } from "features/game/lib/constants";
import trophyIcon from "assets/icons/trophy.png";
import { RoundButton } from "components/ui/RoundButton";
import { FarmTasksPanel } from "./FarmTasksPanel";

export const FarmTasksButton: React.FC = () => {
  const [showTasks, setShowTasks] = useState(false);

  return (
    <>
      <RoundButton onClick={() => setShowTasks(true)}>
        <img
          src={trophyIcon}
          className="absolute group-active:translate-y-[2px]"
          style={{
            top: `${PIXEL_SCALE * 2.6}px`,
            left: `${PIXEL_SCALE * 3.4}px`,
            width: `${PIXEL_SCALE * 15.5}px`,
          }}
        />
      </RoundButton>
      <FarmTasksPanel
        show={showTasks}
        onHide={() => setShowTasks(false)}
        onOpen={() => setShowTasks(true)}
      />
    </>
  );
};
