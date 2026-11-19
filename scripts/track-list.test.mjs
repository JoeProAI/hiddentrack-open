import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { test } from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const loadPackage = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function compile(file, overrides = {}) {
  const loaded = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(source, {
    module: loaded, exports: loaded.exports,
    require: (name) => Object.hasOwn(overrides, name) ? overrides[name] : loadPackage(name),
  }, { filename: file });
  return loaded.exports;
}

const catalogue = compile("src/lib/fresh-cuts.ts");
const moods = compile("src/lib/moods.ts");
function render({ tracks = catalogue.tracks, initial = {} } = {}) {
  const calls = [];
  const TrackList = compile("src/components/player/TrackList.tsx", {
    "@/lib/fresh-cuts": catalogue,
    "@/lib/moods": moods,
    "./listen.module.css": { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) },
    "next/link": ({ children, ...props }) => React.createElement("a", props, children),
    "./PlayerProvider": { usePlayer: () => ({ tracks, index: null, playing: false, load: (...args) => { calls.push(args); return Promise.resolve(); }, toggle: () => {} }) },
  }).default;
  let tree;
  function Capture() { tree = TrackList({ initial }); return tree; }
  const html = renderToStaticMarkup(React.createElement(Capture));
  return { html, tree, calls };
}
function elements(node, predicate) {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap((child) => elements(child, predicate));
  return [...(predicate(node) ? [node] : []), ...elements(node.props?.children, predicate)];
}

test("initial shelf renders thirty rows but retains the full unfiltered queue", async () => {
  const { html, tree, calls } = render();
  assert.equal((html.match(/<li /g) || []).length, 30);
  assert.match(html, /1551 cuts/);
  assert.match(html, /Show more cuts/);
  assert.doesNotMatch(html, /id="t-sold-to-the-back-row"/);
  await elements(tree, (node) => node.type === "button" && node.props.className === "title")[0].props.onClick();
  assert.equal(calls[0][0], 0);
  assert.equal(calls[0][1], undefined);
});

test("search finds the last track outside the initial batch", () => {
  const { html } = render({ initial: { q: "Sold to the Back Row" } });
  assert.match(html, /id="t-sold-to-the-back-row"/);
  assert.match(html, /1 of 1551 cuts/);
  assert.doesNotMatch(html, /Show more cuts/);
});

test("filtered play uses every matching track, not only rendered rows", async () => {
  const { html, tree, calls } = render({ initial: { mood: "hard", genre: "rap" } });
  const expected = catalogue.tracks.map((_, i) => i).filter((i) => moods.moodsFor(catalogue.tracks[i]).includes("hard") && moods.genresFor(catalogue.tracks[i]).includes("rap"));
  assert.ok(expected.length > 30);
  assert.equal((html.match(/<li /g) || []).length, 30);
  await elements(tree, (node) => node.type === "button" && node.props.className === "title")[0].props.onClick();
  assert.deepEqual(Array.from(calls[0][1]), Array.from(expected));
});

test("empty catalogue and no matches keep their existing empty states", () => {
  assert.match(render({ tracks: [] }).html, /No cuts on the shelf yet/);
  const { html } = render({ initial: { q: "no-such-track-987654321" } });
  assert.match(html, /Nothing on the shelf matches/);
  assert.doesNotMatch(html, /Show more cuts/);
  assert.equal((html.match(/<li /g) || []).length, 0);
});
