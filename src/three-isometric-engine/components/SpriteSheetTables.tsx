//NOTE(jimmylee)
//Reference tables bridging documentation pipeline to engine constants.
//Each table traces: Engine Step → Pattern → SEQ → SHP → Tile IDs → Reversed → Loop, plus the SEQ
//unit motion (move opcodes) for sequences that move the unit.

import styles from './SpriteSheetTables.module.css';

import {
  IDLE_ASSEMBLY,
  FLOAT_ASSEMBLY,
  GUARD_ASSEMBLY,
  WALK_ASSEMBLY,
  QUICK_THROW_ASSEMBLY,
  THROW_STONE_ASSEMBLY,
  PUNCH_ASSEMBLY,
  PUNCH_LV2_ASSEMBLY,
  PUNCH_LV3_ASSEMBLY,
  STAB_ASSEMBLY,
  STAB_LV2_ASSEMBLY,
  STAB_LV3_ASSEMBLY,
  FATAL_ITEM_IMPACT_ASSEMBLY,
  ITEM_DROP_ASSEMBLY,
  KNEEL_ASSEMBLY,
  HURT_ASSEMBLY,
  DEATH_ASSEMBLY,
  CAST_ASSEMBLY,
  JUMP_ASSEMBLY,
  FLOAT_MOVES,
  HURT_SHIVER_MOVES,
  FATAL_ITEM_IMPACT_TIMELINE,
} from '@engine/constants/sprites/assembly';
import { SHP_FRAMES, SHP_WATER_OFFSET } from '@engine/constants/sprites/seq-library';

//NOTE(jimmylee)
//SEQ unit motion per displayed frame: forward/back (fb) or down/up (du) pixels.
const formatFb = (moves) => moves.map((m) => m.fb).join(' ');
const formatDu = (moves) => moves.map((m) => m.du).join(' ');

const STEP_MAP = [
  { direction: 'South', pattern: 'A', placement: '', idx: 0 },
  { direction: 'SE', pattern: 'B', placement: '↓', idx: 1 },
  { direction: 'East', pattern: 'B', placement: '', idx: 1 },
  { direction: 'SW', pattern: 'C', placement: '→', idx: 2 },
  { direction: 'North', pattern: 'C', placement: '', idx: 2 },
  { direction: 'NW', pattern: 'D', placement: '↑', idx: 3 },
  { direction: 'West', pattern: 'D', placement: '', idx: 3 },
  { direction: 'NE', pattern: 'A', placement: '←', idx: 0 },
];

export function SpriteSheetTableThrowStone() {
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th>Engine Step</th>
          <th>Direction</th>
          <th>Pattern</th>
          <th>Placement</th>
          <th>SHP Frames</th>
          <th>SEQ</th>
          <th>Frames (farBehind / behind / body / head / over / front)</th>
          <th>Reversed</th>
          <th>Loop</th>
        </tr>
      </thead>
      <tbody>
        {STEP_MAP.map((step, i) => {
          const entry = THROW_STONE_ASSEMBLY[step.idx];
          const frameSummary = entry.frames.map((f) => {
            const fb = f.farBehind ? f.farBehind.id : '-';
            const behind = f.behind ? f.behind.id : '-';
            const head = f.head ? f.head.id : '-';
            const over = f.over ? f.over.id : '-';
            const front = f.front ? f.front.id : '-';
            return `${fb}/${behind}/${f.body}/${head}/${over}/${front}`;
          }).join(', ');
          return (
            <tr key={i}>
              <td>{i}</td>
              <td>{step.direction}</td>
              <td>{step.pattern}</td>
              <td>{step.placement}</td>
              <td>{entry.shp}</td>
              <td>{entry.seq}</td>
              <td>{frameSummary}</td>
              <td>{entry.reversed ? 'yes' : 'no'}</td>
              <td>no</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function SpriteSheetTablePunch() {
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th>Engine Step</th>
          <th>Direction</th>
          <th>Pattern</th>
          <th>Placement</th>
          <th>SHP Frames</th>
          <th>SEQ</th>
          <th>Frames (farBehind / body / head / front)</th>
          <th>Reversed</th>
          <th>Loop</th>
          <th>Move fb (px)</th>
        </tr>
      </thead>
      <tbody>
        {STEP_MAP.map((step, i) => {
          const entry = PUNCH_ASSEMBLY[step.idx];
          const frameSummary = entry.frames.map((f) => {
            const fb = f.farBehind ? f.farBehind.id : '-';
            const head = f.head ? f.head.id : '-';
            const front = f.front ? f.front.id : '-';
            return `${fb}/${f.body}/${head}/${front}`;
          }).join(', ');
          return (
            <tr key={i}>
              <td>{i}</td>
              <td>{step.direction}</td>
              <td>{step.pattern}</td>
              <td>{step.placement}</td>
              <td>{entry.shp}</td>
              <td>{entry.seq}</td>
              <td>{frameSummary}</td>
              <td>{entry.reversed ? 'yes' : 'no'}</td>
              <td>yes</td>
              <td>{formatFb(entry.frames.map((f) => f.move))}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function SpriteSheetTablePunchLv2() {
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th>Engine Step</th>
          <th>Direction</th>
          <th>Pattern</th>
          <th>Placement</th>
          <th>SHP Frames</th>
          <th>SEQ</th>
          <th>Frames (farBehind / body / head / front)</th>
          <th>Reversed</th>
          <th>Loop</th>
          <th>Move fb (px)</th>
        </tr>
      </thead>
      <tbody>
        {STEP_MAP.map((step, i) => {
          const entry = PUNCH_LV2_ASSEMBLY[step.idx];
          const frameSummary = entry.frames.map((f) => {
            const fb = f.farBehind ? f.farBehind.id : '-';
            const head = f.head ? f.head.id : '-';
            const front = f.front ? f.front.id : '-';
            return `${fb}/${f.body}/${head}/${front}`;
          }).join(', ');
          return (
            <tr key={i}>
              <td>{i}</td>
              <td>{step.direction}</td>
              <td>{step.pattern}</td>
              <td>{step.placement}</td>
              <td>{entry.shp}</td>
              <td>{entry.seq}</td>
              <td>{frameSummary}</td>
              <td>{entry.reversed ? 'yes' : 'no'}</td>
              <td>yes</td>
              <td>{formatFb(entry.frames.map((f) => f.move))}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function SpriteSheetTablePunchLv3() {
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th>Engine Step</th>
          <th>Direction</th>
          <th>Pattern</th>
          <th>Placement</th>
          <th>SHP Frames</th>
          <th>SEQ</th>
          <th>Frames (farBehind / body / head / front)</th>
          <th>Reversed</th>
          <th>Loop</th>
          <th>Move fb (px)</th>
        </tr>
      </thead>
      <tbody>
        {STEP_MAP.map((step, i) => {
          const entry = PUNCH_LV3_ASSEMBLY[step.idx];
          const frameSummary = entry.frames.map((f) => {
            const fb = f.farBehind ? f.farBehind.id : '-';
            const head = f.head ? f.head.id : '-';
            const front = f.front ? f.front.id : '-';
            return `${fb}/${f.body}/${head}/${front}`;
          }).join(', ');
          return (
            <tr key={i}>
              <td>{i}</td>
              <td>{step.direction}</td>
              <td>{step.pattern}</td>
              <td>{step.placement}</td>
              <td>{entry.shp}</td>
              <td>{entry.seq}</td>
              <td>{frameSummary}</td>
              <td>{entry.reversed ? 'yes' : 'no'}</td>
              <td>yes</td>
              <td>{formatFb(entry.frames.map((f) => f.move))}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function SpriteSheetTableStab() {
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th>Engine Step</th>
          <th>Direction</th>
          <th>Pattern</th>
          <th>Placement</th>
          <th>SHP Frames</th>
          <th>SEQ</th>
          <th>Frames (farBehind / body / head / front)</th>
          <th>Reversed</th>
          <th>Loop</th>
          <th>Move fb (px)</th>
        </tr>
      </thead>
      <tbody>
        {STEP_MAP.map((step, i) => {
          const entry = STAB_ASSEMBLY[step.idx];
          const frameSummary = entry.frames.map((f) => {
            const fb = f.farBehind ? f.farBehind.id : '-';
            const head = f.head ? f.head.id : '-';
            const front = f.front ? f.front.id : '-';
            return `${fb}/${f.body}/${head}/${front}`;
          }).join(', ');
          return (
            <tr key={i}>
              <td>{i}</td>
              <td>{step.direction}</td>
              <td>{step.pattern}</td>
              <td>{step.placement}</td>
              <td>{entry.shp}</td>
              <td>{entry.seq}</td>
              <td>{frameSummary}</td>
              <td>{entry.reversed ? 'yes' : 'no'}</td>
              <td>yes</td>
              <td>{formatFb(entry.frames.map((f) => f.move))}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function SpriteSheetTableStabLv2() {
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th>Engine Step</th>
          <th>Direction</th>
          <th>Pattern</th>
          <th>Placement</th>
          <th>SHP Frames</th>
          <th>SEQ</th>
          <th>Frames (farBehind / body / head / front)</th>
          <th>Reversed</th>
          <th>Loop</th>
          <th>Move fb (px)</th>
        </tr>
      </thead>
      <tbody>
        {STEP_MAP.map((step, i) => {
          const entry = STAB_LV2_ASSEMBLY[step.idx];
          const frameSummary = entry.frames.map((f) => {
            const fb = f.farBehind ? f.farBehind.id : '-';
            const head = f.head ? f.head.id : '-';
            const front = f.front ? f.front.id : '-';
            return `${fb}/${f.body}/${head}/${front}`;
          }).join(', ');
          return (
            <tr key={i}>
              <td>{i}</td>
              <td>{step.direction}</td>
              <td>{step.pattern}</td>
              <td>{step.placement}</td>
              <td>{entry.shp}</td>
              <td>{entry.seq}</td>
              <td>{frameSummary}</td>
              <td>{entry.reversed ? 'yes' : 'no'}</td>
              <td>yes</td>
              <td>{formatFb(entry.frames.map((f) => f.move))}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function SpriteSheetTableStabLv3() {
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th>Engine Step</th>
          <th>Direction</th>
          <th>Pattern</th>
          <th>Placement</th>
          <th>SHP Frames</th>
          <th>SEQ</th>
          <th>Frames (farBehind / body / head / front)</th>
          <th>Reversed</th>
          <th>Loop</th>
          <th>Move fb (px)</th>
        </tr>
      </thead>
      <tbody>
        {STEP_MAP.map((step, i) => {
          const entry = STAB_LV3_ASSEMBLY[step.idx];
          const frameSummary = entry.frames.map((f) => {
            const fb = f.farBehind ? f.farBehind.id : '-';
            const head = f.head ? f.head.id : '-';
            const front = f.front ? f.front.id : '-';
            return `${fb}/${f.body}/${head}/${front}`;
          }).join(', ');
          return (
            <tr key={i}>
              <td>{i}</td>
              <td>{step.direction}</td>
              <td>{step.pattern}</td>
              <td>{step.placement}</td>
              <td>{entry.shp}</td>
              <td>{entry.seq}</td>
              <td>{frameSummary}</td>
              <td>{entry.reversed ? 'yes' : 'no'}</td>
              <td>yes</td>
              <td>{formatFb(entry.frames.map((f) => f.move))}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function SpriteSheetTableQuickThrow() {
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th>Engine Step</th>
          <th>Direction</th>
          <th>Pattern</th>
          <th>Placement</th>
          <th>SHP Frames</th>
          <th>SEQ</th>
          <th>Frames (body / behind / head / over / front)</th>
          <th>Reversed</th>
          <th>Loop</th>
        </tr>
      </thead>
      <tbody>
        {STEP_MAP.map((step, i) => {
          const entry = QUICK_THROW_ASSEMBLY[step.idx];
          const frameSummary = entry.frames.map((f) => {
            const behind = f.behind ? f.behind.id : '-';
            const head = f.head ? f.head.id : '-';
            const over = f.over ? f.over.id : '-';
            const front = f.front ? f.front.id : '-';
            return `${f.body}/${behind}/${head}/${over}/${front}`;
          }).join(', ');
          return (
            <tr key={i}>
              <td>{i}</td>
              <td>{step.direction}</td>
              <td>{step.pattern}</td>
              <td>{step.placement}</td>
              <td>{entry.shp}</td>
              <td>{entry.seq}</td>
              <td>{frameSummary}</td>
              <td>{entry.reversed ? 'yes' : 'no'}</td>
              <td>no</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function SpriteSheetTableMagicCharge() {
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th>Engine Step</th>
          <th>Direction</th>
          <th>Pattern</th>
          <th>Placement</th>
          <th>SHP Frames</th>
          <th>SEQ</th>
          <th>Frame 1</th>
          <th>Frame 2</th>
          <th>Reversed</th>
          <th>Loop</th>
        </tr>
      </thead>
      <tbody>
        {STEP_MAP.map((step, i) => {
          const entry = CAST_ASSEMBLY[step.idx];
          const f = entry.frames;
          return (
            <tr key={i}>
              <td>{i}</td>
              <td>{step.direction}</td>
              <td>{step.pattern}</td>
              <td>{step.placement}</td>
              <td>{entry.shp}</td>
              <td>{entry.seq}</td>
              <td>{f[0].overlay} behind {f[0].body}</td>
              <td>{f[1].overlay} behind {f[1].body}</td>
              <td>{entry.reversed ? 'yes' : 'no'}</td>
              <td>yes</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function SpriteSheetTableJump() {
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th>Engine Step</th>
          <th>Direction</th>
          <th>Pattern</th>
          <th>Placement</th>
          <th>SHP Frames</th>
          <th>SEQ</th>
          <th>Frames (behind / body / front)</th>
          <th>Reversed</th>
          <th>Loop</th>
        </tr>
      </thead>
      <tbody>
        {STEP_MAP.map((step, i) => {
          const entry = JUMP_ASSEMBLY[step.idx];
          const frameSummary = entry.frames.map((f) => {
            const behind = f.behind ? f.behind.id : '-';
            const front = f.front ? f.front.id : '-';
            return `${behind}/${f.body}/${front}`;
          }).join(', ');
          return (
            <tr key={i}>
              <td>{i}</td>
              <td>{step.direction}</td>
              <td>{step.pattern}</td>
              <td>{step.placement}</td>
              <td>{entry.shp}</td>
              <td>{entry.seq}</td>
              <td>{frameSummary}</td>
              <td>{entry.reversed ? 'yes' : 'no'}</td>
              <td>yes</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function SpriteSheetTableKneel() {
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th>Engine Step</th>
          <th>Direction</th>
          <th>Pattern</th>
          <th>Placement</th>
          <th>SHP Frame</th>
          <th>SEQ</th>
          <th>Tile</th>
          <th>Reversed</th>
          <th>Loop</th>
        </tr>
      </thead>
      <tbody>
        {STEP_MAP.map((step, i) => {
          const entry = KNEEL_ASSEMBLY[step.idx];
          return (
            <tr key={i}>
              <td>{i}</td>
              <td>{step.direction}</td>
              <td>{step.pattern}</td>
              <td>{step.placement}</td>
              <td>{entry.shp}</td>
              <td>{entry.seq}</td>
              <td>{entry.id}</td>
              <td>{entry.reversed ? 'yes' : 'no'}</td>
              <td>no</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function SpriteSheetTableDead() {
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th>Engine Step</th>
          <th>Direction</th>
          <th>Pattern</th>
          <th>Placement</th>
          <th>SHP Frame</th>
          <th>SEQ</th>
          <th>Tile</th>
          <th>Reversed</th>
          <th>Loop</th>
        </tr>
      </thead>
      <tbody>
        {STEP_MAP.map((step, i) => {
          const entry = DEATH_ASSEMBLY[step.idx];
          return (
            <tr key={i}>
              <td>{i}</td>
              <td>{step.direction}</td>
              <td>{step.pattern}</td>
              <td>{step.placement}</td>
              <td>{entry.shp}</td>
              <td>{entry.seq}</td>
              <td>{entry.id}</td>
              <td>{entry.reversed ? 'yes' : 'no'}</td>
              <td>no</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function SpriteSheetTableFlinch() {
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th>Engine Step</th>
          <th>Direction</th>
          <th>Pattern</th>
          <th>Placement</th>
          <th>SHP Frame</th>
          <th>SEQ</th>
          <th>Top</th>
          <th>Bottom</th>
          <th>Reversed</th>
          <th>Loop</th>
          <th>Move du (px)</th>
        </tr>
      </thead>
      <tbody>
        {STEP_MAP.map((step, i) => {
          const entry = HURT_ASSEMBLY[step.idx];
          return (
            <tr key={i}>
              <td>{i}</td>
              <td>{step.direction}</td>
              <td>{step.pattern}</td>
              <td>{step.placement}</td>
              <td>{entry.shp}</td>
              <td>{entry.seq}</td>
              <td>{entry.top}</td>
              <td>{entry.bottom}</td>
              <td>{entry.reversed ? 'yes' : 'no'}</td>
              <td>yes</td>
              <td>{formatDu(HURT_SHIVER_MOVES)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function SpriteSheetTableWalk() {
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th>Engine Step</th>
          <th>Direction</th>
          <th>Pattern</th>
          <th>Placement</th>
          <th>SHP Frames</th>
          <th>SEQ</th>
          <th>Body</th>
          <th>Left Hand</th>
          <th>Right Hand</th>
          <th>Reversed</th>
          <th>Loop</th>
        </tr>
      </thead>
      <tbody>
        {STEP_MAP.map((step, i) => {
          const entry = WALK_ASSEMBLY[step.idx];
          const body = entry.body;
          const firstPair = entry.hands[0];
          const lastPair = entry.hands[entry.hands.length - 1];
          const lFirst = firstPair.find((h) => h.id.startsWith('L'))!;
          const rFirst = firstPair.find((h) => h.id.startsWith('R'))!;
          const lLast = lastPair.find((h) => h.id.startsWith('L'))!;
          const rLast = lastPair.find((h) => h.id.startsWith('R'))!;
          return (
            <tr key={i}>
              <td>{i}</td>
              <td>{step.direction}</td>
              <td>{step.pattern}</td>
              <td>{step.placement}</td>
              <td>{entry.shp}</td>
              <td>{entry.seq}</td>
              <td>{body[0].id}-{body[body.length - 1].id}</td>
              <td>{lFirst.id}-{lLast.id}</td>
              <td>{rFirst.id}-{rLast.id}</td>
              <td>{entry.reversed ? 'yes' : 'no'}</td>
              <td>yes</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function SpriteSheetTableIdle() {
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th>Engine Step</th>
          <th>Direction</th>
          <th>Pattern</th>
          <th>Placement</th>
          <th>SHP Frame</th>
          <th>SEQ</th>
          <th>Tile</th>
          <th>Loop</th>
        </tr>
      </thead>
      <tbody>
        {STEP_MAP.map((step, i) => {
          const entry = IDLE_ASSEMBLY[i];
          return (
            <tr key={i}>
              <td>{i}</td>
              <td>{step.direction}</td>
              <td>{step.pattern}</td>
              <td>{step.placement}</td>
              <td>{entry.shp}</td>
              <td>{entry.seq}</td>
              <td>{entry.id}{entry.reversed ? ' reversed' : ''}</td>
              <td>no</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function SpriteSheetTableGuard() {
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th>Engine Step</th>
          <th>Direction</th>
          <th>Pattern</th>
          <th>Placement</th>
          <th>SHP Frame</th>
          <th>SEQ</th>
          <th>Tiles (behind / body / front)</th>
          <th>Reversed</th>
          <th>Loop</th>
        </tr>
      </thead>
      <tbody>
        {STEP_MAP.map((step, i) => {
          const entry = GUARD_ASSEMBLY[step.idx];
          return (
            <tr key={i}>
              <td>{i}</td>
              <td>{step.direction}</td>
              <td>{step.pattern}</td>
              <td>{step.placement}</td>
              <td>{entry.shp}</td>
              <td>{entry.seq}</td>
              <td>{entry.behind.id}/{entry.body}/{entry.front.id}</td>
              <td>{entry.reversed ? 'yes' : 'no'}</td>
              <td>no</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function SpriteSheetTableFloat() {
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th>Engine Step</th>
          <th>Direction</th>
          <th>Pattern</th>
          <th>Placement</th>
          <th>SHP Frame</th>
          <th>SEQ</th>
          <th>Tiles (behind / body / front)</th>
          <th>Reversed</th>
          <th>Loop</th>
          <th>Move du (px)</th>
        </tr>
      </thead>
      <tbody>
        {STEP_MAP.map((step, i) => {
          const entry = FLOAT_ASSEMBLY[step.idx];
          return (
            <tr key={i}>
              <td>{i}</td>
              <td>{step.direction}</td>
              <td>{step.pattern}</td>
              <td>{step.placement}</td>
              <td>{entry.shp}</td>
              <td>{entry.seq}</td>
              <td>{entry.behind.id}/{entry.body}/{entry.front.id}</td>
              <td>{entry.reversed ? 'yes' : 'no'}</td>
              <td>yes</td>
              <td>{formatDu(FLOAT_MOVES)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function SpriteSheetTableFatalItemImpact() {
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th>Engine Step</th>
          <th>Direction</th>
          <th>Pattern</th>
          <th>Placement</th>
          <th>SHP Frames</th>
          <th>SEQ</th>
          <th>Frames (body / behind / head / front)</th>
          <th>Reversed</th>
          <th>Loop</th>
          <th>Move du (px)</th>
        </tr>
      </thead>
      <tbody>
        {STEP_MAP.map((step, i) => {
          const entry = FATAL_ITEM_IMPACT_ASSEMBLY[step.idx];
          const frameSummary = entry.frames.map((f) => {
            const behind = f.behind ? f.behind.id : '-';
            const head = f.head ? f.head.id : '-';
            const front = f.front ? f.front.id : '-';
            return `${f.body}/${behind}/${head}/${front}`;
          }).join(', ');
          return (
            <tr key={i}>
              <td>{i}</td>
              <td>{step.direction}</td>
              <td>{step.pattern}</td>
              <td>{step.placement}</td>
              <td>{entry.shp}</td>
              <td>{entry.seq}</td>
              <td>{frameSummary}</td>
              <td>{entry.reversed ? 'yes' : 'no'}</td>
              <td>no</td>
              <td>{formatDu(FATAL_ITEM_IMPACT_TIMELINE.map((e) => e.move))}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function SpriteSheetTableItemDrop() {
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th>Engine Step</th>
          <th>Direction</th>
          <th>Pattern</th>
          <th>Placement</th>
          <th>SHP Frames</th>
          <th>SEQ</th>
          <th>Frames (body / behind / head / front)</th>
          <th>Reversed</th>
          <th>Loop</th>
        </tr>
      </thead>
      <tbody>
        {STEP_MAP.map((step, i) => {
          const entry = ITEM_DROP_ASSEMBLY[step.idx];
          const frameSummary = entry.frames.map((f) => {
            const behind = f.behind ? f.behind.id : '-';
            const head = f.head ? f.head.id : '-';
            const front = f.front ? f.front.id : '-';
            return `${f.body}/${behind}/${head}/${front}`;
          }).join(', ');
          return (
            <tr key={i}>
              <td>{i}</td>
              <td>{step.direction}</td>
              <td>{step.pattern}</td>
              <td>{step.placement}</td>
              <td>{entry.shp}</td>
              <td>{entry.seq}</td>
              <td>{frameSummary}</td>
              <td>{entry.reversed ? 'yes' : 'no'}</td>
              <td>no</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

//NOTE(@jimmylee)
//Any front/back SEQ pair, traced from the SEQ and SHP tables: tiles back to front per drawn frame.
export function SpriteSheetTableSequence({ pair, loop, water }) {
  const offset = water ? SHP_WATER_OFFSET : 0;
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th>Engine Step</th>
          <th>Direction</th>
          <th>Pattern</th>
          <th>Placement</th>
          <th>SHP Frames</th>
          <th>SEQ</th>
          <th>Frames (tiles back to front)</th>
          <th>Reversed</th>
          <th>Loop</th>
          <th>Move fb (px)</th>
          <th>Move du (px)</th>
        </tr>
      </thead>
      <tbody>
        {STEP_MAP.map((step, i) => {
          const entry = step.idx <= 1 ? pair.front : pair.back;
          const shpFrames = entry.frames.map((f) => f + offset);
          const frameSummary = shpFrames.map((f) => SHP_FRAMES[f].map((tile) => tile[0]).join('/')).join(', ');
          return (
            <tr key={i}>
              <td>{i}</td>
              <td>{step.direction}</td>
              <td>{step.pattern}</td>
              <td>{step.placement}</td>
              <td>{[...new Set(shpFrames)].map((f) => `F${f}`).join(', ')}</td>
              <td>SEQ {entry.seq}</td>
              <td>{frameSummary}</td>
              <td>{step.idx === 0 || step.idx === 3 ? 'yes' : 'no'}</td>
              <td>{loop ? 'yes' : 'no'}</td>
              <td>{entry.fb ? entry.fb.join(' ') : '-'}</td>
              <td>{entry.du ? entry.du.join(' ') : '-'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
