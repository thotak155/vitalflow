import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "../utils/cn.js";

const badgeVariants = cva(
  "focus:ring-ring inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground border-transparent",
        secondary: "bg-secondary text-secondary-foreground border-transparent",
        outline: "text-foreground",
        muted: "bg-muted text-muted-foreground border-transparent",
        destructive: "bg-destructive text-destructive-foreground border-transparent",
        success: "bg-success text-success-foreground border-transparent",
        warning: "bg-warning text-warning-foreground border-transparent",
        info: "bg-info text-info-foreground border-transparent",
        "clinical-critical": "bg-clinical-critical border-transparent text-white",
        "clinical-warning": "bg-clinical-warning text-foreground border-transparent",
        "clinical-normal": "bg-clinical-normal border-transparent text-white",
        "clinical-info": "bg-clinical-info border-transparent text-white",
      },
      size: {
        sm: "px-2 py-0 text-[11px]",
        md: "px-2.5 py-0.5 text-xs",
        lg: "px-3 py-1 text-sm",
      },
    },
    defaultVariants: { variant: "default", size: "md" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant, size, ...props }, ref) => (
    <span ref={ref} className={cn(badgeVariants({ variant, size }), className)} {...props} />
  ),
);
Badge.displayName = "Badge";

export { badgeVariants };
