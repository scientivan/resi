import React from "react";
import { Composition } from "remotion";
import { Demo } from "./Demo";
import { TOTAL_FRAMES, FPS_NOTE } from "./constants";

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="Demo"
      component={Demo}
      durationInFrames={TOTAL_FRAMES}
      fps={30}
      width={1920}
      height={1080}
    />
  </>
);

void FPS_NOTE;
