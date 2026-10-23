"use client";

import { useState } from "react";
import { AuthModeNav, type AuthMode } from "../AuthModeNav/AuthModeNav";
import { LoginForm } from "../LoginForm/LoginForm";
import { RegisterForm } from "../RegisterForm";
import {
  RegisterRolePicker,
  type RegisterRole,
} from "../RegisterRolePicker/RegisterRolePicker";
import css from "../auth.module.css";

type AuthPanelProps = {
  initialMode: AuthMode;
  nextPath: string;
  initialRole: RegisterRole;
  from?: "diagnostic";
};

function authUrl(mode: AuthMode, role: RegisterRole, nextPath: string, from?: "diagnostic") {
  const params = new URLSearchParams();
  if (nextPath && nextPath !== "/") params.set("next", nextPath);
  if (from) params.set("from", from);
  if (role === "teacher") params.set("role", "teacher");
  const path = mode === "login" ? "/login" : "/register";
  const search = params.toString();
  return search ? `${path}?${search}` : path;
}

/** Login and registration share one card. The tabs only swap the form. */
export function AuthPanel({
  initialMode,
  nextPath,
  initialRole,
  from,
}: AuthPanelProps) {
  const [mode, setMode] = useState(initialMode);
  const [role, setRole] = useState(initialRole);

  function remember(nextMode: AuthMode, nextRole: RegisterRole) {
    window.history.replaceState(null, "", authUrl(nextMode, nextRole, nextPath, from));
  }

  return (
    <div className={css.card}>
      <AuthModeNav
        mode={mode}
        onChange={(next) => {
          setMode(next);
          remember(next, role);
        }}
      />
      {mode === "register" ? (
        <>
          <RegisterRolePicker
            role={role}
            placement="card"
            onSelect={(next) => {
              setRole(next);
              remember(mode, next);
            }}
          />
          <RegisterForm nextPath={nextPath} role={role} from={from} />
        </>
      ) : (
        <LoginForm nextPath={nextPath} />
      )}
    </div>
  );
}
