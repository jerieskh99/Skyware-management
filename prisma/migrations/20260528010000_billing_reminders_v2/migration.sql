-- =============================================================================
-- Billing reminders V2 (Phase 4 Wave 2) - DB layer only.
--
-- Adds the schema for: late-payment reminders, hourly-bank low-balance
-- alerts, manual client contact, an admin-editable email template store, and
-- a full email audit log. NO application logic ships here (the reminder cron,
-- the email transport, and the admin UI arrive in later Wave 2 sub-tasks).
--
-- Consolidated, forward-only migration. Enum-value additions ride
-- `ADD VALUE IF NOT EXISTS` so a partial prior apply re-runs cleanly. The
-- Payment lateness CHECK constraint is appended via a guarded DO block
-- (Prisma cannot express CHECK constraints in the schema datamodel), matching
-- the house style established in 20260528000100_knowledge_v1_invariants.
--
-- New enums (5):  LatenessUnit, PaymentReminderStatus, EmailTemplateKind,
--                 EmailKind, EmailDeliveryStatus.
-- New models (4): payment_reminders, email_templates, email_logs,
--                 hourly_bank_alert_logs.
-- Altered (1):    payments (+4 columns), NotificationKind (+3 values).
-- =============================================================================

-- CreateEnum
CREATE TYPE "LatenessUnit" AS ENUM ('days', 'weeks');

-- CreateEnum
CREATE TYPE "PaymentReminderStatus" AS ENUM ('scheduled', 'admin_notified', 'approved', 'delayed', 'cancelled', 'sent', 'send_failed', 'bounced');

-- CreateEnum
CREATE TYPE "EmailTemplateKind" AS ENUM ('payment_reminder_admin', 'payment_reminder_client', 'hourly_bank_low_admin', 'hourly_bank_low_client', 'manual_contact');

-- CreateEnum
CREATE TYPE "EmailKind" AS ENUM ('payment_reminder_admin', 'payment_reminder_client', 'hourly_bank_low_admin', 'hourly_bank_low_client', 'manual_contact', 'test');

-- CreateEnum
CREATE TYPE "EmailDeliveryStatus" AS ENUM ('queued', 'sent', 'failed', 'bounced');

-- AlterEnum
-- Adds the three Wave-2 NotificationKind values. Each uses
-- `ADD VALUE IF NOT EXISTS` so a re-run after a partial apply is a no-op.
ALTER TYPE "NotificationKind" ADD VALUE IF NOT EXISTS 'payment_reminder_pending_review';
ALTER TYPE "NotificationKind" ADD VALUE IF NOT EXISTS 'hourly_bank_low';
ALTER TYPE "NotificationKind" ADD VALUE IF NOT EXISTS 'manual_contact_sent';

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "auto_send_after_minutes" INTEGER,
ADD COLUMN     "lateness_amount" INTEGER,
ADD COLUMN     "lateness_notify_admin_first" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "lateness_unit" "LatenessUnit";

-- CreateTable
CREATE TABLE "payment_reminders" (
    "id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "status" "PaymentReminderStatus" NOT NULL DEFAULT 'scheduled',
    "scheduled_for" TIMESTAMP(3) NOT NULL,
    "admin_notified_at" TIMESTAMP(3),
    "decided_at" TIMESTAMP(3),
    "decided_by_user_id" UUID,
    "decision_comment" TEXT,
    "sent_at" TIMESTAMP(3),
    "provider_message_id" TEXT,
    "failure_reason" TEXT,
    "sent_snapshot" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_templates" (
    "id" UUID NOT NULL,
    "kind" "EmailTemplateKind" NOT NULL,
    "name" TEXT NOT NULL,
    "subject_en" TEXT NOT NULL,
    "body_en" TEXT NOT NULL,
    "subject_he" TEXT NOT NULL,
    "body_he" TEXT NOT NULL,
    "updated_by_user_id" UUID,
    "variable_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_logs" (
    "id" UUID NOT NULL,
    "kind" "EmailKind" NOT NULL,
    "test_mode" BOOLEAN NOT NULL DEFAULT true,
    "to_email" TEXT NOT NULL,
    "cc" JSONB,
    "bcc" JSONB,
    "from_email" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body_html" TEXT NOT NULL,
    "body_text" TEXT,
    "language" TEXT NOT NULL DEFAULT 'en',
    "payment_id" UUID,
    "payment_reminder_id" UUID,
    "hourly_bank_id" UUID,
    "client_id" UUID,
    "triggered_by_user_id" UUID,
    "provider_message_id" TEXT,
    "status" "EmailDeliveryStatus" NOT NULL DEFAULT 'queued',
    "failure_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hourly_bank_alert_logs" (
    "id" UUID NOT NULL,
    "hourly_bank_id" UUID NOT NULL,
    "consumed_minutes" INTEGER NOT NULL,
    "total_minutes" INTEGER NOT NULL,
    "threshold_percent" INTEGER NOT NULL DEFAULT 90,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hourly_bank_alert_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payment_reminders_payment_id_created_at_idx" ON "payment_reminders"("payment_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "payment_reminders_status_scheduled_for_idx" ON "payment_reminders"("status", "scheduled_for");

-- CreateIndex
CREATE UNIQUE INDEX "email_templates_kind_key" ON "email_templates"("kind");

-- CreateIndex
CREATE INDEX "email_logs_client_id_created_at_idx" ON "email_logs"("client_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "email_logs_payment_id_created_at_idx" ON "email_logs"("payment_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "email_logs_kind_status_idx" ON "email_logs"("kind", "status");

-- CreateIndex
CREATE INDEX "hourly_bank_alert_logs_hourly_bank_id_created_at_idx" ON "hourly_bank_alert_logs"("hourly_bank_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "payment_reminders" ADD CONSTRAINT "payment_reminders_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_reminders" ADD CONSTRAINT "payment_reminders_decided_by_user_id_fkey" FOREIGN KEY ("decided_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_payment_reminder_id_fkey" FOREIGN KEY ("payment_reminder_id") REFERENCES "payment_reminders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_hourly_bank_id_fkey" FOREIGN KEY ("hourly_bank_id") REFERENCES "hourly_banks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_triggered_by_user_id_fkey" FOREIGN KEY ("triggered_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hourly_bank_alert_logs" ADD CONSTRAINT "hourly_bank_alert_logs_hourly_bank_id_fkey" FOREIGN KEY ("hourly_bank_id") REFERENCES "hourly_banks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- =============================================================================
-- Raw-SQL invariants Prisma cannot express in the schema datamodel.
-- =============================================================================

-- CHECK: Payment lateness rule consistency. Either both lateness columns are
-- null (no rule), or `lateness_amount` is a positive count AND `lateness_unit`
-- is set. Guarded with a DO block that swallows `duplicate_object` so the
-- migration is idempotent.
DO $$
BEGIN
  ALTER TABLE "payments"
    ADD CONSTRAINT "payments_lateness_consistency_chk"
    CHECK (
      ("lateness_amount" IS NULL AND "lateness_unit" IS NULL)
      OR ("lateness_amount" > 0 AND "lateness_unit" IS NOT NULL)
    );
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END
$$;
