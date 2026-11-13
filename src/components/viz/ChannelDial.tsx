"use client";

import { SCENES, sceneById } from "@/lib/scenes";
import { setScene, stepScene, useScene } from "@/lib/scene-store";
import styles from "./channel.module.css";

// The scene switcher. Same channel everywhere: the hero, the theater, the X card.
export default function ChannelDial({ variant = "hero" }: { variant?: "hero" | "theater" | "embed" }) {
  const id = useScene();
  const cur = sceneById(id) ?? SCENES[0];
  if (variant === "embed") {
    return (
      <button type="button" className={styles.embedBtn} onClick={() => stepScene(1)} aria-label={`Visual channel ${cur.code} ${cur.name}. Next channel`}>
        <b>{cur.code}</b><span>{cur.name}</span>
      </button>
    );
  }
  return (
    <div className={`${styles.dial} ${variant === "theater" ? styles.theater : ""}`} role="group" aria-label="Visual channel">
      <div className={styles.now}>
        <button type="button" className={styles.step} onClick={() => stepScene(-1)} aria-label="Previous channel">&#9664;</button>
        <p className={styles.label} aria-live="polite">
          <small>CH {cur.code}</small>
          <strong>{cur.name}</strong>
          <span>{cur.mood}</span>
        </p>
        <button type="button" className={styles.step} onClick={() => stepScene(1)} aria-label="Next channel">&#9654;</button>
      </div>
      <ul className={styles.chips}>
        {SCENES.map((s) => (
          <li key={s.id}>
            <button type="button" className={styles.chip} aria-pressed={s.id === id} onClick={() => setScene(s.id)} title={`${s.code} ${s.name}`} aria-label={`${s.code} ${s.name}`}>
              {s.code.slice(1)}{s.rig ? <i aria-hidden="true" /> : null}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
