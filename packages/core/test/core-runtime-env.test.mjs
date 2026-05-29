import assert from "node:assert/strict";
import { test } from "node:test";
import {
  coreAutoMusicBedEnabled,
  coreDefaultMusicBed,
  coreMusicBedLevelDb,
  coreSfxLibraryDir,
  coreTtsConcurrency,
} from "../dist/core-runtime-env.js";

test("coreTtsConcurrency parses positive integers and floors decimals", () => {
  assert.equal(coreTtsConcurrency({ LVSTUDIO_TTS_CONCURRENCY: "3" }), 3);
  assert.equal(coreTtsConcurrency({ LVSTUDIO_TTS_CONCURRENCY: "3.9" }), 3);
  assert.equal(coreTtsConcurrency({ LVSTUDIO_TTS_CONCURRENCY: "0" }), undefined);
  assert.equal(coreTtsConcurrency({ LVSTUDIO_TTS_CONCURRENCY: "-2" }), undefined);
  assert.equal(coreTtsConcurrency({ LVSTUDIO_TTS_CONCURRENCY: "bad" }), undefined);
});

test("core path env helpers trim strings and drop blanks", () => {
  assert.equal(coreSfxLibraryDir({ LVSTUDIO_SFX_LIBRARY_DIR: " /tmp/sfx " }), "/tmp/sfx");
  assert.equal(coreSfxLibraryDir({ LVSTUDIO_SFX_LIBRARY_DIR: "   " }), undefined);
  assert.equal(
    coreDefaultMusicBed({ LVSTUDIO_DEFAULT_MUSIC_BED: " music/default.wav " }),
    "music/default.wav",
  );
  assert.equal(coreDefaultMusicBed({ LVSTUDIO_DEFAULT_MUSIC_BED: "" }), undefined);
});

test("coreAutoMusicBedEnabled defaults on and only disables on explicit 0", () => {
  assert.equal(coreAutoMusicBedEnabled({}), true);
  assert.equal(coreAutoMusicBedEnabled({ LVSTUDIO_ENABLE_AUTO_MUSIC_BED: "1" }), true);
  assert.equal(coreAutoMusicBedEnabled({ LVSTUDIO_ENABLE_AUTO_MUSIC_BED: "0" }), false);
});

test("coreMusicBedLevelDb parses numbers and falls back to -24", () => {
  assert.equal(coreMusicBedLevelDb({ LVSTUDIO_MUSIC_BED_LEVEL_DB: "-18" }), -18);
  assert.equal(coreMusicBedLevelDb({ LVSTUDIO_MUSIC_BED_LEVEL_DB: "-18.5" }), -18.5);
  assert.equal(coreMusicBedLevelDb({ LVSTUDIO_MUSIC_BED_LEVEL_DB: "bad" }), -24);
  assert.equal(coreMusicBedLevelDb({}), -24);
});
