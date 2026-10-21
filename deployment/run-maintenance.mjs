// Scheduler entry point: secrets stay in environment variables, not arguments.
try {
  if (!process.env.APP_URL || (process.env.CRON_SECRET?.length ?? 0) < 32)
    throw new Error(
      "Configure APP_URL and a CRON_SECRET of at least 32 characters.",
    );
  const endpoint = new URL("/api/v1/jobs/maintenance", process.env.APP_URL);
  if (
    endpoint.username ||
    endpoint.password ||
    (endpoint.protocol !== "https:" &&
      !(
        endpoint.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(endpoint.hostname)
      ))
  )
    throw new Error("APP_URL must be the canonical HTTPS application origin.");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
    redirect: "error",
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok)
    throw new Error(
      `Maintenance returned HTTP ${response.status}. Check the application worker configuration.`,
    );
  // Do not print arbitrary response bodies or provider errors.
  console.log(
    "Maintenance request completed. Inspect the protected worker and outbox for delivery status.",
  );
} catch {
  console.error(
    "Maintenance failed. Check APP_URL, CRON_SECRET, network access, and the application worker. Sensitive diagnostic details withheld.",
  );
  process.exitCode = 1;
}
