import { GRID_COLS, GRID_ROWS, type GridBox, type Tile } from '@dashboard/shared';
import type { ComponentChildren } from 'preact';
import { useRef, useState } from 'preact/hooks';
import { useI18n } from '../i18n';
import { place, snapToCells, type DragMode, type Placement } from './geometry';

interface Gesture {
  tile: Tile;
  mode: DragMode;
  pointerId: number;
  startX: number;
  startY: number;
  cellWidth: number;
  cellHeight: number;
}

interface Drag {
  id: string;
  placement: Placement;
}

function percentBox(box: GridBox) {
  return {
    left: `${(box.x / GRID_COLS) * 100}%`,
    top: `${(box.y / GRID_ROWS) * 100}%`,
    width: `${(box.w / GRID_COLS) * 100}%`,
    height: `${(box.h / GRID_ROWS) * 100}%`,
  };
}

/**
 * The 12×8 stage of the layout with its tiles. A tile is moved by dragging it and resized by dragging its
 * corner; both snap to whole cells. A drop on another tile is refused: the ghost turns red and the tile
 * stays. On a touch screen the first tap only selects, so scrolling the page is not blocked by the tiles.
 */
export function Canvas({
  tiles,
  selectedId,
  problems,
  underlay,
  onSelect,
  onChange,
}: {
  tiles: readonly Tile[];
  selectedId: string | null;
  /** Ids of the tiles whose settings the server would refuse. */
  problems: ReadonlySet<string>;
  /** Drawn under the tile frames: the live preview. */
  underlay?: ComponentChildren;
  onSelect(id: string | null): void;
  onChange(id: string, box: GridBox): void;
}) {
  const { t } = useI18n();
  const stage = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);

  function begin(event: PointerEvent, tile: Tile, mode: DragMode): void {
    event.stopPropagation();
    const wasSelected = tile.id === selectedId;
    onSelect(tile.id);
    const rect = stage.current?.getBoundingClientRect();
    if (!rect || (event.pointerType === 'touch' && !wasSelected)) return;
    gesture.current = {
      tile,
      mode,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      cellWidth: rect.width / GRID_COLS,
      cellHeight: rect.height / GRID_ROWS,
    };
    try {
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    } catch {
      // The pointer is gone already (a synthetic event); the drag simply does not start.
      gesture.current = null;
      return;
    }
    event.preventDefault();
  }

  function placementOf(event: PointerEvent, g: Gesture): Placement {
    const dx = snapToCells(event.clientX - g.startX, g.cellWidth);
    const dy = snapToCells(event.clientY - g.startY, g.cellHeight);
    return place(tiles, g.tile, g.mode, dx, dy);
  }

  function move(event: PointerEvent): void {
    const g = gesture.current;
    if (g && event.pointerId === g.pointerId) setDrag({ id: g.tile.id, placement: placementOf(event, g) });
  }

  function finish(event: PointerEvent, commit: boolean): void {
    const g = gesture.current;
    if (!g || event.pointerId !== g.pointerId) return;
    gesture.current = null;
    setDrag(null);
    if (!commit) return;
    const { box, valid } = placementOf(event, g);
    const changed = box.x !== g.tile.x || box.y !== g.tile.y || box.w !== g.tile.w || box.h !== g.tile.h;
    if (valid && changed) onChange(g.tile.id, box);
  }

  return (
    <div
      ref={stage}
      class="stage"
      onPointerDown={() => onSelect(null)}
      onPointerMove={move}
      onPointerUp={(event) => finish(event, true)}
      onPointerCancel={(event) => finish(event, false)}
    >
      {underlay}
      {tiles.map((tile) => {
        const selected = tile.id === selectedId;
        const dragging = drag?.id === tile.id;
        return (
          <div
            key={tile.id}
            class={`etile${selected ? ' selected' : ''}${dragging ? ' dragging' : ''}${problems.has(tile.id) ? ' warn' : ''}`}
            style={percentBox(tile)}
            role="button"
            tabIndex={0}
            aria-pressed={selected}
            onPointerDown={(event) => begin(event, tile, 'move')}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onSelect(tile.id);
              }
            }}
          >
            <div class="etile-body">
              <span class="etile-chip">
                {t(`tile.${tile.type}`)} · {tile.w}×{tile.h}
              </span>
            </div>
            {selected && <div class="handle" onPointerDown={(event) => begin(event, tile, 'resize')} />}
          </div>
        );
      })}
      {drag && (
        <div
          class={`ghost${drag.placement.valid ? '' : ' invalid'}`}
          style={percentBox(drag.placement.box)}
        />
      )}
    </div>
  );
}
