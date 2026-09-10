import { useId, type ReactNode } from "react";
import { Check, Circle, Clock3, Pause, TriangleAlert } from "lucide-react";
import { Badge } from "./ui/badge";
import { Alert, AlertDescription } from "./ui/alert";
import { Field, FieldLabel } from "./ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import type { Status } from "../../supabase/functions/_shared/domain";

export function StatusBadge({ status }: { status: Status | string }) {
  const Icon =
    status === "Approved"
      ? Check
      : ["Paused", "Cancelled"].includes(status)
        ? Pause
        : status === "Failed"
          ? TriangleAlert
          : ["Processing", "Assessing"].includes(status)
            ? Clock3
            : Circle;
  return (
    <Badge variant="outline">
      <Icon data-icon="inline-start" />
      {status}
    </Badge>
  );
}
export function Notice({ children }: { children: ReactNode }) {
  return (
    <Alert>
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}
export function Control({
  label,
  children,
}: {
  label: string;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {children(id)}
    </Field>
  );
}
export function Choice({
  value,
  onChange,
  options,
  label,
  disabled = false,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  label: string;
  disabled?: boolean;
}) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger aria-label={label}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
export function PageTitle({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      <div className="actions">{children}</div>
    </div>
  );
}
export const date = (s: string) =>
  new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short" }).format(
    new Date(s),
  );
