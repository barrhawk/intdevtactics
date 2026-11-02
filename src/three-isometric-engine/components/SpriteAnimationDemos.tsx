//NOTE(@jimmylee)
//ThreeJS demos section of the main route. The cards render from the three-free catalog; three.js, the
//engine character groups, the textures and the item models load only when the section first scrolls
//into view.
//One canvas and one WebGLRenderer draw every card (scissor viewports); the loop runs only while the
//section is visible, and stops when paused unless the camera is orbiting or a control changed. The
//grid is too tall for one drawing buffer, so the canvas is a window of about two screens that moves
//down the grid and draws the cards inside it.

import styles from './SpriteAnimationDemos.module.css';

import * as React from 'react';

import { BLACK_MARBLE_FILE, SPRITE_SHEET_FILE } from '@engine/constants/sprites';
import { SPRITE_DEMOS, LAYER_TINTS, BODY_TINTS, ELEVATIONS, placeCanvasWindow } from '@engine/debug/sprite-animation-demo-catalog';
import { SET_ITEMS_FILE, readSetItems } from '@engine/weapons/set-items';

type DemoStage = ReturnType<typeof import('@engine/debug/sprite-animation-demos').createSpriteDemoStage>;
type ElevationKey = keyof typeof ELEVATIONS;

const SPRITE_URL = `/static/textures/${SPRITE_SHEET_FILE}`;
const BLACK_MARBLE_URL = `/static/textures/${BLACK_MARBLE_FILE}`;
const SET_ITEMS_URL = `/static/models/${SET_ITEMS_FILE}`;
const STEPS = [0, 1, 2, 3, 4, 5, 6, 7];
const SPEEDS = [1, 0.5, 0.25, 0.1];
const ELEVATION_LABELS: Record<ElevationKey, string> = { low: 'Low', game: 'Game', high: 'High' };
const STATUS_INTERVAL_MS = 100;
const WINDOW_SCREENS = 2;

const eventTitle = (e: { tick: number; label: string; source: string }) => `${e.source === 'seq' ? 'SEQ' : 'Engine'}: ${e.label} at tick ${Math.round(e.tick * 100) / 100}`;

const hex = (color: number) => `#${color.toString(16).padStart(6, '0')}`;

//NOTE(@jimmylee)
//Three decimals: the browser normalizes a long percentage, which would not hydrate against the server's.
const percent = (fraction: number) => `${(fraction * 100).toFixed(3)}%`;

async function loadSetItems() {
  const response = await fetch(SET_ITEMS_URL);
  if (!response.ok) throw new Error(`${SET_ITEMS_URL}: ${response.status}`);
  return readSetItems(await response.arrayBuffer());
}

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export default function SpriteAnimationDemos() {
  const gridRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const stageSlotRefs = React.useRef<(HTMLDivElement | null)[]>([]);
  const statusRefs = React.useRef<(HTMLParagraphElement | null)[]>([]);
  const playheadRefs = React.useRef<(HTMLSpanElement | null)[]>([]);
  const stepRef = React.useRef<HTMLSpanElement | null>(null);
  const stageRef = React.useRef<DemoStage | null>(null);
  const loopRef = React.useRef({ playing: true, orbiting: false, dirty: true });

  const [phase, setPhase] = React.useState<'waiting' | 'loading' | 'ready' | 'error'>('waiting');
  const [error, setError] = React.useState('');
  const [playing, setPlaying] = React.useState(true);
  const [speed, setSpeed] = React.useState(1);
  const [step, setStep] = React.useState<number | null>(0);
  const [elevation, setElevation] = React.useState<ElevationKey>('game');
  const [tint, setTint] = React.useState(false);
  const [water, setWater] = React.useState(false);
  const [physics, setPhysics] = React.useState(false);

  //NOTE(jimmylee)
  //Reduced motion: start on a still frame; the user can press Play.
  React.useEffect(() => {
    if (prefersReducedMotion()) setPlaying(false);
  }, []);

  //NOTE(jimmylee)
  //Lazy init on first visibility, then a requestAnimationFrame loop gated on visibility.
  React.useEffect(() => {
    const grid = gridRef.current;
    const canvas = canvasRef.current;
    if (!grid || !canvas) return;

    let cancelled = false;
    let visible = false;
    let frameHandle = 0;
    let statusHandle: ReturnType<typeof setInterval> | null = null;
    let loaded: { dispose: () => void }[] = [];
    let started = false;
    let rects: { x: number; y: number; w: number; h: number }[] = [];
    let windowTop = 0;
    let windowHeight = 0;

    //NOTE(@jimmylee)
    //The canvas moves in the same frame that redraws it, so the cards never leave their slots.
    const moveWindow = (stage: DemoStage, gridRect: DOMRect) => {
      const top = placeCanvasWindow({ top: windowTop, windowHeight, gridHeight: gridRect.height, gridTop: gridRect.top, viewHeight: window.innerHeight });
      if (top === windowTop) return;
      windowTop = top;
      canvas.style.transform = `translateY(${top}px)`;
      stage.setWindowTop(top);
      loopRef.current.dirty = true;
    };

    const measure = () => {
      const stage = stageRef.current;
      if (!stage) return;
      const gridRect = grid.getBoundingClientRect();
      rects = stageSlotRefs.current.map((slot) => {
        if (!slot) return { x: 0, y: 0, w: 0, h: 0 };
        const r = slot.getBoundingClientRect();
        return { x: r.left - gridRect.left, y: r.top - gridRect.top, w: r.width, h: r.height };
      });
      windowHeight = Math.min(gridRect.height, Math.ceil(window.innerHeight * WINDOW_SCREENS));
      canvas.style.height = `${windowHeight}px`;
      stage.setViewports(rects, gridRect.width, windowHeight);
      moveWindow(stage, gridRect);
      loopRef.current.dirty = true;
    };

    const tick = (wallMs: number) => {
      frameHandle = 0;
      const stage = stageRef.current;
      if (!stage || !visible || cancelled) return;
      moveWindow(stage, grid.getBoundingClientRect());
      const loop = loopRef.current;
      if (loop.playing || loop.orbiting || loop.dirty) {
        stage.frame(wallMs);
        loop.dirty = false;
      }
      frameHandle = requestAnimationFrame(tick);
    };

    const updateStatus = () => {
      const stage = stageRef.current;
      if (!stage) return;
      for (let i = 0; i < SPRITE_DEMOS.length; i++) {
        const rect = rects[i];
        if (!rect || rect.y + rect.h < windowTop || rect.y > windowTop + windowHeight) continue;
        const node = statusRefs.current[i];
        if (node) node.textContent = stage.getStatus(i);
        const head = playheadRefs.current[i];
        if (!head) continue;
        const tick = stage.getPlayhead(i);
        const total = SPRITE_DEMOS[i].timeline.ticks.reduce((a, b) => a + b, 0);
        head.hidden = tick < 0;
        head.style.left = `${(Math.min(tick, total) / total) * 100}%`;
      }
      if (stepRef.current) stepRef.current.textContent = String(stage.getStep());
    };

    const startLoop = () => {
      if (!stageRef.current || !visible || cancelled) return;
      if (!frameHandle) frameHandle = requestAnimationFrame(tick);
      if (!statusHandle) statusHandle = setInterval(updateStatus, STATUS_INTERVAL_MS);
    };

    const stopLoop = () => {
      if (frameHandle) cancelAnimationFrame(frameHandle);
      frameHandle = 0;
      if (statusHandle) clearInterval(statusHandle);
      statusHandle = null;
    };

    const init = async () => {
      setPhase('loading');
      try {
        const [THREE, demos] = await Promise.all([import('three'), import('@engine/debug/sprite-animation-demos')]);
        const loader = new THREE.TextureLoader();
        const [spriteSheet, blackMarble, setItems] = await Promise.all([loader.loadAsync(SPRITE_URL), loader.loadAsync(BLACK_MARBLE_URL), loadSetItems()]);
        loaded = [spriteSheet, blackMarble];
        if (cancelled) {
          for (const texture of loaded) texture.dispose();
          return;
        }
        stageRef.current = demos.createSpriteDemoStage({ canvas, spriteSheet, blackMarble, setItems, pixelRatio: Math.min(window.devicePixelRatio || 1, 2) });
        measure();
        setPhase('ready');
        startLoop();
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setPhase('error');
      }
    };

    const intersection = new IntersectionObserver((entries) => {
      visible = entries.some((entry) => entry.isIntersecting);
      if (visible && !started) {
        started = true;
        init();
      }
      if (visible) startLoop();
      else stopLoop();
    });
    intersection.observe(grid);

    const resize = new ResizeObserver(measure);
    resize.observe(grid);
    window.addEventListener('resize', measure);

    return () => {
      cancelled = true;
      stopLoop();
      intersection.disconnect();
      resize.disconnect();
      window.removeEventListener('resize', measure);
      stageRef.current?.dispose();
      stageRef.current = null;
      for (const texture of loaded) texture.dispose();
    };
  }, []);

  //NOTE(jimmylee)
  //Push control state into the stage; the loop renders once more after any change.
  React.useEffect(() => {
    const stage = stageRef.current;
    loopRef.current.playing = playing;
    loopRef.current.orbiting = step === null;
    loopRef.current.dirty = true;
    if (!stage) return;
    stage.setPlaying(playing);
    stage.setSpeed(speed);
    if (step === null) stage.setOrbiting(true);
    else stage.setStep(step);
    stage.setElevation(ELEVATIONS[elevation]);
    stage.setTint(tint);
    stage.setWater(water);
    stage.setPhysics(physics);
  }, [phase, playing, speed, step, elevation, tint, water, physics]);

  const repeat = () => {
    stageRef.current?.repeat();
    loopRef.current.dirty = true;
  };

  //NOTE(@jimmylee)
  //Advances the demo clock by one 60fps tick from a paused stage — the unit SEQ delays are written in.
  const stepTick = () => {
    stageRef.current?.stepTick();
    setPlaying(false);
    loopRef.current.dirty = true;
  };

  return (
    <div className={styles.root}>
      <div className={styles.controls} role="toolbar" aria-label="ThreeJS demo controls">
        <div className={styles.controlGroup}>
          <button type="button" className={styles.button} aria-pressed={playing} onClick={() => setPlaying(!playing)}>
            {playing ? 'Pause' : 'Play'}
          </button>
          <button type="button" className={styles.button} onClick={repeat}>
            Repeat
          </button>
          <button type="button" className={styles.button} onClick={stepTick}>
            Step 1 tick
          </button>
        </div>
        <div className={styles.controlGroup} role="group" aria-label="Playback speed">
          <span className={styles.controlLabel}>Speed</span>
          {SPEEDS.map((s) => (
            <button key={s} type="button" className={styles.button} aria-pressed={speed === s} onClick={() => setSpeed(s)}>
              {s}X
            </button>
          ))}
        </div>
        <div className={styles.controlGroup} role="group" aria-label="Camera rotation step">
          <span className={styles.controlLabel}>Camera step</span>
          {STEPS.map((s) => (
            <button key={s} type="button" className={styles.button} aria-pressed={step === s} onClick={() => setStep(s)}>
              {s}
            </button>
          ))}
          <button type="button" className={styles.button} aria-pressed={step === null} onClick={() => setStep(null)}>
            Orbit
          </button>
          <span className={styles.controlLabel}>
            now <span ref={stepRef}>{step ?? 0}</span>
          </span>
        </div>
        <div className={styles.controlGroup} role="group" aria-label="Camera elevation">
          <span className={styles.controlLabel}>Elevation</span>
          {(Object.keys(ELEVATIONS) as ElevationKey[]).map((key) => (
            <button key={key} type="button" className={styles.button} aria-pressed={elevation === key} onClick={() => setElevation(key)}>
              {ELEVATION_LABELS[key]}
            </button>
          ))}
        </div>
        <div className={styles.controlGroup} role="group" aria-label="Scene inspection">
          <button type="button" className={styles.button} aria-pressed={tint} onClick={() => setTint(!tint)}>
            Tint layers
          </button>
          <button type="button" className={styles.button} aria-pressed={water} onClick={() => setWater(!water)}>
            In water
          </button>
          <button type="button" className={styles.button} aria-pressed={physics} onClick={() => setPhysics(!physics)}>
            Physics body
          </button>
        </div>
      </div>

      <ul className={styles.legend} aria-label="Layer tint legend (back to front)">
        {LAYER_TINTS.map((t) => (
          <li key={t.role} className={styles.legendItem}>
            <span className={styles.swatch} style={{ background: hex(t.color) }} aria-hidden="true" />
            {t.label}
          </li>
        ))}
      </ul>
      <ul className={styles.legend} aria-label="Physics body legend">
        {BODY_TINTS.map((t) => (
          <li key={t.role} className={styles.legendItem}>
            <span className={styles.swatch} style={{ background: hex(t.color) }} aria-hidden="true" />
            {t.label}
          </li>
        ))}
      </ul>
      {phase === 'loading' ? <p className={styles.loading}>Loading three.js, the textures and the models</p> : null}
      {phase === 'error' ? <p className={styles.error}>ThreeJS demos unavailable: {error}</p> : null}

      <div className={styles.grid} ref={gridRef}>
        <canvas className={styles.canvas} ref={canvasRef} aria-hidden="true" />
        {SPRITE_DEMOS.map((demo, i) => {
          const { title, seq, timeline } = demo;
          const total = timeline.ticks.reduce((a, b) => a + b, 0);
          return (
            <article key={demo.id} className={styles.card} aria-label={title}>
              <header className={styles.cardHeader}>
                <h3 className={styles.cardTitle}>{title}</h3>
                <span className={styles.cardSeq}>{seq}</span>
              </header>
              <div
                className={styles.stageSlot}
                ref={(node) => {
                  stageSlotRefs.current[i] = node;
                }}
              />
              <p
                className={styles.status}
                aria-live="off"
                ref={(node) => {
                  statusRefs.current[i] = node;
                }}
              >
                {phase === 'ready' ? '' : '-'}
              </p>
              <div className={styles.timeline} role="img" aria-label={`${title} timeline: ${timeline.ticks.length} frames, ${timeline.events.map(eventTitle).join(', ') || 'no events'}`}>
                {timeline.ticks.map((ticks, k) => (
                  <span key={k} className={styles.timelineFrame} style={{ flex: Math.round(ticks * 1000) / 1000 }} />
                ))}
                {timeline.events.map((event) => (
                  <span key={`${event.source}-${event.label}-${event.tick}`} className={event.source === 'seq' ? styles.timelineSeqEvent : styles.timelineEngineEvent} style={{ left: percent(event.tick / total) }} title={eventTitle(event)} />
                ))}
                <span
                  className={styles.timelineHead}
                  hidden
                  ref={(node) => {
                    playheadRefs.current[i] = node;
                  }}
                />
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
