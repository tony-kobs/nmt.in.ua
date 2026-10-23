import assert from "node:assert/strict";
import test from "node:test";

import { applySurvey, blankSurvey, isSurveyNavigation, summarizeSurveys, surveyPrompt } from "./survey";

test("the survey walks rating, free text and recommend, and skip keeps earlier answers", () => {
  const rated = applySurvey(blankSurvey(), { type: "rate", rating: 4 });
  assert.equal(rated?.prompt, "improve");
  assert.equal(rated?.state.rating, 4);
  assert.equal(applySurvey(blankSurvey(), { type: "improve", text: "коротше" }), null);
  const wrote = applySurvey(rated!.state, { type: "improve", text: "  коротші пояснення  " });
  assert.equal(wrote?.prompt, "recommend");
  assert.equal(wrote?.state.improve, "коротші пояснення");
  const done = applySurvey(wrote!.state, { type: "recommend", yes: true });
  assert.equal(done?.prompt, "thanks");
  assert.equal(done?.state.status, "done");
  assert.equal(done?.state.recommend, true);
  assert.equal(applySurvey(done!.state, { type: "skip" }), null);

  const skipped = applySurvey(rated!.state, { type: "skip" });
  assert.equal(skipped?.prompt, "skipped");
  assert.equal(skipped?.state.rating, 4);
  assert.equal(skipped?.state.status, "skipped");
  assert.equal(isSurveyNavigation("/menu"), true);
  assert.equal(isSurveyNavigation("❓ Допомога"), true);
  assert.equal(isSurveyNavigation("Сьогодні"), true);
  assert.equal(isSurveyNavigation("хочу більше задач на дроби"), false);
});

test("the card averages ratings and lists answers", () => {
  const prompt = surveyPrompt("rating");
  assert.deepEqual(prompt.buttons.map((button) => button.data), ["mh:sv:1", "mh:sv:2", "mh:sv:3", "mh:sv:4", "mh:sv:5", "mh:sv:x"]);
  const summaries = summarizeSurveys([
    { marathonId: 3, name: "Іра", rating: 5, improve: "ок", recommend: true, status: "done" },
    { marathonId: 3, name: "Олег", rating: 4, improve: null, recommend: false, status: "done" },
    { marathonId: 3, name: "Марія", rating: null, improve: null, recommend: null, status: "skipped" },
    { marathonId: 8, name: "Тарас", rating: 2, improve: null, recommend: null, status: "skipped" },
  ]);
  const course = summaries.get(3);
  assert.equal(course?.average, 4.5);
  assert.equal(course?.count, 2);
  assert.equal(course?.recommendYes, 1);
  assert.equal(course?.recommendAnswered, 2);
  assert.equal(course?.answers.length, 3);
  assert.equal(summaries.get(8)?.average, 2);
});
