-- CreateEnum
CREATE TYPE "DepartmentKey" AS ENUM ('global', 'helpdesk', 'it', 'rnd');

-- CreateEnum
CREATE TYPE "RoleKey" AS ENUM ('employee', 'ceo', 'cto');

-- CreateEnum
CREATE TYPE "LanguagePref" AS ENUM ('en', 'he');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('new', 'assigned', 'available', 'taken', 'working_on_it', 'waiting_for_client', 'waiting_for_admin', 'done', 'reviewed', 'cancelled');

-- CreateEnum
CREATE TYPE "JobPriority" AS ENUM ('low', 'normal', 'high', 'urgent');

-- CreateEnum
CREATE TYPE "JobSeverity" AS ENUM ('minor', 'moderate', 'major', 'critical');

-- CreateEnum
CREATE TYPE "JobSource" AS ENUM ('portal_manual', 'email_manual');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('draft', 'sent_to_client', 'waiting_for_payment', 'partially_paid', 'paid', 'cancelled', 'overdue');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('bank_transfer', 'bit', 'cheque', 'cash', 'credit_card', 'other');

-- CreateEnum
CREATE TYPE "PaymentSourceType" AS ENUM ('monthly', 'hourly_bank', 'one_time');

-- CreateEnum
CREATE TYPE "ReceiptDocumentType" AS ENUM ('invoice', 'receipt', 'tax_invoice', 'tax_invoice_receipt', 'credit_note', 'proforma_invoice');

-- CreateEnum
CREATE TYPE "ReceiptDocumentStatus" AS ENUM ('draft', 'finalized', 'cancelled');

-- CreateEnum
CREATE TYPE "AllocationStatus" AS ENUM ('not_required', 'pending', 'issued', 'failed');

-- CreateEnum
CREATE TYPE "ClientStatus" AS ENUM ('active', 'inactive');

-- CreateEnum
CREATE TYPE "MonthlyBillingStatus" AS ENUM ('active', 'paused', 'cancelled', 'none');

-- CreateEnum
CREATE TYPE "HourlyBankStatus" AS ENUM ('active', 'used_up', 'none');

-- CreateEnum
CREATE TYPE "TagScope" AS ENUM ('communication', 'job', 'both');

-- CreateEnum
CREATE TYPE "AttachmentVisibility" AS ENUM ('public_in_org', 'admin_only');

-- CreateEnum
CREATE TYPE "CommunicationChannelKey" AS ENUM ('global', 'helpdesk', 'it', 'rnd');

-- CreateEnum
CREATE TYPE "SavedViewScope" AS ENUM ('jobs', 'clients', 'billing', 'receipts', 'communication', 'statistics');

-- CreateEnum
CREATE TYPE "TimerSource" AS ENUM ('manual_button', 'idle_resume');

-- CreateEnum
CREATE TYPE "EnvironmentNoteSection" AS ENUM ('network', 'servers', 'hosting', 'contacts', 'vendors', 'security', 'backup', 'other');

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('ILS', 'USD', 'EUR');

-- CreateTable
CREATE TABLE "departments" (
    "id" UUID NOT NULL,
    "key" "DepartmentKey" NOT NULL,
    "name_en" TEXT NOT NULL,
    "name_he" TEXT NOT NULL,
    "is_global" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "key" "RoleKey" NOT NULL,
    "name_en" TEXT NOT NULL,
    "name_he" TEXT NOT NULL,
    "is_admin" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "department_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "language_pref" "LanguagePref" NOT NULL DEFAULT 'en',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Jerusalem',
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" UUID NOT NULL,
    "public_number" TEXT NOT NULL,
    "client_id" UUID,
    "department_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "assigned_employee_id" UUID,
    "created_by_user_id" UUID NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'new',
    "priority" "JobPriority" NOT NULL DEFAULT 'normal',
    "severity" "JobSeverity" NOT NULL DEFAULT 'moderate',
    "sla_target_minutes" INTEGER NOT NULL,
    "assigned_timestamp" TIMESTAMP(3),
    "taken_timestamp" TIMESTAMP(3),
    "started_timestamp" TIMESTAMP(3),
    "completed_timestamp" TIMESTAMP(3),
    "reviewed_timestamp" TIMESTAMP(3),
    "cancelled_timestamp" TIMESTAMP(3),
    "first_response_at" TIMESTAMP(3),
    "time_spent_minutes" INTEGER NOT NULL DEFAULT 0,
    "admin_note" TEXT,
    "is_billable" BOOLEAN NOT NULL DEFAULT true,
    "linked_payment_id" UUID,
    "source" "JobSource" NOT NULL DEFAULT 'portal_manual',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_status_events" (
    "id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "from_status" "JobStatus",
    "to_status" "JobStatus" NOT NULL,
    "changed_by_user_id" UUID NOT NULL,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "time_spent_delta_minutes" INTEGER NOT NULL DEFAULT 0,
    "reopened" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "job_status_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_reports" (
    "id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "summary" TEXT NOT NULL,
    "total_time_minutes" INTEGER NOT NULL,
    "billable" BOOLEAN NOT NULL DEFAULT true,
    "submitted_by_user_id" UUID NOT NULL,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approved_by_user_id" UUID,
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "time_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "paused_at" TIMESTAMP(3),
    "resumed_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "accumulated_minutes" INTEGER NOT NULL DEFAULT 0,
    "source" "TimerSource" NOT NULL DEFAULT 'manual_button',
    "idle_warned_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "time_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "label_en" TEXT NOT NULL,
    "label_he" TEXT NOT NULL,
    "scope" "TagScope" NOT NULL DEFAULT 'communication',
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "color_hex" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_tags" (
    "job_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,

    CONSTRAINT "job_tags_pkey" PRIMARY KEY ("job_id","tag_id")
);

-- CreateTable
CREATE TABLE "post_tags" (
    "post_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,

    CONSTRAINT "post_tags_pkey" PRIMARY KEY ("post_id","tag_id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" UUID NOT NULL,
    "company_name" TEXT NOT NULL,
    "contact_person" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "israeli_tax_id" TEXT,
    "status" "ClientStatus" NOT NULL DEFAULT 'active',
    "notes" TEXT,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_accounts" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "default_currency" "Currency" NOT NULL DEFAULT 'ILS',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_environment_notes" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "section" "EnvironmentNoteSection" NOT NULL,
    "content" TEXT NOT NULL,
    "last_edited_by_user_id" UUID NOT NULL,
    "last_edited_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_environment_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monthly_billing_items" (
    "id" UUID NOT NULL,
    "billing_account_id" UUID NOT NULL,
    "service_name" TEXT NOT NULL,
    "price_amount_placeholder" INTEGER,
    "currency" "Currency" NOT NULL DEFAULT 'ILS',
    "billing_cycle" TEXT NOT NULL DEFAULT 'monthly',
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "status" "MonthlyBillingStatus" NOT NULL DEFAULT 'active',
    "last_billed_period" TEXT,
    "next_due_date" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "monthly_billing_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hourly_banks" (
    "id" UUID NOT NULL,
    "billing_account_id" UUID NOT NULL,
    "total_hours_purchased_minutes" INTEGER,
    "price_per_hour_placeholder" INTEGER,
    "total_payment_placeholder" INTEGER,
    "currency" "Currency" NOT NULL DEFAULT 'ILS',
    "purchase_date" DATE NOT NULL,
    "expiry_date" DATE,
    "status" "HourlyBankStatus" NOT NULL DEFAULT 'active',
    "alert_threshold_percent" INTEGER NOT NULL DEFAULT 25,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hourly_banks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hourly_bank_usages" (
    "id" UUID NOT NULL,
    "hourly_bank_id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "minutes_used" INTEGER NOT NULL,
    "used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recorded_by_user_id" UUID NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hourly_bank_usages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "one_time_job_charges" (
    "id" UUID NOT NULL,
    "billing_account_id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "job_name_snapshot" TEXT NOT NULL,
    "price_amount_placeholder" INTEGER,
    "currency" "Currency" NOT NULL DEFAULT 'ILS',
    "payment_id" UUID,
    "date_created" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "date_paid" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "one_time_job_charges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "source_type" "PaymentSourceType" NOT NULL,
    "source_monthly_id" UUID,
    "source_hourly_id" UUID,
    "amount_placeholder" INTEGER,
    "currency" "Currency" NOT NULL DEFAULT 'ILS',
    "issued_date" DATE NOT NULL,
    "due_date" DATE,
    "paid_date" DATE,
    "status" "PaymentStatus" NOT NULL DEFAULT 'draft',
    "method" "PaymentMethod",
    "reference" TEXT,
    "linked_receipt_id" UUID,
    "notes" TEXT,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipt_documents" (
    "id" UUID NOT NULL,
    "type" "ReceiptDocumentType" NOT NULL,
    "client_id" UUID NOT NULL,
    "payment_id" UUID,
    "document_number" INTEGER,
    "document_number_year" INTEGER,
    "status" "ReceiptDocumentStatus" NOT NULL DEFAULT 'draft',
    "issue_date" DATE NOT NULL,
    "payment_date" DATE,
    "description_lines" JSONB NOT NULL DEFAULT '[]',
    "amount_before_vat" INTEGER,
    "vat_rate_basis_points" INTEGER NOT NULL DEFAULT 1800,
    "vat_amount" INTEGER,
    "total_amount" INTEGER,
    "payment_method" "PaymentMethod",
    "reference" TEXT,
    "currency" "Currency" NOT NULL DEFAULT 'ILS',
    "notes" TEXT,
    "language" TEXT NOT NULL DEFAULT 'he',
    "allocation_number" TEXT,
    "allocation_status" "AllocationStatus" NOT NULL DEFAULT 'not_required',
    "allocation_obtained_at" TIMESTAMP(3),
    "finalized_at" TIMESTAMP(3),
    "finalized_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "receipt_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipt_document_sequences" (
    "id" UUID NOT NULL,
    "type" "ReceiptDocumentType" NOT NULL,
    "year" INTEGER NOT NULL,
    "next_number" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "receipt_document_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communication_channels" (
    "id" UUID NOT NULL,
    "key" "CommunicationChannelKey" NOT NULL,
    "department_id" UUID,
    "name_en" TEXT NOT NULL,
    "name_he" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "communication_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communication_posts" (
    "id" UUID NOT NULL,
    "channel_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "related_job_id" UUID,
    "related_client_id" UUID,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "communication_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communication_replies" (
    "id" UUID NOT NULL,
    "post_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "communication_replies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_views" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "scope" "SavedViewScope" NOT NULL,
    "name" TEXT NOT NULL,
    "filter_json" JSONB NOT NULL,
    "is_team" BOOLEAN NOT NULL DEFAULT false,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saved_views_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_user_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "diff_json" JSONB,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" UUID NOT NULL,
    "storage_key" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "uploaded_by_user_id" UUID NOT NULL,
    "visibility" "AttachmentVisibility" NOT NULL DEFAULT 'public_in_org',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_attachments" (
    "job_id" UUID NOT NULL,
    "attachment_id" UUID NOT NULL,

    CONSTRAINT "job_attachments_pkey" PRIMARY KEY ("job_id","attachment_id")
);

-- CreateTable
CREATE TABLE "post_attachments" (
    "post_id" UUID NOT NULL,
    "attachment_id" UUID NOT NULL,

    CONSTRAINT "post_attachments_pkey" PRIMARY KEY ("post_id","attachment_id")
);

-- CreateTable
CREATE TABLE "reply_attachments" (
    "reply_id" UUID NOT NULL,
    "attachment_id" UUID NOT NULL,

    CONSTRAINT "reply_attachments_pkey" PRIMARY KEY ("reply_id","attachment_id")
);

-- CreateTable
CREATE TABLE "feature_flags" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "updated_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "departments_key_key" ON "departments"("key");

-- CreateIndex
CREATE UNIQUE INDEX "roles_key_key" ON "roles"("key");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "jobs_public_number_key" ON "jobs"("public_number");

-- CreateIndex
CREATE INDEX "jobs_department_id_status_idx" ON "jobs"("department_id", "status");

-- CreateIndex
CREATE INDEX "jobs_assigned_employee_id_status_idx" ON "jobs"("assigned_employee_id", "status");

-- CreateIndex
CREATE INDEX "jobs_client_id_idx" ON "jobs"("client_id");

-- CreateIndex
CREATE INDEX "jobs_status_created_at_idx" ON "jobs"("status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "jobs_priority_status_idx" ON "jobs"("priority", "status");

-- CreateIndex
CREATE INDEX "jobs_severity_status_idx" ON "jobs"("severity", "status");

-- CreateIndex
CREATE INDEX "job_status_events_job_id_changed_at_idx" ON "job_status_events"("job_id", "changed_at" DESC);

-- CreateIndex
CREATE INDEX "job_status_events_changed_by_user_id_changed_at_idx" ON "job_status_events"("changed_by_user_id", "changed_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "work_reports_job_id_key" ON "work_reports"("job_id");

-- CreateIndex
CREATE INDEX "time_sessions_job_id_started_at_idx" ON "time_sessions"("job_id", "started_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "tags_key_key" ON "tags"("key");

-- CreateIndex
CREATE INDEX "clients_company_name_idx" ON "clients"("company_name");

-- CreateIndex
CREATE INDEX "clients_status_idx" ON "clients"("status");

-- CreateIndex
CREATE UNIQUE INDEX "billing_accounts_client_id_key" ON "billing_accounts"("client_id");

-- CreateIndex
CREATE INDEX "client_environment_notes_client_id_section_idx" ON "client_environment_notes"("client_id", "section");

-- CreateIndex
CREATE INDEX "monthly_billing_items_billing_account_id_idx" ON "monthly_billing_items"("billing_account_id");

-- CreateIndex
CREATE INDEX "monthly_billing_items_status_idx" ON "monthly_billing_items"("status");

-- CreateIndex
CREATE INDEX "monthly_billing_items_next_due_date_idx" ON "monthly_billing_items"("next_due_date");

-- CreateIndex
CREATE INDEX "hourly_banks_billing_account_id_idx" ON "hourly_banks"("billing_account_id");

-- CreateIndex
CREATE INDEX "hourly_banks_status_idx" ON "hourly_banks"("status");

-- CreateIndex
CREATE INDEX "hourly_bank_usages_hourly_bank_id_used_at_idx" ON "hourly_bank_usages"("hourly_bank_id", "used_at" DESC);

-- CreateIndex
CREATE INDEX "hourly_bank_usages_job_id_idx" ON "hourly_bank_usages"("job_id");

-- CreateIndex
CREATE UNIQUE INDEX "one_time_job_charges_job_id_key" ON "one_time_job_charges"("job_id");

-- CreateIndex
CREATE INDEX "payments_client_id_status_idx" ON "payments"("client_id", "status");

-- CreateIndex
CREATE INDEX "payments_status_due_date_idx" ON "payments"("status", "due_date");

-- CreateIndex
CREATE INDEX "payments_paid_date_idx" ON "payments"("paid_date");

-- CreateIndex
CREATE INDEX "receipt_documents_client_id_idx" ON "receipt_documents"("client_id");

-- CreateIndex
CREATE INDEX "receipt_documents_status_idx" ON "receipt_documents"("status");

-- CreateIndex
CREATE UNIQUE INDEX "receipt_documents_type_document_number_year_document_number_key" ON "receipt_documents"("type", "document_number_year", "document_number");

-- CreateIndex
CREATE UNIQUE INDEX "receipt_document_sequences_type_year_key" ON "receipt_document_sequences"("type", "year");

-- CreateIndex
CREATE UNIQUE INDEX "communication_channels_key_key" ON "communication_channels"("key");

-- CreateIndex
CREATE INDEX "communication_posts_channel_id_created_at_idx" ON "communication_posts"("channel_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "communication_posts_author_id_idx" ON "communication_posts"("author_id");

-- CreateIndex
CREATE INDEX "communication_replies_post_id_created_at_idx" ON "communication_replies"("post_id", "created_at");

-- CreateIndex
CREATE INDEX "saved_views_user_id_scope_idx" ON "saved_views"("user_id", "scope");

-- CreateIndex
CREATE INDEX "saved_views_is_team_scope_idx" ON "saved_views"("is_team", "scope");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_created_at_idx" ON "audit_logs"("entity_type", "entity_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_actor_user_id_created_at_idx" ON "audit_logs"("actor_user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "feature_flags_key_key" ON "feature_flags"("key");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_assigned_employee_id_fkey" FOREIGN KEY ("assigned_employee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_linked_payment_id_fkey" FOREIGN KEY ("linked_payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_status_events" ADD CONSTRAINT "job_status_events_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_status_events" ADD CONSTRAINT "job_status_events_changed_by_user_id_fkey" FOREIGN KEY ("changed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_reports" ADD CONSTRAINT "work_reports_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_reports" ADD CONSTRAINT "work_reports_submitted_by_user_id_fkey" FOREIGN KEY ("submitted_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_reports" ADD CONSTRAINT "work_reports_approved_by_user_id_fkey" FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_sessions" ADD CONSTRAINT "time_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_sessions" ADD CONSTRAINT "time_sessions_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_tags" ADD CONSTRAINT "job_tags_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_tags" ADD CONSTRAINT "job_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_tags" ADD CONSTRAINT "post_tags_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "communication_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_tags" ADD CONSTRAINT "post_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_accounts" ADD CONSTRAINT "billing_accounts_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_environment_notes" ADD CONSTRAINT "client_environment_notes_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_environment_notes" ADD CONSTRAINT "client_environment_notes_last_edited_by_user_id_fkey" FOREIGN KEY ("last_edited_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_billing_items" ADD CONSTRAINT "monthly_billing_items_billing_account_id_fkey" FOREIGN KEY ("billing_account_id") REFERENCES "billing_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hourly_banks" ADD CONSTRAINT "hourly_banks_billing_account_id_fkey" FOREIGN KEY ("billing_account_id") REFERENCES "billing_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hourly_bank_usages" ADD CONSTRAINT "hourly_bank_usages_hourly_bank_id_fkey" FOREIGN KEY ("hourly_bank_id") REFERENCES "hourly_banks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hourly_bank_usages" ADD CONSTRAINT "hourly_bank_usages_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hourly_bank_usages" ADD CONSTRAINT "hourly_bank_usages_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "one_time_job_charges" ADD CONSTRAINT "one_time_job_charges_billing_account_id_fkey" FOREIGN KEY ("billing_account_id") REFERENCES "billing_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "one_time_job_charges" ADD CONSTRAINT "one_time_job_charges_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "one_time_job_charges" ADD CONSTRAINT "one_time_job_charges_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_source_monthly_id_fkey" FOREIGN KEY ("source_monthly_id") REFERENCES "monthly_billing_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_source_hourly_id_fkey" FOREIGN KEY ("source_hourly_id") REFERENCES "hourly_banks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_linked_receipt_id_fkey" FOREIGN KEY ("linked_receipt_id") REFERENCES "receipt_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt_documents" ADD CONSTRAINT "receipt_documents_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt_documents" ADD CONSTRAINT "receipt_documents_finalized_by_user_id_fkey" FOREIGN KEY ("finalized_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_channels" ADD CONSTRAINT "communication_channels_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_posts" ADD CONSTRAINT "communication_posts_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "communication_channels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_posts" ADD CONSTRAINT "communication_posts_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_posts" ADD CONSTRAINT "communication_posts_related_job_id_fkey" FOREIGN KEY ("related_job_id") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_posts" ADD CONSTRAINT "communication_posts_related_client_id_fkey" FOREIGN KEY ("related_client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_replies" ADD CONSTRAINT "communication_replies_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "communication_posts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_replies" ADD CONSTRAINT "communication_replies_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploaded_by_user_id_fkey" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_attachments" ADD CONSTRAINT "job_attachments_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_attachments" ADD CONSTRAINT "job_attachments_attachment_id_fkey" FOREIGN KEY ("attachment_id") REFERENCES "attachments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_attachments" ADD CONSTRAINT "post_attachments_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "communication_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_attachments" ADD CONSTRAINT "post_attachments_attachment_id_fkey" FOREIGN KEY ("attachment_id") REFERENCES "attachments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reply_attachments" ADD CONSTRAINT "reply_attachments_reply_id_fkey" FOREIGN KEY ("reply_id") REFERENCES "communication_replies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reply_attachments" ADD CONSTRAINT "reply_attachments_attachment_id_fkey" FOREIGN KEY ("attachment_id") REFERENCES "attachments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feature_flags" ADD CONSTRAINT "feature_flags_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
