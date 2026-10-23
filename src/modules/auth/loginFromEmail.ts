/** Internal handle derived from an email. Users never choose or type it. */
export function loginCandidatesFromEmail(email: string): string[] {
  const local = email.split("@")[0] ?? "";
  let base = local.toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (base.length < 3) base = `u${base}`.padEnd(3, "0");
  base = base.slice(0, 24);
  const logins: string[] = [];
  for (let index = 0; index < 30; index += 1) {
    const suffix = index === 0 ? "" : String(index + 1);
    const login = `${base}${suffix}`.slice(0, 50);
    if (login.length >= 3 && !logins.includes(login)) logins.push(login);
  }
  return logins;
}
