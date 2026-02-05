export function mapSupabaseError(error) {
  if (!error) return null;
  const message = error.message || "Unknown error";
  if (/invalid input syntax for type uuid/i.test(message)) {
    return { status: 400, code: "VALIDATION_ERROR", message: "Invalid UUID" };
  }
  if (/violates foreign key constraint/i.test(message)) {
    return { status: 400, code: "INVALID_REFERENCE", message: "Invalid reference" };
  }
  if (/duplicate key value/i.test(message)) {
    return { status: 409, code: "CONFLICT", message: "Duplicate key" };
  }
  return { status: 500, code: "DATABASE_ERROR", message };
}
