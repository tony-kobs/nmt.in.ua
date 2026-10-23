/** Public ad landing and registration. Map, day, and final stay behind auth. */
export function isPublicMarathonPath(pathname: string): boolean {
  return (
    /^\/marathon\/[^/]+$/.test(pathname) ||
    /^\/marathon\/[^/]+\/join$/.test(pathname)
  );
}

/** Cabinet routes guarded by `marathon:manage`, not by the role string. */
export function isMarathonManagePath(pathname: string): boolean {
  return (
    pathname === "/admin/marathons" || pathname.startsWith("/admin/marathons/")
    || pathname === "/admin/support" || pathname.startsWith("/admin/support/")
  );
}
