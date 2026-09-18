import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import "./fonts";
import { SCENES, scene } from "./script";
import { c } from "./theme";
import { Subtitles } from "./components/Subtitles";
import { ActionCaption } from "./components/ActionCaption";
import { Hook, Stakes, Why, Gap, Problem, Demo1, Demo2, Demo3, Design, Measure, Honest, Verify, Close } from "./scenes/all";

const BY_ID: Record<string, React.FC<{ durationInFrames: number }>> = {
  hook: Hook, stakes: Stakes, gap: Gap, problem: Problem, demo1: Demo1, demo2: Demo2, demo3: Demo3,
  design: Design, measure: Measure, why: Why, honest: Honest, verify: Verify, close: Close,
};

export const Demo: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: c.bg }}>
    {SCENES.map((s) => {
      const Scene = BY_ID[s.id];
      return (
        <Sequence key={s.id} from={s.from} durationInFrames={s.durationInFrames} premountFor={30} name={`${s.id} · ${s.title}`}>
          <Scene durationInFrames={s.durationInFrames} />
        </Sequence>
      );
    })}
    <ActionCaption />
    <Subtitles />
  </AbsoluteFill>
);
