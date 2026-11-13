"use client";

// One channel for the whole site: the hero, the dock theater and the X card
// all read the same scene. Persisted in localStorage when the browser allows
// it (X card iframes may not), and shareable with ?viz=<scene-id>.

import { useSyncExternalStore } from "react";
import { DEFAULT_SCENE, SCENES, sceneById, type SceneId } from "@/lib/scenes";

const KEY = "ht-scene";
const listeners = new Set<() => void>();
let current: SceneId | null = null;

function read(): SceneId {
  if (current) return current;
  let id: string | null = null;
  try { id = new URLSearchParams(window.location.search).get("viz"); } catch { /* ignore */ }
  // ?viz=2d asks for the canvas fallback of the default channel.
  if (id === "2d") { current = DEFAULT_SCENE; return current; }
  if (!sceneById(id)) { try { id = window.localStorage.getItem(KEY); } catch { id = null; } }
  current = sceneById(id)?.id ?? DEFAULT_SCENE;
  return current;
}

export function setScene(id: SceneId) {
  current = id;
  try { window.localStorage.setItem(KEY, id); } catch { /* storage blocked */ }
  listeners.forEach((l) => l());
}

export function stepScene(d: number) {
  const i = SCENES.findIndex((s) => s.id === read());
  setScene(SCENES[(i + d + SCENES.length) % SCENES.length].id);
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

export function useScene(): SceneId {
  return useSyncExternalStore(subscribe, read, () => DEFAULT_SCENE);
}
