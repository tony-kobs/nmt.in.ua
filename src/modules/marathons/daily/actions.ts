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
import { createMarathonBotLink } from "./botLink";
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
import { sendCompletedDayFollowUp } from "./notificationsJob";
import { seedMathMarathon } from "./seed";
import {
  completeParticipantDay,
  deleteDailyMarathon,
  deleteDay,
  deleteMaterial,
  deleteRiddle,
  deleteTask,
  getDailyBySlug,
  getParticipant,
  insertDailyMarathon,
  insertDay,
  insertMaterial,
  insertRiddle,
  insertTask,
  joinParticipant,
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
  setDeliveryChannel,
  setNotifyPrefs,
  updateDailyMarathon,
  updateDay,
  updateMaterial,
} from "./store";
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
  await setDailyStatus(id, status);
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

export async function addRiddleAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireManager();
  const id = readInt(formData.get("marathonId"));
  const parsed = parseRiddle(formData);
  if (!id) return adminFormError([FORM_INVALID]);
  if (!parsed.ok) return adminFormError(parsed.issues);
  try {
    await insertRiddle(id, parsed.value);
  } catch (error) {
    if (isDuplicateKey(error)) return adminFormError([DUPLICATE_ORDER]);
    console.error("addRiddleAction", error);
    return adminFormError([FORM_SERVER]);
  }
  revalidatePath(adminPath(id));
  redirect(savedPath(id));
}

export async function deleteRiddleAction(formData: FormData): Promise<void> {
  await requireManager();
  const id = readInt(formData.get("marathonId"));
  const riddleId = readInt(formData.get("riddleId"));
  if (!id || !riddleId) redirect(`${adminPath(id ?? undefined)}?error=invalid`);
  await deleteRiddle(id, riddleId);
  revalidatePath(adminPath(id));
  redirect(adminPath(id));
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

async function openMarathon(slug: string) {
  const marathon = await getDailyBySlug(slug);
  if (!marathon || marathon.status === "draft") return null;
  return marathon;
}

export async function joinMarathonAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const slug = readText(formData.get("slug"), 64);
  const marathon = await openMarathon(slug);
  if (!marathon || marathon.status !== "active") redirect(`/marathon/${slug}?error=closed`);
  await joinParticipant(marathon.id, user.id, utmJsonFromForm(formData));
  revalidatePath(`/marathon/${slug}/map`);
  redirect(`/marathon/${slug}/map`);
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
        cabinetScope: "marathon",
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
      copy: await loadMarathonCopy(marathon.id),
      person: {
        userId: user.id,
        email: participant.email,
        displayName: participant.displayName || user.displayName,
        telegramChatId: participant.telegramChatId,
        notifyEmail: participant.notifyEmail,
        notifyBot: participant.notifyBot,
        completedDayNumbers: [day.dayNumber],
      },
    });
  } catch (error) {
    console.error("marathon follow-up", error);
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
  const channel = readText(formData.get("channel"), 16);
  const marathon = await openMarathon(slug);
  if (!marathon) redirect("/");
  const participant = await getParticipant(marathon.id, user.id);
  if (!participant) redirect(`/marathon/${slug}`);
  if (channel !== "site" && channel !== "telegram") {
    redirect(`/marathon/${slug}/map?error=invalid`);
  }
  await setDeliveryChannel(
    marathon.id,
    user.id,
    channel,
    Boolean(participant.telegramChatId),
  );
  revalidatePath(`/marathon/${slug}/map`);
  const anchor = channel === "telegram" && !participant.telegramChatId ? "#notify" : "";
  redirect(`/marathon/${slug}/map${anchor}`);
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

export async function readMarathonReturnCookie(): Promise<string | null> {
  const cookieStore = await cookies();
  const value = cookieStore.get(RETURN_COOKIE)?.value;
  if (!value) return null;
  const path = safeInternalPath(value, "");
  return path.startsWith("/marathon/") ? path : null;
}
