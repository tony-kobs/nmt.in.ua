import assert from "node:assert/strict";
import test from "node:test";

import {
  allowsChannel,
  defaultChannelPreferences,
  marathonCategoryOff,
  resolveMarathonDelivery,
  siteChannelEnabled,
} from "./channels";

test("defaults keep marathon email and system telegram, and the site bell stays on", () => {
  const prefs = defaultChannelPreferences();
  assert.equal(siteChannelEnabled(), true);
  assert.equal(allowsChannel(prefs, "marathon", "email"), true);
  assert.equal(allowsChannel(prefs, "marathon", "telegram"), false);
  assert.equal(allowsChannel(prefs, "news", "email"), false);
  assert.equal(allowsChannel(prefs, "news", "telegram"), false);
  assert.equal(allowsChannel(prefs, "system", "telegram"), true);
  assert.equal(allowsChannel(prefs, "system", "email"), false);
  assert.equal(marathonCategoryOff(prefs), false);
});

test("marathon category is off only when both external channels are off", () => {
  const prefs = defaultChannelPreferences();
  prefs.marathon = { email: false, telegram: false };
  assert.equal(marathonCategoryOff(prefs), true);
  prefs.marathon.telegram = true;
  assert.equal(marathonCategoryOff(prefs), false);
});

test("a saved marathon preference replaces participant columns and pause", () => {
  assert.deepEqual(
    resolveMarathonDelivery({
      columnEmail: true,
      columnTelegram: true,
      paused: true,
      preference: { email: true, telegram: false },
    }),
    { notifyEmail: true, notifyBot: false },
  );
  assert.deepEqual(
    resolveMarathonDelivery({
      columnEmail: true,
      columnTelegram: true,
      paused: true,
      preference: null,
    }),
    { notifyEmail: false, notifyBot: false },
  );
  assert.deepEqual(
    resolveMarathonDelivery({
      columnEmail: false,
      columnTelegram: true,
      paused: false,
      preference: null,
    }),
    { notifyEmail: false, notifyBot: true },
  );
});
