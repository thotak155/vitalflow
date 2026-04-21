import * as React from "react";

import { cn } from "../utils/cn.js";
import { Label } from "./label.js";

/**
 * FormField is a lightweight wrapper that pairs a Label, control, optional
 * helper/error text, and a stable id — so every input in the app renders
 * with consistent spacing, a11y wiring, and error presentation.
 *
 * @example
 *   <FormField label="Email" htmlFor="email" error={errors.email}>
 *     <Input id="email" invalid={!!errors.email} />
 *   </FormField>
 */
export interface FormFieldProps extends React.HTMLAttributes<HTMLDivElement> {
  label?: React.ReactNode;
  htmlFor?: string;
  required?: boolean;
  helper?: React.ReactNode;
  error?: React.ReactNode;
}

export const FormField = React.forwardRef<HTMLDivElement, FormFieldProps>(
  ({ className, label, htmlFor, required, helper, error, children, ...props }, ref) => {
    const helperId = htmlFor ? `${htmlFor}-helper` : undefined;
    const errorId = htmlFor ? `${htmlFor}-error` : undefined;
    return (
      <div ref={ref} className={cn("space-y-1.5", className)} {...props}>
        {label ? (
          <Label htmlFor={htmlFor}>
            {label}
            {required ? (
              <span aria-hidden className="text-destructive ml-0.5">
                *
              </span>
            ) : null}
          </Label>
        ) : null}
        {children}
        {error ? (
          <p id={errorId} role="alert" className="text-destructive text-xs">
            {error}
          </p>
        ) : helper ? (
          <p id={helperId} className="text-muted-foreground text-xs">
            {helper}
          </p>
        ) : null}
      </div>
    );
  },
);
FormField.displayName = "FormField";
