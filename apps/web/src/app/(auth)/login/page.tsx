import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  FormField,
  Input,
} from "@vitalflow/ui";
import { AlertCircle, CheckCircle2, HeartPulse } from "@vitalflow/ui/icons";
import { createVitalFlowServerClient } from "@vitalflow/auth/server";
import { redirect } from "next/navigation";

interface LoginSearchParams {
  next?: string;
  sent?: string;
  error?: string;
}

async function sendMagicLink(formData: FormData): Promise<void> {
  "use server";
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const next = safeNext(String(formData.get("next") ?? ""));

  if (!email || !email.includes("@")) {
    redirect(`/login?error=${encodeURIComponent("Enter a valid email")}`);
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const supabase = await createVitalFlowServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${appUrl}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }
  redirect(`/login?sent=1`);
}

function safeNext(raw: string): string {
  return raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<LoginSearchParams>;
}) {
  const params = await searchParams;
  const sent = params.sent === "1";
  const error = params.error;
  const next = safeNext(params.next ?? "/");

  return (
    <Card className="shadow-vf-md">
      <CardHeader className="items-center text-center">
        <div className="flex items-center gap-2 text-primary">
          <HeartPulse className="h-6 w-6" aria-hidden />
          <span className="text-lg font-semibold tracking-tight">VitalFlow</span>
        </div>
        <CardTitle>Sign in</CardTitle>
        <p className="text-sm text-muted-foreground">
          We&apos;ll email you a one-time link &mdash; no password required.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {sent ? (
          <div
            role="status"
            className="flex items-start gap-2 rounded-md border border-success/30 bg-success/5 p-3 text-sm text-foreground"
          >
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
            <span>
              Check your inbox &mdash; the magic link expires in 10 minutes. It&apos;s safe to close this tab.
            </span>
          </div>
        ) : null}
        {error ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-foreground"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
            <span>{error}</span>
          </div>
        ) : null}
        <form action={sendMagicLink} className="space-y-4">
          <input type="hidden" name="next" value={next} />
          <FormField label="Email" htmlFor="email" required>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@example.com"
            />
          </FormField>
          <Button type="submit" className="w-full">
            Send magic link
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
