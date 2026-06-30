import React from 'react';
import { Composition } from 'remotion';
import { FaqYoungV2 } from './scenes/FaqYoungV2';
import { FaqOlder } from './scenes/FaqOlder';
import { FaqWork } from './scenes/FaqWork';

// The three lead-home default FAQ videos. 9:16 for the mobile lead-home.
// durationInFrames matches each clip's beats as synced to the current
// voiceover takes — edit a scene's `B` (beat) map to retime, then re-render.
export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="FaqYoungV2" component={FaqYoungV2} durationInFrames={1710} fps={30} width={1080} height={1920} />
    <Composition id="FaqOlder" component={FaqOlder} durationInFrames={1580} fps={30} width={1080} height={1920} />
    <Composition id="FaqWork" component={FaqWork} durationInFrames={1637} fps={30} width={1080} height={1920} />
  </>
);
