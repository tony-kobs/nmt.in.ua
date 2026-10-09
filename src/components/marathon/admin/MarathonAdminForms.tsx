"use client";

import { useTranslations } from "next-intl";
import {
  addDayAction,
  addMaterialAction,
  addRiddleAction,
  addTaskAction,
  createMarathonAction,
  updateDayAction,
  updateMarathonAction,
  updateMaterialAction,
} from "@/modules/marathons/daily/actions";
import {
  parseDay,
  parseDayUpdate,
  parseMarathonInput,
  parseMaterial,
  parseRiddle,
  parseTask,
  type MarathonInput,
} from "@/modules/marathons/daily/forms";
import {
  AdminField,
  AdminInput,
  AdminSelect,
  AdminTextarea,
  FieldError,
  useFieldDescribedBy,
  ValidatedForm,
} from "./ValidatedForm";
import css from "../marathon.module.css";

function MarathonFields({ values }: { values: MarathonInput }) {
  const t = useTranslations("Marathon");
  return (
    <div className={css.row2}>
      <AdminField name="slug" label={t("fields.slug")} hint={t("hints.slug")}>
        <AdminInput
          name="slug"
          defaultValue={values.slug}
          placeholder={t("placeholders.slug")}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
        />
      </AdminField>
      <AdminField name="title" label={t("fields.title")}>
        <AdminInput name="title" defaultValue={values.title} />
      </AdminField>
      <AdminField name="subject" label={t("fields.subject")}>
        <AdminInput name="subject" defaultValue={values.subject} />
      </AdminField>
      <AdminField name="startDate" label={t("fields.startDate")} hint={t("hints.startDate")}>
        <AdminInput name="startDate" type="date" defaultValue={values.startDate} />
      </AdminField>
      <AdminField name="unlockHour" label={t("fields.unlockHour")} hint={t("hints.unlockHour")}>
        <AdminInput
          name="unlockHour"
          defaultValue={values.unlockHour}
          placeholder={t("placeholders.unlockHour")}
          spellCheck={false}
        />
      </AdminField>
      <AdminField name="daysCount" label={t("fields.daysCount")} hint={t("hints.daysCount")}>
        <AdminInput
          name="daysCount"
          type="number"
          min={1}
          max={14}
          defaultValue={values.daysCount}
        />
      </AdminField>
      <AdminField
        name="passThreshold"
        label={t("fields.passThreshold")}
        hint={t("hints.passThreshold")}
      >
        <AdminInput
          name="passThreshold"
          type="number"
          min={0}
          max={100}
          defaultValue={values.passThreshold}
        />
      </AdminField>
      <AdminField name="finalCtaText" label={t("fields.finalCtaText")}>
        <AdminInput name="finalCtaText" defaultValue={values.finalCtaText} />
      </AdminField>
      <AdminField name="finalCtaUrl" label={t("fields.finalCtaUrl")} hint={t("hints.finalCtaUrl")}>
        <AdminInput
          name="finalCtaUrl"
          defaultValue={values.finalCtaUrl}
          placeholder={t("placeholders.finalCtaUrl")}
          spellCheck={false}
        />
      </AdminField>
      <AdminField name="introVideo" label={t("fields.introVideo")} hint={t("hints.introVideo")}>
        <AdminInput
          name="introVideoUrl"
          defaultValue={values.introVideoUrl}
          placeholder="https://"
          spellCheck={false}
        />
      </AdminField>
    </div>
  );
}

export function CreateMarathonForm({ today }: { today: string }) {
  const t = useTranslations("Marathon");
  return (
    <ValidatedForm
      action={createMarathonAction}
      validate={parseMarathonInput}
      className={css.card}
      submitLabel={t("save")}
    >
      <h2>{t("create")}</h2>
      <MarathonFields
        values={{
          slug: "",
          title: "",
          subject: "math",
          startDate: today,
          unlockHour: "09:00",
          daysCount: 5,
          passThreshold: 60,
          finalCtaText: t("defaults.finalCta"),
          finalCtaUrl: "/",
          introVideoUrl: "",
        }}
      />
    </ValidatedForm>
  );
}

export function MarathonSettingsForm({
  marathon,
}: {
  marathon: MarathonInput & { id: number };
}) {
  const t = useTranslations("Marathon");
  return (
    <ValidatedForm
      action={updateMarathonAction}
      validate={parseMarathonInput}
      className={css.card}
      submitLabel={t("save")}
    >
      <input type="hidden" name="id" value={marathon.id} />
      <MarathonFields values={marathon} />
    </ValidatedForm>
  );
}

export function AddRiddleForm({ marathonId }: { marathonId: number }) {
  const t = useTranslations("Marathon");
  return (
    <ValidatedForm
      action={addRiddleAction}
      validate={parseRiddle}
      className={css.form}
      submitLabel={t("addRiddle")}
    >
      <input type="hidden" name="marathonId" value={marathonId} />
      <div className={css.row2}>
        <AdminField name="order" label={t("fields.order")}>
          <AdminInput name="order" type="number" min={1} max={50} />
        </AdminField>
        <AdminField name="title" label={t("fields.riddleTitle")}>
          <AdminInput name="title" placeholder={t("riddleTitle")} />
        </AdminField>
      </div>
      <AdminField name="body" label={t("fields.body")}>
        <AdminTextarea name="body" placeholder={t("body")} />
      </AdminField>
      <AdminField name="answer" label={t("fields.answer")}>
        <AdminTextarea name="answer" placeholder={t("answer")} />
      </AdminField>
      <AdminField name="hint" label={t("fields.hint")}>
        <AdminTextarea name="hint" placeholder={t("hint")} />
      </AdminField>
    </ValidatedForm>
  );
}

export function AddDayForm({ marathonId }: { marathonId: number }) {
  const t = useTranslations("Marathon");
  return (
    <ValidatedForm
      action={addDayAction}
      validate={parseDay}
      className={css.card}
      submitLabel={t("addDay")}
    >
      <input type="hidden" name="marathonId" value={marathonId} />
      <div className={css.row2}>
        <AdminField name="dayNumber" label={t("fields.dayNumber")}>
          <AdminInput
            name="dayNumber"
            type="number"
            min={1}
            max={14}
            placeholder={t("dayNumber")}
          />
        </AdminField>
        <AdminField name="topic" label={t("fields.topic")}>
          <AdminInput name="topic" placeholder={t("topic")} />
        </AdminField>
      </div>
      <AdminField name="introText" label={t("fields.introText")}>
        <AdminTextarea name="introText" placeholder={t("intro")} />
      </AdminField>
    </ValidatedForm>
  );
}

export function UpdateDayForm({
  marathonId,
  dayId,
  topic,
  introText,
}: {
  marathonId: number;
  dayId: number;
  topic: string;
  introText: string;
}) {
  const t = useTranslations("Marathon");
  return (
    <ValidatedForm
      action={updateDayAction}
      validate={parseDayUpdate}
      className={css.form}
      quiet
      submitLabel={t("save")}
    >
      <input type="hidden" name="marathonId" value={marathonId} />
      <input type="hidden" name="dayId" value={dayId} />
      <AdminField name="topic" label={t("fields.topic")}>
        <AdminInput name="topic" defaultValue={topic} />
      </AdminField>
      <AdminField name="introText" label={t("fields.introText")}>
        <AdminTextarea name="introText" defaultValue={introText} />
      </AdminField>
    </ValidatedForm>
  );
}

export function UpdateMaterialForm({
  marathonId,
  dayId,
  materialId,
  order,
  type,
  urlOrBody,
}: {
  marathonId: number;
  dayId: number;
  materialId: number;
  order: number;
  type: string;
  urlOrBody: string;
}) {
  const t = useTranslations("Marathon");
  return (
    <ValidatedForm
      action={updateMaterialAction}
      validate={parseMaterial}
      className={css.form}
      quiet
      submitLabel={t("save")}
    >
      <input type="hidden" name="marathonId" value={marathonId} />
      <input type="hidden" name="dayId" value={dayId} />
      <input type="hidden" name="materialId" value={materialId} />
      <div className={css.row2}>
        <AdminField name="order" label={t("fields.order")}>
          <AdminInput name="order" type="number" min={1} max={50} defaultValue={order} />
        </AdminField>
        <AdminField name="materialType" label={t("fields.materialType")}>
          <AdminSelect name="materialType" defaultValue={type}>
            <option value="text">{t("materialTypes.text")}</option>
            <option value="youtube">{t("materialTypes.youtube")}</option>
            <option value="loom">{t("materialTypes.loom")}</option>
          </AdminSelect>
        </AdminField>
      </div>
      <AdminField name="urlOrBody" label={t("fields.urlOrBody")} hint={t("hints.materialVideo")}>
        <AdminTextarea name="urlOrBody" defaultValue={urlOrBody} rows={5} />
      </AdminField>
    </ValidatedForm>
  );
}

export function AddMaterialForm({
  marathonId,
  dayId,
  nextOrder,
}: {
  marathonId: number;
  dayId: number;
  nextOrder: number;
}) {
  const t = useTranslations("Marathon");
  return (
    <ValidatedForm
      action={addMaterialAction}
      validate={parseMaterial}
      className={css.form}
      quiet
      submitLabel={t("addMaterial")}
    >
      <input type="hidden" name="marathonId" value={marathonId} />
      <input type="hidden" name="dayId" value={dayId} />
      <div className={css.row2}>
        <AdminField name="order" label={t("fields.order")}>
          <AdminInput name="order" type="number" min={1} max={50} defaultValue={nextOrder} />
        </AdminField>
        <AdminField name="materialType" label={t("fields.materialType")}>
          <AdminSelect name="materialType" defaultValue="text">
            <option value="text">{t("materialTypes.text")}</option>
            <option value="youtube">{t("materialTypes.youtube")}</option>
            <option value="loom">{t("materialTypes.loom")}</option>
          </AdminSelect>
        </AdminField>
      </div>
      <AdminField name="urlOrBody" label={t("fields.urlOrBody")} hint={t("hints.materialVideo")}>
        <AdminTextarea name="urlOrBody" />
      </AdminField>
    </ValidatedForm>
  );
}

function OptionFields() {
  const t = useTranslations("Marathon");
  const describedBy = useFieldDescribedBy("options");
  return (
    <div
      className={css.field}
      role="group"
      aria-label={t("fields.options")}
      aria-describedby={describedBy}
    >
      <span className={css.fieldLabel}>{t("fields.options")}</span>
      <div className={css.optionGrid}>
        {[1, 2, 3, 4].map((index) => (
            <AdminInput
              key={index}
              name={`option${index}`}
              placeholder={`${t("option")} ${index}`}
              aria-label={`${t("option")} ${index}`}
            />
        ))}
      </div>
      <FieldError name="options" />
    </div>
  );
}

export function AddTaskForm({
  marathonId,
  dayId,
  nextOrder,
  questions,
}: {
  marathonId: number;
  dayId: number;
  nextOrder: number;
  questions: Array<{ id: number; label: string }>;
}) {
  const t = useTranslations("Marathon");
  return (
    <ValidatedForm
      action={addTaskAction}
      validate={parseTask}
      className={css.form}
      quiet
      submitLabel={t("addTask")}
    >
      <input type="hidden" name="marathonId" value={marathonId} />
      <input type="hidden" name="dayId" value={dayId} />
      <p className={css.hint}>{t("hints.taskEither")}</p>
      <div className={css.row2}>
        <AdminField name="order" label={t("fields.order")}>
          <AdminInput name="order" type="number" min={1} max={50} defaultValue={nextOrder} />
        </AdminField>
        <AdminField name="questionId" label={t("fields.questionId")}>
          <AdminInput
            name="questionId"
            type="number"
            min={1}
            placeholder={t("questionId")}
          />
        </AdminField>
      </div>
      {questions.length > 0 ? (
        <p className={css.meta}>{questions.map((item) => item.label).join(" · ")}</p>
      ) : null}
      <AdminField name="prompt" label={t("fields.prompt")}>
        <AdminTextarea name="prompt" placeholder={t("inlinePrompt")} />
      </AdminField>
      <OptionFields />
      <AdminField name="correct" label={t("fields.correct")}>
        <AdminInput
          name="correct"
          type="number"
          min={1}
          max={4}
          placeholder={t("correct")}
        />
      </AdminField>
      <AdminField name="explanation" label={t("fields.explanation")}>
        <AdminTextarea name="explanation" placeholder={t("explanationHint")} />
      </AdminField>
    </ValidatedForm>
  );
}
