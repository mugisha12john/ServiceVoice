export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function publicError(error: unknown): {
  status: number;
  message: string;
} {
  if (error instanceof AppError)
    return { status: error.status, message: error.message };
  const e = error as { code?: string; message?: string; cause?: unknown };
  if (e.cause) return publicError(e.cause);
  if (e.code === "23505")
    return {
      status: 409,
      message: "This email, username, or record is already in use.",
    };
  if (e.code === "23503")
    return {
      status: 400,
      message:
        "A related record is unavailable. Refresh the page and choose an existing record.",
    };
  if (e.code === "42P01")
    return {
      status: 503,
      message:
        "A required application migration has not been installed. Please contact the system administrator.",
    };
  const known = [
    [
      "Maximum two active reviews",
      "You already have two reviews for this service in the last three calendar months. Edit an existing review, delete one to free a slot, or wait until its period ends.",
    ],
    [
      "active email-verified consumer",
      "Verify your email before submitting a review or complaint.",
    ],
    [
      "must have an active assessor",
      "This organization does not currently have an active assessing authority. Please contact the administrator before submitting a complaint.",
    ],
    [
      "Complaint must exist and be pending",
      "This complaint has already been resolved and cannot receive new responses.",
    ],
  ];
  for (const [needle, message] of known)
    if (e.message?.includes(needle)) return { status: 409, message };
  return {
    status: 500,
    message:
      "We could not complete this request. Your input has been kept. Please try again.",
  };
}
