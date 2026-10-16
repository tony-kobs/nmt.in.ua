/** Statement splitter and errno policy shared by `npm run migrate` and tests. */

const IGNORABLE_ERRNO = new Set([
  1022, // ER_DUP_KEY
  1050, // ER_TABLE_EXISTS_ERROR
  1060, // ER_DUP_FIELDNAME
  1061, // ER_DUP_KEYNAME
  1062, // ER_DUP_ENTRY (one-time flag inserts)
  1091, // ER_CANT_DROP_FIELD_OR_KEY
  1826, // ER_FK_DUP_NAME
]);

export function isIgnorableMigrationErrno(errno) {
  return IGNORABLE_ERRNO.has(Number(errno));
}

/**
 * Splits a migration file into statements. Line comments (`--`) and block
 * comments are removed. These files do not use stored procedures.
 */
export function splitSqlStatements(source) {
  const withoutBlock = String(source).replace(/\/\*[\s\S]*?\*\//g, "");
  const withoutLine = withoutBlock
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
  return withoutLine
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}
