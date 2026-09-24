import { STAGE_HEIGHT, STAGE_WIDTH } from '@dashboard/shared';

export interface StageBox {
  left: number;
  top: number;
  width: number;
  height: number;
  /** Root font size: 1rem = stage width / 80 (16 px at 1280). */
  rootFontPx: number;
}

/** Largest 16:10 box that fits the viewport, centred (letterboxed, never stretched). */
export function fitStage(viewportWidth: number, viewportHeight: number): StageBox {
  const scale = Math.min(viewportWidth / STAGE_WIDTH, viewportHeight / STAGE_HEIGHT);
  const width = Math.round(STAGE_WIDTH * scale);
  const height = Math.round(STAGE_HEIGHT * scale);
  return {
    left: Math.floor((viewportWidth - width) / 2),
    top: Math.floor((viewportHeight - height) / 2),
    width,
    height,
    rootFontPx: width / 80,
  };
}

export function applyStage(stage: HTMLElement, root: HTMLElement, box: StageBox): void {
  stage.style.left = `${box.left}px`;
  stage.style.top = `${box.top}px`;
  stage.style.width = `${box.width}px`;
  stage.style.height = `${box.height}px`;
  root.style.fontSize = `${box.rootFontPx}px`;
}
