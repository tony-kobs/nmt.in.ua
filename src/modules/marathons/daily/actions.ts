"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { hasPermission } from "@/modules/auth/permissions";
import { requireUser } from "@/modules/auth/getCurrentUser";
import { createUser, CreateUserError } from "@/modules/auth/users";
import { sendRegistrationVerificationMail } from "@/modules/auth/emailMessages";
import { validateRegistrationInput } from "@/modules/auth/validateRegistration";
import { safeInternalPath } from "@/lib/safeInternalPath";
import { dayUnlockAt } from "./calendar";
import { channelSavedPath } from "./channelPath";
import { createMarathonBotLink } from "./botLink";
import { notifyMarathonRegistration } from "./registrationDelivery";
import { markNotificationsReadByLink } from "@/modules/notifications/store";
import {
  DUPLICATE_DAY,
  DUPLICATE_ORDER,
  DUPLICATE_SLUG,
  FORM_INVALID,
  FORM_SERVER,
  QUESTION_MISSING,
  adminFormError,
  answersFromForm,
  isDailyStatus,
  isDuplicateKey,
  parseCopyInput,
  parseDay,
  isSlug,
  parseDayUpdate,
  parseMarathonInput,
  parseMaterial,
  parseRiddle,
  parseTask,
  readInt,
  readText,
  utmJsonFromForm,
  type AdminFormState,
} from "./forms";
import { isCopyKey } from "./copy";
import { activationBlockers, marathonIsReady } from "./readiness";
import { sendCompletedDayFollowUp, sendRankNotice } from "./notificationsJob";
import { seedMathMarathon } from "./seed";
import {
  completeParticipantDay,
  deleteDailyMarathon,
  deleteDay,
  deleteMaterial,
  deleteRiddle,
  deleteTask,
  getDailyById,
  getRiddleById,
  getDailyBySlug,
  getParticipant,
  insertDailyMarathon,
  insertDay,
  insertMaterial,
  insertRiddle,
  insertTask,
  joinParticipant,
  listDayTaskCounts,
  listDays,
  listProgress,
  loadMarathonCopy,
  markConverted,
  markIntroSeen,
  markMaterialsViewed,
  quizTaskExists,
  resetMarathonCopy,
  saveMarathonCopy,
  setDailyStatus,
  setNotifyToggles,
  declineMarathon,
  setNotifyPrefs,
  updateDailyMarathon,
  updateDay,
  updateMaterial,
  updateRiddle,
} from "./store";
import { answerRiddle, type AttemptResult } from "./riddleQuiz";
import {
  dayBelongsToMarathon,
  insertSampledTasks,
  quizBankMatchesSubject,
  replaceBankTask,
  reshuffleDayTaskOrder,
  sampleThemePreviews,
  type BankPreview,
} from "./taskBank";
import { openRiddleSession, writeRiddleSession } from "./riddleSession";
import {
  buildMessageTimeline,
  cleanTimelineBody,
  isTimelineChannel,
  isTimelineKind,
  parseKyivDateTime,
  type TimelineItem,
} from "./messageTimeline";
import {
  loadTimelineSnapshot,
  rewriteOutbox,
  saveSlotOverride,
  silenceMarathonSends,
  syncQueuedJobs,
  updateMessageJob,
  type TimelineSnapshot,
} from "./messageOverrides";
import { loginCandidatesFromEmail, normalizeCtaUrl } from "./utm";

const RETURN_COOKIE = "marathon_return";

async function requireManager() {
  const user = await requireUser();
  if (!hasPermission(user.role, "marathon:manage")) redirect("/");
  return user;
}

function bounds(input: {
  startDate: string;
  unlockHour: string;
  daysCount: number;
}): { startsAt: number; endsAt: number } {
  const startsAt = Math.floor(
    dayUnlockAt({ ...input, dayNumber: 1 }).getTime() / 1000,
  );
  const endsAt = Math.floor(
    dayUnlockAt({ ...input, dayNumber: input.daysCount + 1 }).getTime() / 1000,
  );
  return { startsAt, endsAt };
}

function adminPath(id?: number): string {
  return id ? `/admin/marathons/${id}` : "/admin/marathons";
}

function savedPath(id?: number): string {
  return `${adminPath(id)}?saved=${Date.now()}`;
}

export async function createMarathonAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireManager();
  const parsed = parseMarathonInput(formData);
  if (!parsed.ok) return adminFormError(parsed.issues);
  let id = 0;
  try {
    id = await insertDailyMarathon({
      ...parsed.value,
      ...bounds(parsed.value),
    });
  } catch (error) {
    if (isDuplicateKey(error)) return adminFormError([DUPLICATE_SLUG]);
    console.error("createMarathonAction", error);
    return adminFormError([FORM_SERVER]);
  }
  revalidatePath(adminPath());
  redirect(savedPath(id));
}

export async function updateMarathonAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireManager();
  const id = readInt(formData.get("id"));
  const parsed = parseMarathonInput(formData);
  if (!id) return adminFormError([FORM_INVALID]);
  if (!parsed.ok) return adminFormError(parsed.issues);
  try {
    await updateDailyMarathon(id, { ...parsed.value, ...bounds(parsed.value) });
  } catch (error) {
    if (isDuplicateKey(error)) return adminFormError([DUPLICATE_SLUG]);
    console.error("updateMarathonAction", error);
    return adminFormError([FORM_SERVER]);
  }
  revalidatePath(adminPath(id));
  revalidatePath(`/marathon/${parsed.value.slug}`);
  redirect(savedPath(id));
}

export async function setMarathonStatusAction(formData: FormData): Promise<void> {
  await requireManager();
  const id = readInt(formData.get("id"));
  const status = readText(formData.get("status"), 16);
  if (!id || !isDailyStatus(status)) redirect(`${adminPath(id ?? undefined)}?error=invalid`);
  if (status === "active") {
    const marathon = await getDailyById(id);
    if (!marathon) redirect(`${adminPath(id)}?error=invalid`);
    const days = await listDayTaskCounts(id);
    if (!marathonIsReady(activationBlockers({ daysCount: marathon.daysCount, days }))) {
      redirect(`${adminPath(id)}?error=not_ready`);
    }
  }
  const previous = await getDailyById(id);
  await setDailyStatus(id, status);
  if (status === "archived") {
    try {
      await silenceMarathonSends(id);
    } catch (error) {
      console.error("marathon archive silence", error);
    }
  }
  if (status === "active" && previous && previous.status !== "active") {
    try {
      const { dispatchMarathonInvites } = await import("./inviteDispatch");
      await dispatchMarathonInvites(id);
    } catch (error) {
      console.error("marathon invite dispatch", error);
    }
  }
  revalidatePath(adminPath(id));
  redirect(savedPath(id));
}

export async function deleteMarathonAction(formData: FormData): Promise<void> {
  await requireManager();
  const id = readInt(formData.get("id"));
  if (!id) redirect(`${adminPath()}?error=invalid`);
  await deleteDailyMarathon(id);
  revalidatePath(adminPath());
  redirect(adminPath());
}

export async function seedMarathonAction(): Promise<void> {
  await requireManager();
  let result: "created" | "exists" = "created";
  try {
    result = await seedMathMarathon();
  } catch (error) {
    if (isDuplicateKey(error)) redirect(`${adminPath()}?error=seed_exists`);
    console.error("seedMarathonAction", error);
    redirect(`${adminPath()}?error=server`);
  }
  revalidatePath(adminPath());
  redirect(result === "exists" ? `${adminPath()}?error=seed_exists` : savedPath());
}

function revalidateMarathonSurfaces(id: number, slug: string): void {
  revalidatePath(adminPath(id));
  if (isSlug(slug)) revalidatePath(`/marathon/${slug}`);
}

export async function addRiddleAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireManager();
  const id = readInt(formData.get("marathonId"));
  const slug = readText(formData.get("slug"), 64);
  const parsed = parseRiddle(formData);
  if (!id) return adminFormError([FORM_INVALID]);
  if (!parsed.ok) return adminFormError(parsed.issues);
  try {
    await insertRiddle(id, parsed.value);
  } catch (error) {
    console.error("addRiddleAction", error);
    return adminFormError([FORM_SERVER]);
  }
  revalidateMarathonSurfaces(id, slug);
  redirect(savedPath(id));
}

export async function updateRiddleAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireManager();
  const id = readInt(formData.get("marathonId"));
  const riddleId = readInt(formData.get("riddleId"));
  const slug = readText(formData.get("slug"), 64);
  const parsed = parseRiddle(formData);
  if (!id || !riddleId) return adminFormError([FORM_INVALID]);
  if (!parsed.ok) return adminFormError(parsed.issues);
  const marathon = await getDailyById(id);
  if (!marathon) return adminFormError([FORM_INVALID]);
  try {
    const saved = await updateRiddle(id, marathon.subject, riddleId, parsed.value);
    if (!saved) return adminFormError([FORM_INVALID]);
  } catch (error) {
    console.error("updateRiddleAction", error);
    return adminFormError([FORM_SERVER]);
  }
  revalidateMarathonSurfaces(id, slug);
  redirect(savedPath(id));
}

export async function deleteRiddleAction(formData: FormData): Promise<void> {
  await requireManager();
  const id = readInt(formData.get("marathonId"));
  const riddleId = readInt(formData.get("riddleId"));
  const slug = readText(formData.get("slug"), 64);
  if (!id || !riddleId) redirect(`${adminPath(id ?? undefined)}?error=invalid`);
  const marathon = await getDailyById(id);
  if (!marathon) redirect(`${adminPath(id)}?error=invalid`);
  await deleteRiddle(id, marathon.subject, riddleId);
  revalidateMarathonSurfaces(id, slug);
  redirect(adminPath(id));
}

/** Public landing check. The client sends an option id; the key stays here. */
export async function checkRiddleAction(
  riddleId: number,
  optionId: number,
): Promise<AttemptResult> {
  if (!Number.isInteger(riddleId) || !Number.isInteger(optionId) || riddleId < 1 || optionId < 1) {
    return { status: "invalid" };
  }
  const nowMs = Date.now();
  const session = await openRiddleSession(nowMs);
  const graded = answerRiddle({
    riddle: await getRiddleById(riddleId),
    optionId,
    session,
    nowMs,
  });
  if (graded.result.status === "wrong" || graded.result.status === "correct") {
    await writeRiddleSession(graded.session);
  }
  return graded.result;
}

export async function addDayAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireManager();
  const id = readInt(formData.get("marathonId"));
  const parsed = parseDay(formData);
  if (!id) return adminFormError([FORM_INVALID]);
  if (!parsed.ok) return adminFormError(parsed.issues);
  try {
    await insertDay(id, parsed.value);
  } catch (error) {
    if (isDuplicateKey(error)) return adminFormError([DUPLICATE_DAY]);
    console.error("addDayAction", error);
    return adminFormError([FORM_SERVER]);
  }
  revalidatePath(adminPath(id));
  redirect(savedPath(id));
}

export async function updateDayAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireManager();
  const id = readInt(formData.get("marathonId"));
  const dayId = readInt(formData.get("dayId"));
  const parsed = parseDayUpdate(formData);
  if (!id || !dayId) return adminFormError([FORM_INVALID]);
  if (!parsed.ok) return adminFormError(parsed.issues);
  await updateDay(id, dayId, parsed.value);
  revalidatePath(adminPath(id));
  redirect(savedPath(id));
}

export async function deleteDayAction(formData: FormData): Promise<void> {
  await requireManager();
  const id = readInt(formData.get("marathonId"));
  const dayId = readInt(formData.get("dayId"));
  if (!id || !dayId) redirect(`${adminPath(id ?? undefined)}?error=invalid`);
  await deleteDay(id, dayId);
  revalidatePath(adminPath(id));
  redirect(adminPath(id));
}

export async function addMaterialAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireManager();
  const id = readInt(formData.get("marathonId"));
  const dayId = readInt(formData.get("dayId"));
  const parsed = parseMaterial(formData);
  if (!id || !dayId) return adminFormError([FORM_INVALID]);
  if (!parsed.ok) return adminFormError(parsed.issues);
  try {
    await insertMaterial(dayId, parsed.value);
  } catch (error) {
    if (isDuplicateKey(error)) return adminFormError([DUPLICATE_ORDER]);
    console.error("addMaterialAction", error);
    return adminFormError([FORM_SERVER]);
  }
  revalidatePath(adminPath(id));
  redirect(savedPath(id));
}

export async function deleteMaterialAction(formData: FormData): Promise<void> {
  await requireManager();
  const id = readInt(formData.get("marathonId"));
  const dayId = readInt(formData.get("dayId"));
  const materialId = readInt(formData.get("materialId"));
  if (!id || !dayId || !materialId) redirect(`${adminPath(id ?? undefined)}?error=invalid`);
  await deleteMaterial(dayId, materialId);
  revalidatePath(adminPath(id));
  redirect(adminPath(id));
}

export async function addTaskAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireManager();
  const id = readInt(formData.get("marathonId"));
  const dayId = readInt(formData.get("dayId"));
  const parsed = parseTask(formData);
  if (!id || !dayId) return adminFormError([FORM_INVALID]);
  if (!parsed.ok) return adminFormError(parsed.issues);
  try {
    if (parsed.value.mode === "bank") {
      if (!(await quizTaskExists(parsed.value.questionId))) {
        return adminFormError([QUESTION_MISSING]);
      }
      await insertTask(dayId, {
        order: parsed.value.order,
        questionId: parsed.value.questionId,
        prompt: null,
        options: null,
        correct: null,
      });
    } else {
      await insertTask(dayId, {
        order: parsed.value.order,
        questionId: null,
        prompt: parsed.value.prompt,
        options: parsed.value.options,
        correct: parsed.value.correct,
        explanation: parsed.value.explanation,
      });
    }
  } catch (error) {
    if (isDuplicateKey(error)) return adminFormError([DUPLICATE_ORDER]);
    console.error("addTaskAction", error);
    return adminFormError([FORM_SERVER]);
  }
  revalidatePath(adminPath(id));
  redirect(savedPath(id));
}

export async function deleteTaskAction(formData: FormData): Promise<void> {
  await requireManager();
  const id = readInt(formData.get("marathonId"));
  const dayId = readInt(formData.get("dayId"));
  const taskId = readInt(formData.get("taskId"));
  if (!id || !dayId || !taskId) redirect(`${adminPath(id ?? undefined)}?error=invalid`);
  await deleteTask(dayId, taskId);
  revalidatePath(adminPath(id));
  redirect(adminPath(id));
}

function positiveId(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

async function dayOnMarathon(marathonId: number, dayId: number): Promise<boolean> {
  const marathon = await getDailyById(marathonId);
  if (!marathon) return false;
  return dayBelongsToMarathon(marathonId, dayId);
}

export async function previewTopicSampleAction(input: {
  marathonId: number;
  dayId: number;
  themeId: number;
  count: number;
  excludeIds: number[];
}): Promise<{ ok: true; questions: BankPreview[] } | { ok: false; error: "invalid" | "empty" | "subject" }> {
  await requireManager();
  const marathonId = positiveId(input?.marathonId);
  const dayId = positiveId(input?.dayId);
  const themeId = positiveId(input?.themeId);
  const count = typeof input?.count === "number" ? input.count : 0;
  if (!marathonId || !dayId || !themeId) return { ok: false, error: "invalid" };
  const marathon = await getDailyById(marathonId);
  if (!marathon) return { ok: false, error: "invalid" };
  if (!quizBankMatchesSubject(marathon.subject)) return { ok: false, error: "subject" };
  if (!(await dayBelongsToMarathon(marathonId, dayId))) return { ok: false, error: "invalid" };
  const excludeIds = Array.isArray(input?.excludeIds)
    ? input.excludeIds.filter((id): id is number => positiveId(id) != null)
    : [];
  try {
    const questions = await sampleThemePreviews({
      subject: marathon.subject,
      themeId,
      count,
      excludeIds,
    });
    if (questions.length === 0) return { ok: false, error: "empty" };
    return { ok: true, questions };
  } catch (error) {
    console.error("previewTopicSampleAction", error);
    return { ok: false, error: "invalid" };
  }
}

export async function addSampledTasksAction(formData: FormData): Promise<void> {
  await requireManager();
  const id = readInt(formData.get("marathonId"));
  const dayId = readInt(formData.get("dayId"));
  const themeId = readInt(formData.get("themeId"));
  const questionIds = formData
    .getAll("questionId")
    .map((value) => readInt(value))
    .filter((value): value is number => value != null && value > 0);
  if (!id || !dayId || !themeId || questionIds.length === 0) {
    redirect(`${adminPath(id ?? undefined)}?error=invalid`);
  }
  const marathon = await getDailyById(id);
  if (!marathon || !quizBankMatchesSubject(marathon.subject)) {
    redirect(`${adminPath(id)}?error=invalid`);
  }
  if (!(await dayBelongsToMarathon(id, dayId))) redirect(`${adminPath(id)}?error=invalid`);
  try {
    const inserted = await insertSampledTasks({ dayId, themeId, questionIds });
    if (inserted === 0) redirect(`${adminPath(id)}?error=question`);
  } catch (error) {
    if (isDuplicateKey(error)) redirect(`${adminPath(id)}?error=duplicate`);
    console.error("addSampledTasksAction", error);
    redirect(`${adminPath(id)}?error=server`);
  }
  revalidatePath(adminPath(id));
  redirect(savedPath(id));
}

export async function replaceTaskAction(formData: FormData): Promise<void> {
  await requireManager();
  const id = readInt(formData.get("marathonId"));
  const dayId = readInt(formData.get("dayId"));
  const taskId = readInt(formData.get("taskId"));
  if (!id || !dayId || !taskId) redirect(`${adminPath(id ?? undefined)}?error=invalid`);
  if (!(await dayOnMarathon(id, dayId))) redirect(`${adminPath(id)}?error=invalid`);
  const result = await replaceBankTask(dayId, taskId);
  if (result === "none") redirect(`${adminPath(id)}?error=no_alternate`);
  if (result === "missing") redirect(`${adminPath(id)}?error=question`);
  revalidatePath(adminPath(id));
  redirect(savedPath(id));
}

export async function reshuffleTasksAction(formData: FormData): Promise<void> {
  await requireManager();
  const id = readInt(formData.get("marathonId"));
  const dayId = readInt(formData.get("dayId"));
  if (!id || !dayId) redirect(`${adminPath(id ?? undefined)}?error=invalid`);
  if (!(await dayOnMarathon(id, dayId))) redirect(`${adminPath(id)}?error=invalid`);
  await reshuffleDayTaskOrder(dayId);
  revalidatePath(adminPath(id));
  redirect(savedPath(id));
}

async function openMarathon(slug: string) {
  const marathon = await getDailyBySlug(slug);
  if (!marathon || marathon.status === "draft" || marathon.status === "archived") return null;
  return marathon;
}

export async function joinMarathonAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const slug = readText(formData.get("slug"), 64);
  const marathon = await openMarathon(slug);
  if (!marathon || marathon.status !== "active") redirect(`/marathon/${slug}?error=closed`);
  await joinParticipant(marathon.id, user.id, utmJsonFromForm(formData));
  await notifyMarathonRegistration({
    marathonId: marathon.id,
    userId: user.id,
    event: "register",
  });
  try {
    await markNotificationsReadByLink(user.id, `/marathon/${slug}`);
  } catch (error) {
    console.error("marathon invite read", error);
  }
  revalidatePath(`/marathon/${slug}/map`);
  revalidatePath("/marathon");
  revalidatePath("/");
  redirect(`/marathon/${slug}/map`);
}

export async function declineMarathonAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const slug = readText(formData.get("slug"), 64);
  const marathon = await openMarathon(slug);
  if (!marathon) redirect("/");
  const participant = await getParticipant(marathon.id, user.id);
  if (participant) redirect(`/marathon/${slug}/map`);
  await declineMarathon(marathon.id, user.id);
  try {
    await markNotificationsReadByLink(user.id, `/marathon/${slug}`);
  } catch (error) {
    console.error("marathon decline read", error);
  }
  revalidatePath("/");
  redirect("/");
}

type RegisterMarathonDeps = {
  loadMarathon?: (
    slug: string,
  ) => Promise<{ id: number; status: string } | null>;
  createUser?: typeof createUser;
  joinParticipant?: typeof joinParticipant;
  sendVerificationMail?: typeof sendRegistrationVerificationMail;
  rememberReturn?: (path: string) => Promise<void>;
  redirectTo?: (path: string) => never;
};

export async function registerMarathonAction(
  formData: FormData,
  deps: RegisterMarathonDeps = {},
): Promise<void> {
  const go = (path: string): never => {
    if (deps.redirectTo) return deps.redirectTo(path);
    return redirect(path);
  };
  const slug = readText(formData.get("slug"), 64);
  const back = `/marathon/${slug}/join`;
  const marathon = deps.loadMarathon
    ? await deps.loadMarathon(slug)
    : await openMarathon(slug);
  if (!marathon || marathon.status !== "active") {
    return go(`${back}?error=closed`);
  }
  const name = readText(formData.get("name"), 100);
  const email = readText(formData.get("email"), 255);
  const password = String(formData.get("password") ?? "");
  const passwordConfirm = String(formData.get("passwordConfirm") ?? "");
  let validated = validateRegistrationInput({
    login: loginCandidatesFromEmail(email)[0] ?? "user00",
    displayName: name,
    email,
    password,
    passwordConfirm,
  });
  if (!validated.ok && validated.code === "invalidLogin") {
    for (const login of loginCandidatesFromEmail(email)) {
      validated = validateRegistrationInput({
        login,
        displayName: name,
        email,
        password,
        passwordConfirm,
      });
      if (validated.ok || validated.code !== "invalidLogin") break;
    }
  }
  if (!validated.ok) return go(`${back}?error=${validated.code}`);
  const value = validated.value;
  const create = deps.createUser ?? createUser;
  let userId = 0;
  for (const login of loginCandidatesFromEmail(value.email)) {
    const attempt = validateRegistrationInput({
      login,
      displayName: value.displayName,
      email: value.email,
      password,
      passwordConfirm: password,
    });
    if (!attempt.ok) continue;
    try {
      const user = await create({
        login: attempt.value.login,
        displayName: attempt.value.displayName,
        email: attempt.value.email,
        password,
        role: "student",
        cabinetScope: "full",
      });
      userId = user.id;
      break;
    } catch (error) {
      if (error instanceof CreateUserError && error.code === "login_taken") continue;
      if (error instanceof CreateUserError && error.code === "email_taken") {
        return go(`${back}?error=emailTaken`);
      }
      console.error("registerMarathonAction", error);
      return go(`${back}?error=server`);
    }
  }
  if (!userId) return go(`${back}?error=server`);
  const join = deps.joinParticipant ?? joinParticipant;
  await join(marathon.id, userId, utmJsonFromForm(formData));
  await notifyMarathonRegistration({
    marathonId: marathon.id,
    userId,
    event: "register",
  });
  let mailed = false;
  try {
    const send = deps.sendVerificationMail ?? sendRegistrationVerificationMail;
    const result = await send({
      userId,
      email: value.email,
      displayName: value.displayName,
    });
    mailed = result.ok;
  } catch (error) {
    console.error("registerMarathonAction mail", error);
  }
  const nextPath = safeInternalPath(`/marathon/${slug}/map`);
  if (deps.rememberReturn) {
    await deps.rememberReturn(nextPath);
  } else {
    const cookieStore = await cookies();
    cookieStore.set(RETURN_COOKIE, nextPath, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24,
    });
  }
  const checkEmail = `/register/check-email?email=${encodeURIComponent(value.email)}&next=${encodeURIComponent(nextPath)}`;
  return go(mailed ? checkEmail : `${checkEmail}&mail=failed`);
}

export async function markMaterialsAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const slug = readText(formData.get("slug"), 64);
  const dayNumber = readInt(formData.get("day"));
  const marathon = await openMarathon(slug);
  const dayPath = `/marathon/${slug}/day/${dayNumber ?? 1}`;
  if (!marathon || !dayNumber) redirect(`/marathon/${slug}/map`);
  const participant = await getParticipant(marathon.id, user.id);
  if (!participant) redirect(`/marathon/${slug}/map`);
  const day = (await listDays(marathon.id)).find((item) => item.dayNumber === dayNumber);
  if (!day) redirect(`/marathon/${slug}/map`);
  const result = await markMaterialsViewed({
    marathon,
    userId: user.id,
    day,
    now: new Date(),
  });
  revalidatePath(dayPath);
  redirect(result === "ok" ? dayPath : `${dayPath}?error=${result}`);
}

export async function submitDayAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const slug = readText(formData.get("slug"), 64);
  const dayNumber = readInt(formData.get("day"));
  const dayPath = `/marathon/${slug}/day/${dayNumber ?? 1}`;
  const marathon = await openMarathon(slug);
  if (!marathon || !dayNumber) redirect(`/marathon/${slug}/map`);
  const participant = await getParticipant(marathon.id, user.id);
  if (!participant) redirect(`/marathon/${slug}/map`);
  const day = (await listDays(marathon.id)).find((item) => item.dayNumber === dayNumber);
  if (!day) redirect(`/marathon/${slug}/map`);
  const progress = await listProgress(marathon.id, user.id);
  const current = progress.find((item) => item.dayNumber === dayNumber);
  const result = await completeParticipantDay({
    marathon,
    userId: user.id,
    day,
    answers: answersFromForm(formData),
    materialsViewed: current?.materialsViewed ?? false,
    progress: progress.map((item) => ({
      dayNumber: item.dayNumber,
      passed: item.passed,
      completedAt: item.completedAt,
    })),
    now: new Date(),
  });
  revalidatePath(dayPath);
  revalidatePath(`/marathon/${slug}/map`);
  revalidatePath(`/marathon/${slug}/final`);
  if (!result.ok) redirect(`${dayPath}?error=${result.code}`);
  const days = await listDays(marathon.id);
  const copy = await loadMarathonCopy(marathon.id);
  const person = {
    userId: user.id,
    email: participant.email,
    displayName: participant.displayName || user.displayName,
    telegramChatId: participant.telegramChatId,
    notifyEmail: participant.notifyEmail,
    notifyBot: participant.notifyBot,
    channel: participant.channel,
    completedDayNumbers: [day.dayNumber],
  };
  if (result.fresh) {
  try {
    await sendCompletedDayFollowUp({
      marathonId: marathon.id,
      slug: marathon.slug,
      title: marathon.title,
      startDate: marathon.startDate,
      unlockHour: marathon.unlockHour,
      daysCount: marathon.daysCount,
      completedDay: day.dayNumber,
      topics: Object.fromEntries(days.map((item) => [item.dayNumber, item.topic])),
      copy,
      person,
    });
  } catch (error) {
    console.error("marathon follow-up", error);
  }
  if (result.rank) {
    try {
      await sendRankNotice({
        marathonId: marathon.id,
        slug: marathon.slug,
        copy,
        person,
        dayNumber: day.dayNumber,
        place: result.rank.place,
        prevPlace: result.rank.prevPlace,
        points: result.rank.points,
      });
    } catch (error) {
      console.error("marathon rank notice", error);
    }
  }
  }
  redirect(dayPath);
}

export async function seeIntroAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const slug = readText(formData.get("slug"), 64);
  const marathon = await openMarathon(slug);
  if (!marathon) redirect("/");
  const participant = await getParticipant(marathon.id, user.id);
  if (!participant) redirect(`/marathon/${slug}/map`);
  await markIntroSeen(marathon.id, user.id, new Date());
  revalidatePath(`/marathon/${slug}/map`);
  redirect(`/marathon/${slug}/map`);
}

export async function setChannelAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const slug = readText(formData.get("slug"), 64);
  const marathon = await openMarathon(slug);
  if (!marathon) redirect("/");
  const participant = await getParticipant(marathon.id, user.id);
  if (!participant) redirect(`/marathon/${slug}`);
  const notifyEmail = formData.get("notifyEmail") === "1";
  const notifyBot = formData.get("notifyTelegram") === "1";
  await setNotifyToggles(marathon.id, user.id, { notifyEmail, notifyBot });
  if (notifyBot) {
    await notifyMarathonRegistration({
      marathonId: marathon.id,
      userId: user.id,
      event: "channel",
      channel: "telegram",
      chatId: participant.telegramChatId,
    });
  }
  revalidatePath(`/marathon/${slug}/map`);
  revalidatePath("/marathon");
  redirect(channelSavedPath({ slug: marathon.slug }));
}

export async function notifyPrefsAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const slug = readText(formData.get("slug"), 64);
  const marathon = await openMarathon(slug);
  if (!marathon) redirect("/");
  const participant = await getParticipant(marathon.id, user.id);
  if (!participant) redirect(`/marathon/${slug}`);
  await setNotifyPrefs(marathon.id, user.id, {
    notifyEmail: formData.get("notifyEmail") === "1",
    notifyBot: formData.get("notifyBot") === "1",
  });
  revalidatePath(`/marathon/${slug}/map`);
  redirect(`/marathon/${slug}/map`);
}

export async function saveCopyAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireManager();
  const id = readInt(formData.get("marathonId"));
  const parsed = parseCopyInput(formData);
  if (!id) return adminFormError([FORM_INVALID]);
  if (!parsed.ok) return adminFormError(parsed.issues);
  try {
    await saveMarathonCopy(id, parsed.value.key, parsed.value.body);
  } catch (error) {
    console.error("saveCopyAction", error);
    return adminFormError([FORM_SERVER]);
  }
  revalidatePath(adminPath(id));
  redirect(savedPath(id));
}

export async function resetCopyAction(formData: FormData): Promise<void> {
  await requireManager();
  const id = readInt(formData.get("marathonId"));
  const key = readText(formData.get("copyKey"), 64);
  if (!id || !isCopyKey(key)) redirect(`${adminPath(id ?? undefined)}?error=invalid`);
  await resetMarathonCopy(id, key);
  revalidatePath(adminPath(id));
  redirect(savedPath(id));
}

export async function updateMaterialAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireManager();
  const id = readInt(formData.get("marathonId"));
  const dayId = readInt(formData.get("dayId"));
  const materialId = readInt(formData.get("materialId"));
  const parsed = parseMaterial(formData);
  if (!id || !dayId || !materialId) return adminFormError([FORM_INVALID]);
  if (!parsed.ok) return adminFormError(parsed.issues);
  try {
    await updateMaterial(dayId, materialId, parsed.value);
  } catch (error) {
    console.error("updateMaterialAction", error);
    return adminFormError([FORM_SERVER]);
  }
  revalidatePath(adminPath(id));
  redirect(savedPath(id));
}

export async function linkBotAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const slug = readText(formData.get("slug"), 64);
  const marathon = await openMarathon(slug);
  if (!marathon) redirect("/");
  const participant = await getParticipant(marathon.id, user.id);
  if (!participant) redirect(`/marathon/${slug}`);
  const url = await createMarathonBotLink(marathon.id, user.id);
  if (!url) redirect(`/marathon/${slug}/map?error=bot_off`);
  redirect(url);
}

export async function convertMarathonAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const slug = readText(formData.get("slug"), 64);
  const marathon = await openMarathon(slug);
  if (!marathon) redirect("/");
  const participant = await getParticipant(marathon.id, user.id);
  if (!participant) redirect(`/marathon/${slug}/map`);
  await markConverted(marathon.id, user.id, new Date());
  revalidatePath(`/admin/marathons/${marathon.id}`);
  redirect(normalizeCtaUrl(marathon.finalCtaUrl) ?? "/");
}

async function openTimelineItem(formData: FormData): Promise<{
  marathonId: number;
  item: TimelineItem;
  snapshot: TimelineSnapshot;
} | null> {
  const marathonId = readInt(formData.get("marathonId"));
  const key = readText(formData.get("key"), 80);
  if (!marathonId || !key) return null;
  const marathon = await getDailyById(marathonId);
  if (!marathon) return null;
  const [days, counts, snapshot] = await Promise.all([
    listDays(marathonId),
    listDayTaskCounts(marathonId),
    loadTimelineSnapshot(marathonId),
  ]);
  const countByDay = new Map(counts.map((row) => [row.dayNumber, row.taskCount]));
  const groups = buildMessageTimeline({
    schedule: {
      startDate: marathon.startDate,
      unlockHour: marathon.unlockHour,
      reminderHour: marathon.reminderHour,
      nudgeFrom: marathon.nudgeFrom,
      nudgeUntil: marathon.nudgeUntil,
      days: days
        .filter((day) => (countByDay.get(day.dayNumber) ?? 0) > 0)
        .map((day) => ({ dayNumber: day.dayNumber, topic: day.topic })),
    },
    linkBase: `/marathon/${marathon.slug}`,
    hold: marathon.status === "archived",
    ...snapshot,
  });
  const item = groups.flatMap((group) => group.items).find((row) => row.key === key);
  if (!item) return null;
  return { marathonId, item, snapshot };
}

function timelineInvalid(marathonId: number): never {
  redirect(`${adminPath(marathonId)}?error=invalid`);
}

export async function postponeTimelineAction(formData: FormData): Promise<void> {
  await requireManager();
  const opened = await openTimelineItem(formData);
  if (!opened) redirect("/admin/marathons");
  if (!opened.item.editable) timelineInvalid(opened.marathonId);
  const when = parseKyivDateTime(
    readText(formData.get("sendDate"), 10),
    readText(formData.get("sendTime"), 5),
  );
  if (!when) timelineInvalid(opened.marathonId);
  const { marathonId, item, snapshot } = opened;
  try {
    if (item.source === "schedule") {
      if (!isTimelineKind(item.kind) || !isTimelineChannel(item.channel)) timelineInvalid(marathonId);
      const current = snapshot.overrides.find(
        (row) => row.dayNumber === item.dayNumber && row.kind === item.kind && row.channel === item.channel,
      );
      await saveSlotOverride({
        marathonId,
        dayNumber: item.dayNumber,
        kind: item.kind,
        channel: item.channel,
        cancelled: false,
        sendAt: when,
        body: current?.body ?? null,
      });
      await syncQueuedJobs({ marathonId, dayNumber: item.dayNumber, kind: item.kind, channel: item.channel, sendAt: when });
    } else if (item.source === "outbox" && item.outboxId) {
      const ok = await rewriteOutbox({ marathonId, outboxId: item.outboxId, notBefore: when });
      if (!ok) timelineInvalid(marathonId);
    } else if (item.source === "job" && item.jobId) {
      const ok = await updateMessageJob({ marathonId, jobId: item.jobId, sendAt: when });
      if (!ok) timelineInvalid(marathonId);
    } else timelineInvalid(marathonId);
  } catch (error) {
    console.error("postponeTimelineAction", error);
    timelineInvalid(marathonId);
  }
  revalidatePath(adminPath(marathonId));
  redirect(savedPath(marathonId));
}

export async function editTimelineAction(formData: FormData): Promise<void> {
  await requireManager();
  const opened = await openTimelineItem(formData);
  if (!opened) redirect("/admin/marathons");
  if (!opened.item.editable) timelineInvalid(opened.marathonId);
  const body = cleanTimelineBody(String(formData.get("body") ?? ""));
  if (!body) timelineInvalid(opened.marathonId);
  const date = readText(formData.get("sendDate"), 10);
  const time = readText(formData.get("sendTime"), 5);
  let sendAt: Date | null | undefined;
  if (date || time) {
    sendAt = parseKyivDateTime(date, time);
    if (!sendAt) timelineInvalid(opened.marathonId);
  }
  const { marathonId, item, snapshot } = opened;
  try {
    if (item.source === "schedule") {
      if (!isTimelineKind(item.kind) || !isTimelineChannel(item.channel)) timelineInvalid(marathonId);
      const current = snapshot.overrides.find(
        (row) => row.dayNumber === item.dayNumber && row.kind === item.kind && row.channel === item.channel,
      );
      const nextAt = sendAt === undefined ? (current?.sendAt ?? null) : sendAt;
      await saveSlotOverride({
        marathonId,
        dayNumber: item.dayNumber,
        kind: item.kind,
        channel: item.channel,
        cancelled: false,
        sendAt: nextAt,
        body,
      });
      await syncQueuedJobs({
        marathonId,
        dayNumber: item.dayNumber,
        kind: item.kind,
        channel: item.channel,
        body,
        ...(nextAt ? { sendAt: nextAt } : {}),
      });
    } else if (item.source === "outbox" && item.outboxId) {
      const ok = await rewriteOutbox({
        marathonId,
        outboxId: item.outboxId,
        text: body,
        ...(sendAt ? { notBefore: sendAt } : {}),
      });
      if (!ok) timelineInvalid(marathonId);
    } else if (item.source === "job" && item.jobId) {
      const ok = await updateMessageJob({
        marathonId,
        jobId: item.jobId,
        body,
        ...(sendAt ? { sendAt } : {}),
      });
      if (!ok) timelineInvalid(marathonId);
    } else timelineInvalid(marathonId);
  } catch (error) {
    console.error("editTimelineAction", error);
    timelineInvalid(marathonId);
  }
  revalidatePath(adminPath(marathonId));
  redirect(savedPath(marathonId));
}

export async function cancelTimelineAction(formData: FormData): Promise<void> {
  await requireManager();
  const opened = await openTimelineItem(formData);
  if (!opened) redirect("/admin/marathons");
  if (!opened.item.editable) timelineInvalid(opened.marathonId);
  const { marathonId, item, snapshot } = opened;
  try {
    if (item.source === "schedule") {
      if (!isTimelineKind(item.kind) || !isTimelineChannel(item.channel)) timelineInvalid(marathonId);
      const current = snapshot.overrides.find(
        (row) => row.dayNumber === item.dayNumber && row.kind === item.kind && row.channel === item.channel,
      );
      await saveSlotOverride({
        marathonId,
        dayNumber: item.dayNumber,
        kind: item.kind,
        channel: item.channel,
        cancelled: true,
        sendAt: current?.sendAt ?? null,
        body: current?.body ?? null,
      });
      await syncQueuedJobs({
        marathonId,
        dayNumber: item.dayNumber,
        kind: item.kind,
        channel: item.channel,
        cancel: true,
      });
    } else if (item.source === "outbox" && item.outboxId) {
      const ok = await rewriteOutbox({ marathonId, outboxId: item.outboxId, cancel: true });
      if (!ok) timelineInvalid(marathonId);
    } else if (item.source === "job" && item.jobId) {
      const ok = await updateMessageJob({ marathonId, jobId: item.jobId, cancel: true });
      if (!ok) timelineInvalid(marathonId);
    } else timelineInvalid(marathonId);
  } catch (error) {
    console.error("cancelTimelineAction", error);
    timelineInvalid(marathonId);
  }
  revalidatePath(adminPath(marathonId));
  redirect(savedPath(marathonId));
}

export async function readMarathonReturnCookie(): Promise<string | null> {
  const cookieStore = await cookies();
  const value = cookieStore.get(RETURN_COOKIE)?.value;
  if (!value) return null;
  const path = safeInternalPath(value, "");
  return path.startsWith("/marathon/") ? path : null;
}
