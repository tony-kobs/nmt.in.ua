import assert from "node:assert/strict";
import test from "node:test";

/**
 * Hits the local MySQL 8 from `.env.local`. The default `npm test` skips it,
 * because CI has no database. Run with `NMT_DB_INTEGRATION=1`.
 */
test(
  "MySQL 8 returns the first bank page and a letter match without nested SQL",
  { skip: process.env.NMT_DB_INTEGRATION !== "1" },
  async () => {
    const { BANK_SEARCH_SQL, searchBankTasks } = await import("./taskBank");
    assert.doesNotMatch(BANK_SEARCH_SQL, /REPLACE\(/);
    assert.doesNotMatch(BANK_SEARCH_SQL, /REGEXP/i);
    const browse = await searchBankTasks({
      subject: "math",
      themeId: null,
      query: "",
      page: 1,
      marathonId: 1,
      dayId: 1,
    });
    assert.ok(browse.total > 0);
    assert.equal(browse.page, 1);
    assert.ok(browse.tasks.length > 0);
    const letter = await searchBankTasks({
      subject: "math",
      themeId: null,
      query: "у",
      page: 1,
      marathonId: 1,
      dayId: 1,
    });
    assert.ok(letter.total > 0);
    assert.ok(letter.tasks.every((task) => /у/i.test(`${task.prompt} ${task.themeName}`)));
    const pool = (globalThis as { __nmtMysqlPool?: { end: () => Promise<void> } }).__nmtMysqlPool;
    await pool?.end();
  },
);
