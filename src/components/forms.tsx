"use client";
import { useState } from "react";
import { useForm, useWatch, type FieldError } from "react-hook-form";
import { z } from "zod";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  LoaderCircle,
  Star,
  UploadCloud,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type FormField = {
  name: string;
  label: string;
  type?:
    | "text"
    | "email"
    | "password"
    | "textarea"
    | "select"
    | "checkbox"
    | "rating"
    | "url";
  placeholder?: string;
  hint?: string;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  options?: { value: string; label: string }[];
  autoComplete?: string;
};
type Values = Record<string, string | number | boolean>;
export function ApiForm({
  endpoint,
  method = "POST",
  fields,
  defaults = {},
  submitLabel = "Save changes",
  redirectTo,
  compact = false,
  successMessage,
}: {
  endpoint: string;
  method?: string;
  fields: FormField[];
  defaults?: Values;
  submitLabel?: string;
  redirectTo?: string;
  compact?: boolean;
  successMessage?: string;
}) {
  const router = useRouter(),
    [message, setMessage] = useState(""),
    [success, setSuccess] = useState(false);
  const schema = z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
    .superRefine((values, ctx) => {
      for (const field of fields) {
        const value = values[field.name];
        if (
          field.type === "rating" &&
          (!Number.isInteger(Number(value)) ||
            Number(value) < 1 ||
            Number(value) > 5)
        )
          ctx.addIssue({
            code: "custom",
            path: [field.name],
            message: "Choose a rating from one to five stars.",
          });
        if (
          field.required &&
          (value === undefined || value === "" || value === false)
        )
          ctx.addIssue({
            code: "custom",
            path: [field.name],
            message: "This field is required.",
          });
        if (
          typeof value === "string" &&
          field.minLength &&
          value.trim().length < field.minLength
        )
          ctx.addIssue({
            code: "custom",
            path: [field.name],
            message: `Use at least ${field.minLength} characters.`,
          });
        if (
          field.type === "email" &&
          typeof value === "string" &&
          value &&
          !z.email().safeParse(value).success
        )
          ctx.addIssue({
            code: "custom",
            path: [field.name],
            message: "Enter a valid email address.",
          });
      }
    });
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    defaultValues: {
      ...Object.fromEntries(
        fields.map((f) => [
          f.name,
          f.type === "checkbox" ? false : f.type === "rating" ? 0 : "",
        ]),
      ),
      ...defaults,
    },
  });
  const watched = useWatch({ control });
  async function onSubmit(values: Values) {
    setMessage("");
    setSuccess(false);
    const parsed = schema.safeParse(values);
    if (!parsed.success) {
      for (const i of parsed.error.issues)
        setError(String(i.path[0]), { message: i.message });
      return;
    }
    try {
      const response = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const result = await response.json();
      if (!response.ok) {
        for (const f of result.fields || [])
          setError(f.path, { message: f.message });
        setMessage(result.error || "Unable to save. Please try again.");
        return;
      }
      setSuccess(true);
      setMessage(successMessage || result.message || "Saved successfully.");
      if (redirectTo) {
        router.push(redirectTo.replace("{id}", result.id || ""));
        router.refresh();
      } else {
        if (method === "POST") reset();
        router.refresh();
      }
    } catch {
      setMessage(
        "Connection interrupted. Your input has been kept. Please try again.",
      );
    }
  }
  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className={cn("api-form", compact && "form-compact")}
    >
      {fields.map((field) => {
        const error = errors[field.name] as FieldError | undefined,
          id = `${endpoint.replace(/[^a-z0-9]/gi, "-")}-${field.name}`;
        return (
          <div
            className={cn(
              "field",
              field.type === "checkbox" && "field-checkbox",
            )}
            key={field.name}
          >
            {field.type !== "checkbox" && (
              <label htmlFor={id}>
                {field.label}
                {field.required && <span aria-hidden="true"> *</span>}
              </label>
            )}
            {field.type === "textarea" ? (
              <textarea
                id={id}
                rows={compact ? 3 : 5}
                placeholder={field.placeholder}
                {...register(field.name)}
                maxLength={field.maxLength || 20000}
                aria-invalid={!!error}
                aria-describedby={`${id}-hint ${id}-error`}
              />
            ) : field.type === "select" ? (
              <select
                id={id}
                {...register(field.name)}
                aria-invalid={!!error}
                aria-describedby={`${id}-hint ${id}-error`}
              >
                <option value="">Choose an option</option>
                {field.options?.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : field.type === "checkbox" ? (
              <label className="check-label">
                <input id={id} type="checkbox" {...register(field.name)} />
                {field.label}
              </label>
            ) : field.type === "rating" ? (
              <div
                className="rating-picker"
                role="group"
                aria-label={field.label}
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={
                      Number(watched[field.name]) >= n ? "selected" : ""
                    }
                    aria-label={`${n} ${n === 1 ? "star" : "stars"}`}
                    aria-pressed={Number(watched[field.name]) === n}
                    onClick={() => setValue(field.name, n)}
                  >
                    <Star
                      size={30}
                      fill={
                        Number(watched[field.name]) >= n
                          ? "currentColor"
                          : "none"
                      }
                    />
                  </button>
                ))}
                <span>
                  {Number(watched[field.name])
                    ? `${watched[field.name]} / 5`
                    : "Select a rating"}
                </span>
              </div>
            ) : (
              <input
                id={id}
                type={field.type || "text"}
                inputMode={field.name === "code" ? "numeric" : undefined}
                placeholder={field.placeholder}
                {...register(field.name)}
                maxLength={field.maxLength || 1000}
                autoComplete={field.autoComplete}
                aria-invalid={!!error}
                aria-describedby={`${id}-hint ${id}-error`}
              />
            )}
            <span id={`${id}-hint`} className="field-hint">
              {field.hint}
            </span>
            <span id={`${id}-error`} className="field-error">
              {error?.message}
            </span>
          </div>
        );
      })}
      {message && (
        <div
          role={success ? "status" : "alert"}
          className={cn(
            "form-message",
            success ? "form-success" : "form-error",
          )}
        >
          {success && <CheckCircle2 size={17} />}
          <span>{message}</span>
        </div>
      )}
      <button className="button" type="submit" disabled={isSubmitting}>
        {isSubmitting ? <LoaderCircle size={17} className="spin" /> : null}
        {isSubmitting ? "Please wait…" : submitLabel}
        {!compact && !isSubmitting && <ArrowRight size={16} />}
      </button>
    </form>
  );
}
export function ActionButton({
  endpoint,
  method = "POST",
  body = {},
  children,
  confirm,
  variant = "secondary",
  redirectTo,
}: {
  endpoint: string;
  method?: string;
  body?: Record<string, unknown>;
  children: React.ReactNode;
  confirm?: string;
  variant?: "secondary" | "danger" | "primary";
  redirectTo?: string;
}) {
  const router = useRouter(),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [success, setSuccess] = useState(false);
  return (
    <div className="action-wrap">
      <button
        type="button"
        disabled={busy}
        className={cn(
          "button small",
          variant === "secondary" && "secondary",
          variant === "danger" && "danger",
        )}
        onClick={async () => {
          if (confirm && !window.confirm(confirm)) return;
          setBusy(true);
          setMessage("");
          try {
            const r = await fetch(endpoint, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
              }),
              data = await r.json();
            setSuccess(r.ok);
            setMessage(data.error || data.message || "Saved.");
            if (r.ok) {
              if (redirectTo) router.push(redirectTo);
              router.refresh();
            }
          } catch {
            setSuccess(false);
            setMessage("Unable to connect. Please try again.");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? <LoaderCircle size={15} className="spin" /> : null}
        {children}
      </button>
      {message && (
        <p
          role={success ? "status" : "alert"}
          className={success ? "field-hint" : "field-error"}
        >
          {message}
        </p>
      )}
    </div>
  );
}
export function EvidenceUpload({ complaintId }: { complaintId: string }) {
  const router = useRouter(),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [success, setSuccess] = useState(false);
  return (
    <form
      className="upload-form"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        setBusy(true);
        setMessage("");
        try {
          const r = await fetch(
              `/api/v1/complaints/${complaintId}/attachments`,
              { method: "POST", body: new FormData(form) },
            ),
            data = await r.json();
          setSuccess(r.ok);
          setMessage(data.error || data.message);
          if (r.ok) {
            form.reset();
            router.refresh();
          }
        } catch {
          setSuccess(false);
          setMessage(
            "Upload interrupted. Your file has not been confirmed as saved. Please retry.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <label htmlFor="evidence-file" className="upload-label">
        <UploadCloud size={25} />
        <strong>Add supporting evidence</strong>
        <span>PDF, PNG, JPEG, or WebP · up to 10 MB each</span>
      </label>
      <input
        id="evidence-file"
        name="file"
        type="file"
        accept=".pdf,.png,.jpg,.jpeg,.webp"
        required
      />
      <button disabled={busy} className="button secondary small">
        {busy ? "Uploading…" : "Upload privately"}
      </button>
      {message && (
        <p
          role={success ? "status" : "alert"}
          className={success ? "field-hint" : "field-error"}
        >
          {message}
        </p>
      )}
    </form>
  );
}
