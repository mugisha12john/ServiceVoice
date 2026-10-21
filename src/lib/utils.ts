import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
export const date = (value: Date | string | null | undefined) =>
  value
    ? new Intl.DateTimeFormat("en-GB", {
        dateStyle: "medium",
        timeZone: "Africa/Kigali",
      }).format(new Date(value))
    : "—";
export const datetime = (value: Date | string) =>
  new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Kigali",
  }).format(new Date(value)) + " CAT";
export const reference = (value: string | number) =>
  `CMP-${String(value).padStart(6, "0")}`;
