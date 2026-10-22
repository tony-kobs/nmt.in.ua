"use client";

import { useState, type ReactNode } from "react";
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
  updateRiddleAction,
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
import type { DailyStatus } from "@/modules/marathons/daily/store";
import {
  AdminField,
  AdminInput,
  AdminSelect,
  AdminTextarea,
  FieldError,
  SnapshotProvider,
  useFieldDescribedBy,
  ValidatedForm,
} from "./ValidatedForm";
import { AccordionGroup, AccordionSection } from "./SettingsAccordion";
import {
  formatIsoDate,
  joinSummary,
  marathonSectionStorageKey,
  sectionFields,
} from "./settingsSections";
import css from "../marathon.module.css";

type RiddleLink = { id: number; title: string };

function snapshotFrom(values: MarathonInput): Record<string, string> {
  return {
    slug: values.slug,
    title: values.title,
    subject: values.subject,
    description: values.description,
    startDate: values.startDate,
    unlockHour: values.unlockHour,
    reminderHour: values.reminderHour,
    nudgeFrom: String(values.nudgeFrom),
    nudgeUntil: String(values.nudgeUntil),
    daysCount: String(values.daysCount),
    passThreshold: String(values.passThreshold),
    finalCtaText: values.finalCtaText,
    finalCtaUrl: values.finalCtaUrl,
    introVideoUrl: values.introVideoUrl,
    publicChatUrl: values.publicChatUrl,
    inviteAudience: values.inviteAudience,
    landingRiddleCount: String(values.landingRiddleCount),
  };
}

function MarathonSettingsFields({
  values,
  storageScope,
  headingLevel,
  status,
  statusSlot,
  riddles,
}: {
  values: MarathonInput;
  storageScope: string;
  headingLevel: "h2" | "h3";
  status?: DailyStatus;
  statusSlot?: ReactNode;
  riddles?: RiddleLink[] | null;
}) {
  const t = useTranslations("Marathon");
  const storageKey = marathonSectionStorageKey(storageScope);
  const [snapshot, setSnapshot] = useState(() => snapshotFrom(values));

  function publish(name: string, value: string) {
    setSnapshot((prev) => (prev[name] === value ? prev : { ...prev, [name]: value }));
  }

  const audience = snapshot.inviteAudience;
  const audienceLabel =
    audience === "all" || audience === "students" || audience === "none"
      ? t(`audiences.${audience}`)
      : audience;
  const basicSummary = joinSummary([
    snapshot.title,
    snapshot.slug,
    snapshot.subject,
    t(`status.${status ?? "draft"}`),
  ]);
  const datesSummary = joinSummary([
    formatIsoDate(snapshot.startDate),
    snapshot.unlockHour,
    snapshot.daysCount ? t("sections.summaryDays", { count: Number(snapshot.daysCount) || 0 }) : "",
    snapshot.passThreshold ? t("sections.summaryThreshold", { value: snapshot.passThreshold }) : "",
  ]);
  const landingSummary = joinSummary([
    snapshot.landingRiddleCount
      ? t("sections.summaryRiddles", { count: snapshot.landingRiddleCount })
      : "",
    riddles ? t("sections.summaryBank", { count: riddles.length }) : "",
  ]);
  const telegramSummary = joinSummary([
    snapshot.reminderHour ? t("sections.summaryReminder", { hour: snapshot.reminderHour }) : "",
    snapshot.nudgeFrom && snapshot.nudgeUntil
      ? t("sections.summaryNudge", { from: snapshot.nudgeFrom, until: snapshot.nudgeUntil })
      : "",
  ]);

  return (
    <SnapshotProvider onChange={publish}>
      <AccordionGroup>
        <AccordionSection
          id="basic"
          title={t("sections.basic")}
          summary={basicSummary}
          fields={sectionFields("basic")}
          storageKey={storageKey}
          defaultOpen
          headingLevel={headingLevel}
        >
          {statusSlot ?? <p className={css.hint}>{t("sections.draftNote")}</p>}
          <div className={css.row2}>
            <AdminField name="title" label={t("fields.title")}>
              <AdminInput name="title" defaultValue={values.title} />
            </AdminField>
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
            <AdminField name="subject" label={t("fields.subject")}>
              <AdminInput name="subject" defaultValue={values.subject} />
            </AdminField>
          </div>
        </AccordionSection>

        <AccordionSection
          id="dates"
          title={t("sections.dates")}
          summary={datesSummary}
          fields={sectionFields("dates")}
          storageKey={storageKey}
          headingLevel={headingLevel}
        >
          <div className={css.row2}>
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
          </div>
        </AccordionSection>

        <AccordionSection
          id="landing"
          title={t("sections.landing")}
          summary={landingSummary}
          fields={sectionFields("landing")}
          storageKey={storageKey}
          headingLevel={headingLevel}
        >
          <AdminField name="description" label={t("fields.description")} hint={t("hints.description")}>
            <AdminTextarea name="description" defaultValue={values.description} rows={4} />
          </AdminField>
          <div className={css.row2}>
            <AdminField name="introVideo" label={t("fields.introVideo")} hint={t("hints.introVideo")}>
              <AdminInput
                name="introVideoUrl"
                defaultValue={values.introVideoUrl}
                placeholder="https://"
                spellCheck={false}
              />
            </AdminField>
            <AdminField
              name="landingRiddleCount"
              label={t("fields.landingRiddleCount")}
              hint={t("hints.landingRiddleCount")}
            >
              <AdminInput
                name="landingRiddleCount"
                type="number"
                min={1}
                max={12}
                defaultValue={values.landingRiddleCount}
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
            <AdminField name="publicChatUrl" label={t("fields.publicChatUrl")} hint={t("hints.publicChatUrl")}>
              <AdminInput
                name="publicChatUrl"
                defaultValue={values.publicChatUrl}
                placeholder={t("placeholders.publicChatUrl")}
                spellCheck={false}
              />
            </AdminField>
          </div>
          <div className={css.stack}>
            <p className={css.fieldLabel}>{t("sections.riddleLinks")}</p>
            {riddles == null ? (
              <p className={css.hint}>{t("sections.riddleLinksEmpty")}</p>
            ) : riddles.length === 0 ? (
              <p className={css.hint}>{t("riddleBankLead")}</p>
            ) : (
              <ul className={css.riddleLinks}>
                {riddles.map((riddle) => (
                  <li key={riddle.id}>
                    <a className={css.riddleLink} href={`#riddle-${riddle.id}`}>
                      {riddle.title}
                    </a>
                  </li>
                ))}
              </ul>
            )}
            {riddles != null ? (
              <a className={css.buttonQuiet} href="#riddles">
                {t("sections.riddleBank")}
              </a>
            ) : null}
          </div>
        </AccordionSection>

        <AccordionSection
          id="notify"
          title={t("sections.notify")}
          summary={audienceLabel}
          fields={sectionFields("notify")}
          storageKey={storageKey}
          headingLevel={headingLevel}
        >
          <AdminField
            name="inviteAudience"
            label={t("fields.inviteAudience")}
            hint={t("hints.inviteAudience")}
          >
            <AdminSelect name="inviteAudience" defaultValue={values.inviteAudience}>
              <option value="none">{t("audiences.none")}</option>
              <option value="all">{t("audiences.all")}</option>
              <option value="students">{t("audiences.students")}</option>
            </AdminSelect>
          </AdminField>
        </AccordionSection>

        <AccordionSection
          id="telegram"
          title={t("sections.telegram")}
          summary={telegramSummary}
          fields={sectionFields("telegram")}
          storageKey={storageKey}
          headingLevel={headingLevel}
        >
          <div className={css.row2}>
            <AdminField name="reminderHour" label={t("fields.reminderHour")} hint={t("hints.reminderHour")}>
              <AdminInput
                name="reminderHour"
                defaultValue={values.reminderHour}
                placeholder={t("placeholders.reminderHour")}
                spellCheck={false}
              />
            </AdminField>
            <AdminField name="nudgeFrom" label={t("fields.nudgeFrom")} hint={t("hints.nudgeFrom")}>
              <AdminInput name="nudgeFrom" type="number" min={0} max={23} defaultValue={values.nudgeFrom} />
            </AdminField>
            <AdminField name="nudgeUntil" label={t("fields.nudgeUntil")} hint={t("hints.nudgeUntil")}>
              <AdminInput name="nudgeUntil" type="number" min={0} max={23} defaultValue={values.nudgeUntil} />
            </AdminField>
          </div>
        </AccordionSection>
      </AccordionGroup>
    </SnapshotProvider>
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
      invalidFocus="section"
      associate
    >
      <h2>{t("create")}</h2>
      <MarathonSettingsFields
        storageScope="new"
        headingLevel="h3"
        values={{
          slug: "",
          title: "",
          description: "",
          subject: "math",
          startDate: today,
          unlockHour: "09:00",
          reminderHour: "19:00",
          nudgeFrom: 10,
          nudgeUntil: 21,
          daysCount: 5,
          passThreshold: 60,
          finalCtaText: t("defaults.finalCta"),
          finalCtaUrl: "/",
          introVideoUrl: "",
          publicChatUrl: "",
          inviteAudience: "none",
          landingRiddleCount: 3,
        }}
      />
    </ValidatedForm>
  );
}

export function MarathonSettingsForm({
  marathon,
  statusSlot,
  riddles,
}: {
  marathon: MarathonInput & { id: number; status: DailyStatus };
  statusSlot?: ReactNode;
  riddles?: RiddleLink[];
}) {
  const t = useTranslations("Marathon");
  return (
    <ValidatedForm
      action={updateMarathonAction}
      validate={parseMarathonInput}
      className={css.card}
      submitLabel={t("save")}
      invalidFocus="section"
      associate
      persist={<input type="hidden" name="id" value={marathon.id} />}
    >
      <MarathonSettingsFields
        values={marathon}
        storageScope={String(marathon.id)}
        headingLevel="h2"
        status={marathon.status}
        statusSlot={statusSlot}
        riddles={riddles ?? []}
      />
    </ValidatedForm>
  );
}

function RiddleOptionFields({
  options,
  correctField,
}: {
  options: string[];
  correctField: number | null;
}) {
  const t = useTranslations("Marathon");
  return (
    <fieldset className={css.optionGrid}>
      <legend className={css.fieldLabel}>{t("fields.options")}</legend>
      <p className={css.hint}>{t("riddleOptionsLead")}</p>
      {[1, 2, 3, 4, 5, 6].map((index) => (
        <div key={index} className={css.riddleOptionRow}>
          <AdminInput
            name={`option${index}`}
            defaultValue={options[index - 1] ?? ""}
            aria-label={`${t("option")} ${index}`}
            placeholder={`${t("option")} ${index}`}
          />
          <label className={css.option}>
            <input
              type="radio"
              name="correct"
              value={index}
              defaultChecked={correctField === index}
            />
            {t("correctChoice")}
          </label>
        </div>
      ))}
      <FieldError name="options" />
      <FieldError name="correct" />
    </fieldset>
  );
}

function RiddleFields({
  subject,
  scope,
  title,
  body,
  hint,
  options,
  correctField,
}: {
  subject: string;
  scope: "shared" | "marathon";
  title: string;
  body: string;
  hint: string;
  options: string[];
  correctField: number | null;
}) {
  const t = useTranslations("Marathon");
  return (
    <>
      <AdminField name="title" label={t("fields.riddleTitle")}>
        <AdminInput name="title" defaultValue={title} placeholder={t("riddleTitle")} />
      </AdminField>
      <AdminField name="body" label={t("fields.body")}>
        <AdminTextarea name="body" defaultValue={body} placeholder={t("body")} />
      </AdminField>
      <div className={css.row2}>
        <AdminField name="subject" label={t("fields.subject")} hint={t("hints.riddleSubject")}>
          <AdminInput name="subject" defaultValue={subject} />
        </AdminField>
        <AdminField name="scope" label={t("fields.scope")} hint={t("hints.riddleScope")}>
          <AdminSelect name="scope" defaultValue={scope}>
            <option value="marathon">{t("riddleScopeMarathon")}</option>
            <option value="shared">{t("riddleScopeShared")}</option>
          </AdminSelect>
        </AdminField>
      </div>
      <RiddleOptionFields options={options} correctField={correctField} />
      <AdminField name="hint" label={t("fields.hint")} hint={t("hints.riddleHint")}>
        <AdminTextarea name="hint" defaultValue={hint} placeholder={t("hint")} />
      </AdminField>
    </>
  );
}

export function AddRiddleForm({
  marathonId,
  slug,
  subject,
}: {
  marathonId: number;
  slug: string;
  subject: string;
}) {
  const t = useTranslations("Marathon");
  return (
    <ValidatedForm
      action={addRiddleAction}
      validate={parseRiddle}
      className={css.form}
      submitLabel={t("addRiddle")}
    >
      <input type="hidden" name="marathonId" value={marathonId} />
      <input type="hidden" name="slug" value={slug} />
      <RiddleFields
        subject={subject}
        scope="marathon"
        title=""
        body=""
        hint=""
        options={[]}
        correctField={null}
      />
    </ValidatedForm>
  );
}

export function EditRiddleForm({
  marathonId,
  slug,
  riddleId,
  subject,
  scope,
  title,
  body,
  hint,
  options,
  correctField,
}: {
  marathonId: number;
  slug: string;
  riddleId: number;
  subject: string;
  scope: "shared" | "marathon";
  title: string;
  body: string;
  hint: string;
  options: string[];
  correctField: number | null;
}) {
  const t = useTranslations("Marathon");
  return (
    <ValidatedForm
      action={updateRiddleAction}
      validate={parseRiddle}
      className={css.form}
      quiet
      submitLabel={t("save")}
    >
      <input type="hidden" name="marathonId" value={marathonId} />
      <input type="hidden" name="riddleId" value={riddleId} />
      <input type="hidden" name="slug" value={slug} />
      <RiddleFields
        subject={subject}
        scope={scope}
        title={title}
        body={body}
        hint={hint}
        options={options}
        correctField={correctField}
      />
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
