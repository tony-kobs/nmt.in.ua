"use client";

import { useActionState } from "react";
import { guardConfirmedSubmit } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { useTranslations } from "next-intl";
import clsx from "clsx";
import { InviteShare } from "@/components/dashboard/InviteShare";
import { GROUP_NAME_MAX } from "@/modules/teacher-students/codes";
import {
  createStudentGroupAction,
  createStudentInviteAction,
  deleteStudentGroupAction,
  renameStudentGroupAction,
  type GroupActionState,
  type InviteActionState,
} from "@/modules/teacher-students/manageActions";
import css from "./StudentGroupsPanel.module.css";

const IDLE_GROUP: GroupActionState = { status: "idle" };
const IDLE_INVITE: InviteActionState = { status: "idle" };

export type StudentGroupView = {
  id: number;
  name: string;
  memberCount: number;
};

export type InviteView = {
  kind: "personal" | "group";
  groupId: number | null;
  code: string;
  url: string;
  expiresAt: string;
};

type StudentGroupsPanelProps = {
  groups: StudentGroupView[];
  invites: InviteView[];
};

function findInvite(
  invites: InviteView[],
  kind: "personal" | "group",
  groupId: number | null,
): InviteView | null {
  return (
    invites.find((invite) =>
      kind === "personal"
        ? invite.kind === "personal"
        : invite.kind === "group" && invite.groupId === groupId,
    ) ?? null
  );
}

function InviteBlock({
  invites,
  kind,
  groupId,
  state,
  action,
  pending,
}: {
  invites: InviteView[];
  kind: "personal" | "group";
  groupId: number | null;
  state: InviteActionState;
  action: (payload: FormData) => void;
  pending: boolean;
}) {
  const t = useTranslations("TeacherStudents");
  const stored = findInvite(invites, kind, groupId);
  const current =
    state.status === "success"
      ? {
          kind,
          groupId,
          code: state.code,
          url: state.url,
          expiresAt: state.expiresAt,
        }
      : stored;

  return (
    <div className={css.inviteBlock}>
      {current ? (
        <InviteShare
          code={current.code}
          url={current.url}
          expiresAt={current.expiresAt}
        />
      ) : (
        <p className={css.muted}>{t("noInvite")}</p>
      )}
      <form action={action}>
        <input type="hidden" name="kind" value={kind} />
        {groupId != null ? (
          <input type="hidden" name="groupId" value={groupId} />
        ) : null}
        <button type="submit" className={css.secondary} disabled={pending}>
          {pending
            ? t("generating")
            : current
              ? t("regenerate")
              : t("generate")}
        </button>
      </form>
      {state.status === "error" ? (
        <p className={clsx(css.alert, css.alertError)} role="alert">
          {t(`errors.${state.code}`)}
        </p>
      ) : null}
    </div>
  );
}

function GroupCard({
  group,
  invites,
}: {
  group: StudentGroupView;
  invites: InviteView[];
}) {
  const t = useTranslations("TeacherStudents");
  const [renameState, renameAction, renamePending] = useActionState(
    renameStudentGroupAction,
    IDLE_GROUP,
  );
  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteStudentGroupAction,
    IDLE_GROUP,
  );
  const [inviteState, inviteAction, invitePending] = useActionState(
    createStudentInviteAction,
    IDLE_INVITE,
  );

  return (
    <li className={css.group}>
      <form action={renameAction} className={css.renameForm}>
        <input type="hidden" name="groupId" value={group.id} />
        <label className={css.field}>
          <span className={css.label}>{t("groupName")}</span>
          <input
            className={css.input}
            name="name"
            required
            maxLength={GROUP_NAME_MAX}
            defaultValue={group.name}
            disabled={renamePending}
          />
        </label>
        <button type="submit" className={css.secondary} disabled={renamePending}>
          {renamePending ? t("renaming") : t("rename")}
        </button>
      </form>
      <p className={css.muted}>{t("members", { count: group.memberCount })}</p>
      {renameState.status === "success" ? (
        <p className={clsx(css.alert, css.alertSuccess)} role="status">
          {t("groupRenamed")}
        </p>
      ) : null}
      {renameState.status === "error" ? (
        <p className={clsx(css.alert, css.alertError)} role="alert">
          {t(`errors.${renameState.code}`)}
        </p>
      ) : null}
      <div>
        <h3 className={css.subTitle}>{t("groupInvite")}</h3>
        <InviteBlock
          invites={invites}
          kind="group"
          groupId={group.id}
          state={inviteState}
          action={inviteAction}
          pending={invitePending}
        />
      </div>
      <form
        action={deleteAction}
        onSubmit={(event) => {
          guardConfirmedSubmit(event, t("deleteGroupConfirm", { name: group.name }));
        }}
      >
        <input type="hidden" name="groupId" value={group.id} />
        <button type="submit" className={css.danger} disabled={deletePending}>
          {deletePending ? t("deletingGroup") : t("deleteGroup")}
        </button>
      </form>
      {deleteState.status === "success" ? (
        <p className={clsx(css.alert, css.alertSuccess)} role="status">
          {t("groupDeleted")}
        </p>
      ) : null}
      {deleteState.status === "error" ? (
        <p className={clsx(css.alert, css.alertError)} role="alert">
          {t(`errors.${deleteState.code}`)}
        </p>
      ) : null}
    </li>
  );
}

export function StudentGroupsPanel({ groups, invites }: StudentGroupsPanelProps) {
  const t = useTranslations("TeacherStudents");
  const [createState, createAction, createPending] = useActionState(
    createStudentGroupAction,
    IDLE_GROUP,
  );
  const [personalState, personalAction, personalPending] = useActionState(
    createStudentInviteAction,
    IDLE_INVITE,
  );

  return (
    <div className={css.layout}>
      <section className={css.panel} aria-labelledby="personal-invite-title">
        <div>
          <h2 id="personal-invite-title" className={css.panelTitle}>
            {t("personalInvite")}
          </h2>
          <p className={css.panelLead}>{t("inviteLead")}</p>
        </div>
        <InviteBlock
          invites={invites}
          kind="personal"
          groupId={null}
          state={personalState}
          action={personalAction}
          pending={personalPending}
        />
      </section>

      <section className={css.panel} aria-labelledby="student-groups-title">
        <div>
          <h2 id="student-groups-title" className={css.panelTitle}>
            {t("groupsTitle")}
          </h2>
          <p className={css.panelLead}>{t("groupsLead")}</p>
        </div>

        <form action={createAction} className={css.createForm}>
          <label className={css.field}>
            <span className={css.label}>{t("groupName")}</span>
            <input
              className={css.input}
              name="name"
              required
              maxLength={GROUP_NAME_MAX}
              placeholder={t("groupNamePlaceholder")}
              disabled={createPending}
            />
          </label>
          <button type="submit" className={css.primary} disabled={createPending}>
            {createPending ? t("creatingGroup") : t("createGroup")}
          </button>
        </form>
        {createState.status === "success" ? (
          <p className={clsx(css.alert, css.alertSuccess)} role="status">
            {t("groupCreated")}
          </p>
        ) : null}
        {createState.status === "error" ? (
          <p className={clsx(css.alert, css.alertError)} role="alert">
            {t(`errors.${createState.code}`)}
          </p>
        ) : null}

        {groups.length === 0 ? (
          <p className={css.muted}>{t("groupEmpty")}</p>
        ) : (
          <ul className={css.list}>
            {groups.map((group) => (
              <GroupCard key={group.id} group={group} invites={invites} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
