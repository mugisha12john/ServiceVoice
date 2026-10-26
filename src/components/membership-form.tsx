"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, LoaderCircle } from "lucide-react";
import { membershipInput } from "@/lib/validation";

type Membership = z.infer<typeof membershipInput>;
type Organization = { id: string; name: string; can_assess: boolean };

export function MembershipForm({
  accounts,
  organizations,
  defaultRole = "REPRESENTATIVE",
  defaultOrganizationId = "",
}: {
  accounts: { value: string; label: string }[];
  organizations: Organization[];
  defaultRole?: Membership["role"];
  defaultOrganizationId?: string;
}) {
  const id = useId(),
    router = useRouter(),
    [message, setMessage] = useState(""),
    [success, setSuccess] = useState(false);
  const {
    register,
    handleSubmit,
    control,
    getValues,
    setValue,
    clearErrors,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Membership>({
    resolver: zodResolver(membershipInput),
    defaultValues: {
      userId: "",
      role: defaultRole,
      organizationId: organizations.some(
        (o) =>
          o.id === defaultOrganizationId &&
          (defaultRole !== "ASSESSOR" || o.can_assess),
      )
        ? defaultOrganizationId
        : "",
    },
  });
  const role = useWatch({ control, name: "role" }),
    assessor = role === "ASSESSOR",
    eligibleOrganizations = organizations.filter(
      (o) => !assessor || o.can_assess,
    ),
    unavailable = !accounts.length || !eligibleOrganizations.length;

  async function submit(values: Membership) {
    setMessage("");
    setSuccess(false);
    try {
      const response = await fetch("/api/v1/admin/memberships", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const result = await response.json();
      if (!response.ok) {
        for (const field of result.fields || []) {
          if (["userId", "organizationId", "role"].includes(field.path))
            setError(field.path as keyof Membership, {
              message: field.message,
            });
        }
        setMessage(
          result.error ||
            "Unable to assign this membership. Your selections have been kept.",
        );
        return;
      }
      setSuccess(true);
      setMessage(result.message || "Membership assigned.");
      router.refresh();
    } catch {
      setMessage(
        "Connection interrupted. Your selections have been kept. Please try again.",
      );
    }
  }

  return (
    <form className="api-form" onSubmit={handleSubmit(submit)}>
      <div className="field">
        <label htmlFor={`${id}-role`}>
          Role <span aria-hidden="true">*</span>
        </label>
        <select
          id={`${id}-role`}
          disabled={isSubmitting}
          {...register("role", {
            onChange(event) {
              const organization = organizations.find(
                (o) => o.id === getValues("organizationId"),
              );
              if (
                event.target.value === "ASSESSOR" &&
                !organization?.can_assess
              )
                setValue("organizationId", "");
              clearErrors("organizationId");
              setMessage("");
            },
          })}
        >
          <option value="REPRESENTATIVE">Organization representative</option>
          <option value="ASSESSOR">Assessor</option>
        </select>
        <p className="field-hint">
          {assessor
            ? "Choose the authority this assessor works for, rather than the company they will inspect."
            : "Choose the organization this account will represent."}
        </p>
      </div>
      <div className="field">
        <label htmlFor={`${id}-account`}>
          Account <span aria-hidden="true">*</span>
        </label>
        <select
          id={`${id}-account`}
          {...register("userId")}
          aria-invalid={!!errors.userId}
          aria-describedby={`${id}-account-error`}
          disabled={isSubmitting}
        >
          <option value="">Choose an account</option>
          {accounts.map((account) => (
            <option value={account.value} key={account.value}>
              {account.label}
            </option>
          ))}
        </select>
        <span id={`${id}-account-error`} className="field-error">
          {errors.userId && "Choose an active account."}
        </span>
        {!accounts.length && (
          <p className="field-hint">
            Create a staff account first, or activate an existing account under
            Account access.
          </p>
        )}
      </div>
      <div className="field">
        <label htmlFor={`${id}-organization`}>
          {assessor ? "Assessing authority" : "Organization"}{" "}
          <span aria-hidden="true">*</span>
        </label>
        <select
          id={`${id}-organization`}
          {...register("organizationId")}
          aria-invalid={!!errors.organizationId}
          aria-describedby={`${id}-organization-error`}
          disabled={isSubmitting || !eligibleOrganizations.length}
        >
          <option value="">
            {assessor
              ? "Choose an assessing authority"
              : "Choose an organization"}
          </option>
          {eligibleOrganizations.map((organization) => (
            <option value={organization.id} key={organization.id}>
              {organization.name}
            </option>
          ))}
        </select>
        <span id={`${id}-organization-error`} className="field-error">
          {errors.organizationId &&
            (assessor
              ? "Choose an active assessing authority."
              : "Choose an active organization.")}
        </span>
      </div>
      {assessor && !eligibleOrganizations.length && (
        <div className="notice" role="status">
          <div>
            <strong>No active assessing authorities yet</strong>
            <p>
              Register the organization that will inspect companies, then return
              here to assign its assessors.
            </p>
            <Link
              className="text-link"
              href="/workspace/admin?tab=organizations&register=authority#register-organization"
            >
              Register an assessing authority
            </Link>
          </div>
        </div>
      )}
      {!assessor && !eligibleOrganizations.length && (
        <Link
          className="text-link"
          href="/workspace/admin?tab=organizations#register-organization"
        >
          Register an organization first
        </Link>
      )}
      {message && (
        <div
          role={success ? "status" : "alert"}
          className={`form-message ${success ? "form-success" : "form-error"}`}
        >
          {success && <CheckCircle2 size={17} />}
          <span>{message}</span>
        </div>
      )}
      <button
        className="button"
        type="submit"
        disabled={isSubmitting || unavailable}
      >
        {isSubmitting && <LoaderCircle size={17} className="spin" />}
        {isSubmitting ? "Please wait…" : "Assign membership"}
        {!isSubmitting && <ArrowRight size={16} />}
      </button>
      {success && assessor && (
        <Link className="text-link" href="/workspace/admin?tab=assignments">
          Next: assign this authority to an organization
        </Link>
      )}
    </form>
  );
}
