"use server";

import { revalidatePath } from "next/cache";
import { invalidateCatalogCache } from "@/lib/cache/catalogCache";
import { requireUser } from "@/modules/auth/getCurrentUser";
import { canImportContent } from "@/modules/auth/types";
import {
  createQuizTask,
  deleteQuizTask,
  deleteQuizTasks,
  getQuizTaskById,
  updateQuizTask,
  updateQuizTaskDifficulty,
  updateThemeDifficultyGuide,
} from "./store";
import {
  createThemeLevel,
  deleteThemeLevel,
  moveThemeLevel,
  updateThemeLevel,
} from "./themeLevels";
import {
  createThemeParam,
  deleteThemeParam,
  moveThemeParam,
  updateThemeParam,
} from "./themeParams";
import {
  ADMIN_TASKS_PAGE_SIZE,
  AdminContentError,
  type AdminQuizTask,
} from "./types";
import {
  parseAdminQuizTaskInput,
  parseTaskId,
  parseTaskIds,
  parseTaskParamDrafts,
  parseThemeId,
  parseThemeLevelForm,
  parseThemeLevelUpdate,
  parseThemeParamInput,
  parseThemeParamUpdate,
} from "./validate";

export type SaveQuizTaskActionState =
  | { status: "idle" }
  | { status: "success"; task: AdminQuizTask; mode: "create" | "update" }
  | { status: "error"; code: SaveQuizTaskErrorCode };

export type SaveQuizTaskErrorCode =
  | "invalid_input"
  | "theme_not_found"
  | "not_found"
  | "forbidden"
  | "generic";

export type DeleteQuizTaskActionState =
  | { status: "idle" }
  | { status: "success"; taskId: number }
  | { status: "error"; code: DeleteQuizTaskErrorCode };

export type DeleteQuizTasksActionState =
  | { status: "idle" }
  | { status: "success"; count: number }
  | { status: "error"; code: DeleteQuizTaskErrorCode };

export type UpdateDifficultyResult =
  | { status: "success" }
  | { status: "error"; code: "invalid_input" | "not_found" | "forbidden" | "generic" };

export type DeleteQuizTaskErrorCode =
  | "invalid_input"
  | "not_found"
  | "in_use"
  | "forbidden"
  | "generic";

export type LoadQuizTaskActionState =
  | { status: "idle" }
  | { status: "success"; task: AdminQuizTask }
  | { status: "error"; code: "invalid_input" | "not_found" | "forbidden" | "generic" };

function readFormFields(formData: FormData): Record<string, unknown> {
  return {
    taskText: formData.get("taskText"),
    themeId: formData.get("themeId"),
    answer1: formData.get("answer1"),
    answer2: formData.get("answer2"),
    answer3: formData.get("answer3"),
    answer4: formData.get("answer4"),
    rightAnswerN: formData.get("rightAnswerN"),
    comments: formData.get("comments"),
    difficulty: formData.get("difficulty"),
    taskId: formData.get("taskId"),
  };
}

function mapSaveError(error: AdminContentError): SaveQuizTaskErrorCode {
  switch (error.code) {
    case "invalid_input":
    case "theme_not_found":
    case "not_found":
    case "forbidden":
      return error.code;
    default:
      return "generic";
  }
}

function mapDeleteError(error: AdminContentError): DeleteQuizTaskErrorCode {
  switch (error.code) {
    case "invalid_input":
    case "not_found":
    case "in_use":
    case "forbidden":
      return error.code;
    default:
      return "generic";
  }
}

type BustCaches = {
  invalidateCatalogCache: typeof invalidateCatalogCache;
  revalidatePath: typeof revalidatePath;
};

function bustCaches(deps: BustCaches) {
  deps.invalidateCatalogCache();
  deps.revalidatePath("/");
  deps.revalidatePath("/problems");
  deps.revalidatePath("/tasks");
  deps.revalidatePath("/topic");
  deps.revalidatePath("/assign");
}

type SaveDeps = {
  requireUser: typeof requireUser;
  createQuizTask: typeof createQuizTask;
  updateQuizTask: typeof updateQuizTask;
  revalidatePath: typeof revalidatePath;
  invalidateCatalogCache: typeof invalidateCatalogCache;
};

type DifficultyDeps = {
  requireUser: typeof requireUser;
  updateQuizTaskDifficulty: typeof updateQuizTaskDifficulty;
  revalidatePath: typeof revalidatePath;
  invalidateCatalogCache: typeof invalidateCatalogCache;
};

type GuideDeps = {
  requireUser: typeof requireUser;
  updateThemeDifficultyGuide: typeof updateThemeDifficultyGuide;
  revalidatePath: typeof revalidatePath;
  invalidateCatalogCache: typeof invalidateCatalogCache;
};

type DeleteDeps = {
  requireUser: typeof requireUser;
  deleteQuizTask: typeof deleteQuizTask;
  revalidatePath: typeof revalidatePath;
  invalidateCatalogCache: typeof invalidateCatalogCache;
};

type DeleteManyDeps = {
  requireUser: typeof requireUser;
  deleteQuizTasks: typeof deleteQuizTasks;
  revalidatePath: typeof revalidatePath;
  invalidateCatalogCache: typeof invalidateCatalogCache;
};

type LoadDeps = {
  requireUser: typeof requireUser;
  getQuizTaskById: typeof getQuizTaskById;
};

export async function saveQuizTaskAction(
  _prev: SaveQuizTaskActionState,
  formData: FormData,
  deps: SaveDeps = {
    requireUser,
    createQuizTask,
    updateQuizTask,
    revalidatePath,
    invalidateCatalogCache,
  },
): Promise<SaveQuizTaskActionState> {
  const user = await deps.requireUser();
  if (!canImportContent(user.role)) {
    return { status: "error", code: "forbidden" };
  }

  try {
    const fields = readFormFields(formData);
    const input = {
      ...parseAdminQuizTaskInput(fields),
      paramDrafts: parseTaskParamDrafts(formData),
    };
    const rawTaskId = fields.taskId;
    const hasTaskId =
      rawTaskId != null && String(rawTaskId).trim() !== "";

    const task = hasTaskId
      ? await deps.updateQuizTask(parseTaskId(rawTaskId), input)
      : await deps.createQuizTask(input);

    bustCaches(deps);
    return {
      status: "success",
      task,
      mode: hasTaskId ? "update" : "create",
    };
  } catch (error) {
    if (error instanceof AdminContentError) {
      return { status: "error", code: mapSaveError(error) };
    }
    console.error("saveQuizTaskAction failed", error);
    return { status: "error", code: "generic" };
  }
}

export async function updateQuizTaskDifficultyAction(
  taskId: number,
  difficulty: number,
  deps: DifficultyDeps = {
    requireUser,
    updateQuizTaskDifficulty,
    revalidatePath,
    invalidateCatalogCache,
  },
): Promise<UpdateDifficultyResult> {
  const user = await deps.requireUser();
  if (!canImportContent(user.role)) {
    return { status: "error", code: "forbidden" };
  }

  try {
    await deps.updateQuizTaskDifficulty(taskId, difficulty);
    bustCaches(deps);
    return { status: "success" };
  } catch (error) {
    if (error instanceof AdminContentError) {
      const code = mapSaveError(error);
      return {
        status: "error",
        code: code === "theme_not_found" ? "generic" : code,
      };
    }
    console.error("updateQuizTaskDifficultyAction failed", error);
    return { status: "error", code: "generic" };
  }
}

export async function updateThemeDifficultyGuideAction(
  themeId: number,
  guide: string,
  deps: GuideDeps = {
    requireUser,
    updateThemeDifficultyGuide,
    revalidatePath,
    invalidateCatalogCache,
  },
): Promise<UpdateDifficultyResult> {
  const user = await deps.requireUser();
  if (!canImportContent(user.role)) {
    return { status: "error", code: "forbidden" };
  }

  try {
    await deps.updateThemeDifficultyGuide(themeId, guide);
    bustCaches(deps);
    return { status: "success" };
  } catch (error) {
    if (error instanceof AdminContentError) {
      const code = mapSaveError(error);
      return {
        status: "error",
        code: code === "theme_not_found" ? "generic" : code,
      };
    }
    console.error("updateThemeDifficultyGuideAction failed", error);
    return { status: "error", code: "generic" };
  }
}

export async function deleteQuizTaskAction(
  _prev: DeleteQuizTaskActionState,
  formData: FormData,
  deps: DeleteDeps = {
    requireUser,
    deleteQuizTask,
    revalidatePath,
    invalidateCatalogCache,
  },
): Promise<DeleteQuizTaskActionState> {
  const user = await deps.requireUser();
  if (!canImportContent(user.role)) {
    return { status: "error", code: "forbidden" };
  }

  try {
    const taskId = parseTaskId(formData.get("taskId"));
    await deps.deleteQuizTask(taskId);
    bustCaches(deps);
    return { status: "success", taskId };
  } catch (error) {
    if (error instanceof AdminContentError) {
      return { status: "error", code: mapDeleteError(error) };
    }
    console.error("deleteQuizTaskAction failed", error);
    return { status: "error", code: "generic" };
  }
}

export async function deleteQuizTasksAction(
  _prev: DeleteQuizTasksActionState,
  formData: FormData,
  deps: DeleteManyDeps = {
    requireUser,
    deleteQuizTasks,
    revalidatePath,
    invalidateCatalogCache,
  },
): Promise<DeleteQuizTasksActionState> {
  const user = await deps.requireUser();
  if (!canImportContent(user.role)) {
    return { status: "error", code: "forbidden" };
  }

  try {
    const taskIds = parseTaskIds(
      formData.getAll("taskId"),
      ADMIN_TASKS_PAGE_SIZE,
    );
    const count = await deps.deleteQuizTasks(taskIds);
    bustCaches(deps);
    return { status: "success", count };
  } catch (error) {
    if (error instanceof AdminContentError) {
      return { status: "error", code: mapDeleteError(error) };
    }
    console.error("deleteQuizTasksAction failed", error);
    return { status: "error", code: "generic" };
  }
}

/** Loads a full task for the edit form (keeps list payloads slim). */
export async function loadQuizTaskAction(
  _prev: LoadQuizTaskActionState,
  formData: FormData,
  deps: LoadDeps = {
    requireUser,
    getQuizTaskById,
  },
): Promise<LoadQuizTaskActionState> {
  const user = await deps.requireUser();
  if (!canImportContent(user.role)) {
    return { status: "error", code: "forbidden" };
  }

  try {
    const taskId = parseTaskId(formData.get("taskId"));
    const task = await deps.getQuizTaskById(taskId);
    if (!task) {
      return { status: "error", code: "not_found" };
    }
    return { status: "success", task };
  } catch (error) {
    if (error instanceof AdminContentError) {
      return {
        status: "error",
        code: error.code === "invalid_input" ? "invalid_input" : "generic",
      };
    }
    console.error("loadQuizTaskAction failed", error);
    return { status: "error", code: "generic" };
  }
}

export type ThemeParamActionState =
  | { status: "idle" }
  | { status: "success" }
  | { status: "error"; code: ThemeParamActionCode };

export type ThemeParamActionCode =
  | "invalid_input"
  | "theme_not_found"
  | "not_found"
  | "forbidden"
  | "type_locked"
  | "code_taken"
  | "rules_required"
  | "generic";

function mapParamError(error: AdminContentError): ThemeParamActionCode {
  switch (error.code) {
    case "invalid_input":
    case "theme_not_found":
    case "not_found":
    case "forbidden":
    case "type_locked":
    case "code_taken":
    case "rules_required":
      return error.code;
    default:
      return "generic";
  }
}

function readParamForm(formData: FormData): Record<string, unknown> {
  return {
    themeId: formData.get("themeId"),
    paramId: formData.get("paramId"),
    name: formData.get("name"),
    code: formData.get("code"),
    valueType: formData.get("valueType"),
  };
}

type CreateParamDeps = {
  requireUser: typeof requireUser;
  createThemeParam: typeof createThemeParam;
  revalidatePath: typeof revalidatePath;
  invalidateCatalogCache: typeof invalidateCatalogCache;
};

type UpdateParamDeps = {
  requireUser: typeof requireUser;
  updateThemeParam: typeof updateThemeParam;
  revalidatePath: typeof revalidatePath;
  invalidateCatalogCache: typeof invalidateCatalogCache;
};

type DeleteParamDeps = {
  requireUser: typeof requireUser;
  deleteThemeParam: typeof deleteThemeParam;
  revalidatePath: typeof revalidatePath;
  invalidateCatalogCache: typeof invalidateCatalogCache;
};

type MoveParamDeps = {
  requireUser: typeof requireUser;
  moveThemeParam: typeof moveThemeParam;
  revalidatePath: typeof revalidatePath;
  invalidateCatalogCache: typeof invalidateCatalogCache;
};

export async function createThemeParamAction(
  _prev: ThemeParamActionState,
  formData: FormData,
  deps: CreateParamDeps = {
    requireUser,
    createThemeParam,
    revalidatePath,
    invalidateCatalogCache,
  },
): Promise<ThemeParamActionState> {
  const user = await deps.requireUser();
  if (!canImportContent(user.role)) {
    return { status: "error", code: "forbidden" };
  }

  try {
    await deps.createThemeParam(parseThemeParamInput(readParamForm(formData)));
    bustCaches(deps);
    return { status: "success" };
  } catch (error) {
    if (error instanceof AdminContentError) {
      return { status: "error", code: mapParamError(error) };
    }
    console.error("createThemeParamAction failed", error);
    return { status: "error", code: "generic" };
  }
}

export async function updateThemeParamAction(
  _prev: ThemeParamActionState,
  formData: FormData,
  deps: UpdateParamDeps = {
    requireUser,
    updateThemeParam,
    revalidatePath,
    invalidateCatalogCache,
  },
): Promise<ThemeParamActionState> {
  const user = await deps.requireUser();
  if (!canImportContent(user.role)) {
    return { status: "error", code: "forbidden" };
  }

  try {
    await deps.updateThemeParam(parseThemeParamUpdate(readParamForm(formData)));
    bustCaches(deps);
    return { status: "success" };
  } catch (error) {
    if (error instanceof AdminContentError) {
      return { status: "error", code: mapParamError(error) };
    }
    console.error("updateThemeParamAction failed", error);
    return { status: "error", code: "generic" };
  }
}

export async function deleteThemeParamAction(
  _prev: ThemeParamActionState,
  formData: FormData,
  deps: DeleteParamDeps = {
    requireUser,
    deleteThemeParam,
    revalidatePath,
    invalidateCatalogCache,
  },
): Promise<ThemeParamActionState> {
  const user = await deps.requireUser();
  if (!canImportContent(user.role)) {
    return { status: "error", code: "forbidden" };
  }

  try {
    const themeId = parseThemeId(formData.get("themeId"));
    const paramId = parseTaskId(formData.get("paramId"));
    await deps.deleteThemeParam(themeId, paramId);
    bustCaches(deps);
    return { status: "success" };
  } catch (error) {
    if (error instanceof AdminContentError) {
      return { status: "error", code: mapParamError(error) };
    }
    console.error("deleteThemeParamAction failed", error);
    return { status: "error", code: "generic" };
  }
}

export async function moveThemeParamAction(
  themeId: number,
  paramId: number,
  direction: "up" | "down",
  deps: MoveParamDeps = {
    requireUser,
    moveThemeParam,
    revalidatePath,
    invalidateCatalogCache,
  },
): Promise<ThemeParamActionState> {
  const user = await deps.requireUser();
  if (!canImportContent(user.role)) {
    return { status: "error", code: "forbidden" };
  }

  try {
    await deps.moveThemeParam(parseThemeId(themeId), parseTaskId(paramId), direction);
    bustCaches(deps);
    return { status: "success" };
  } catch (error) {
    if (error instanceof AdminContentError) {
      return { status: "error", code: mapParamError(error) };
    }
    console.error("moveThemeParamAction failed", error);
    return { status: "error", code: "generic" };
  }
}

export type ThemeLevelActionState = ThemeParamActionState;

type CreateLevelDeps = {
  requireUser: typeof requireUser;
  createThemeLevel: typeof createThemeLevel;
  revalidatePath: typeof revalidatePath;
  invalidateCatalogCache: typeof invalidateCatalogCache;
};

type UpdateLevelDeps = {
  requireUser: typeof requireUser;
  updateThemeLevel: typeof updateThemeLevel;
  revalidatePath: typeof revalidatePath;
  invalidateCatalogCache: typeof invalidateCatalogCache;
};

type DeleteLevelDeps = {
  requireUser: typeof requireUser;
  deleteThemeLevel: typeof deleteThemeLevel;
  revalidatePath: typeof revalidatePath;
  invalidateCatalogCache: typeof invalidateCatalogCache;
};

type MoveLevelDeps = {
  requireUser: typeof requireUser;
  moveThemeLevel: typeof moveThemeLevel;
  revalidatePath: typeof revalidatePath;
  invalidateCatalogCache: typeof invalidateCatalogCache;
};

export async function createThemeLevelAction(
  _prev: ThemeLevelActionState,
  formData: FormData,
  deps: CreateLevelDeps = {
    requireUser,
    createThemeLevel,
    revalidatePath,
    invalidateCatalogCache,
  },
): Promise<ThemeLevelActionState> {
  const user = await deps.requireUser();
  if (!canImportContent(user.role)) {
    return { status: "error", code: "forbidden" };
  }
  try {
    await deps.createThemeLevel(parseThemeLevelForm(formData));
    bustCaches(deps);
    return { status: "success" };
  } catch (error) {
    if (error instanceof AdminContentError) {
      return { status: "error", code: mapParamError(error) };
    }
    console.error("createThemeLevelAction failed", error);
    return { status: "error", code: "generic" };
  }
}

export async function updateThemeLevelAction(
  _prev: ThemeLevelActionState,
  formData: FormData,
  deps: UpdateLevelDeps = {
    requireUser,
    updateThemeLevel,
    revalidatePath,
    invalidateCatalogCache,
  },
): Promise<ThemeLevelActionState> {
  const user = await deps.requireUser();
  if (!canImportContent(user.role)) {
    return { status: "error", code: "forbidden" };
  }
  try {
    await deps.updateThemeLevel(parseThemeLevelUpdate(formData));
    bustCaches(deps);
    return { status: "success" };
  } catch (error) {
    if (error instanceof AdminContentError) {
      return { status: "error", code: mapParamError(error) };
    }
    console.error("updateThemeLevelAction failed", error);
    return { status: "error", code: "generic" };
  }
}

export async function deleteThemeLevelAction(
  _prev: ThemeLevelActionState,
  formData: FormData,
  deps: DeleteLevelDeps = {
    requireUser,
    deleteThemeLevel,
    revalidatePath,
    invalidateCatalogCache,
  },
): Promise<ThemeLevelActionState> {
  const user = await deps.requireUser();
  if (!canImportContent(user.role)) {
    return { status: "error", code: "forbidden" };
  }
  try {
    await deps.deleteThemeLevel(
      parseThemeId(formData.get("themeId")),
      parseTaskId(formData.get("levelId")),
    );
    bustCaches(deps);
    return { status: "success" };
  } catch (error) {
    if (error instanceof AdminContentError) {
      return { status: "error", code: mapParamError(error) };
    }
    console.error("deleteThemeLevelAction failed", error);
    return { status: "error", code: "generic" };
  }
}

export async function moveThemeLevelAction(
  themeId: number,
  levelId: number,
  direction: "up" | "down",
  deps: MoveLevelDeps = {
    requireUser,
    moveThemeLevel,
    revalidatePath,
    invalidateCatalogCache,
  },
): Promise<ThemeLevelActionState> {
  const user = await deps.requireUser();
  if (!canImportContent(user.role)) {
    return { status: "error", code: "forbidden" };
  }
  try {
    await deps.moveThemeLevel(parseThemeId(themeId), parseTaskId(levelId), direction);
    bustCaches(deps);
    return { status: "success" };
  } catch (error) {
    if (error instanceof AdminContentError) {
      return { status: "error", code: mapParamError(error) };
    }
    console.error("moveThemeLevelAction failed", error);
    return { status: "error", code: "generic" };
  }
}
