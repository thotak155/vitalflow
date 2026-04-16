import { getResend } from "@vitalflow/integrations/resend";
import { getTwilio } from "@vitalflow/integrations/twilio";
import { logger } from "@vitalflow/shared-utils/logger";

export type Channel = "email" | "sms" | "push";

export interface Notification {
  to: string;
  channel: Channel;
  subject?: string;
  body: string;
  templateId?: string;
}

export async function send(n: Notification): Promise<void> {
  switch (n.channel) {
    case "email": {
      const resend = getResend();
      await resend.emails.send({
        from: "VitalFlow <noreply@vitalflow.health>",
        to: n.to,
        subject: n.subject ?? "VitalFlow notification",
        text: n.body,
      });
      return;
    }
    case "sms": {
      const twilio = getTwilio();
      await twilio.messages.create({
        to: n.to,
        from: process.env.TWILIO_FROM_NUMBER ?? "",
        body: n.body,
      });
      return;
    }
    case "push": {
      logger.warn({ to: n.to }, "push channel not yet implemented");
      return;
    }
  }
}
