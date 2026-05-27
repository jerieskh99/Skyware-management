-- CreateEnum
CREATE TYPE "NotificationKind" AS ENUM ('sla_breached', 'job_assigned', 'mention');

-- CreateEnum
CREATE TYPE "SavedViewVisibility" AS ENUM ('personal', 'team');

-- CreateEnum
CREATE TYPE "CountryCode" AS ENUM ('IL', '_other');

-- CreateEnum
CREATE TYPE "RecurringCadence" AS ENUM ('daily', 'weekly', 'biweekly', 'monthly', 'quarterly');

-- CreateEnum
CREATE TYPE "RecurringTemplateStatus" AS ENUM ('active', 'paused');

-- CreateEnum
CREATE TYPE "KnowledgeArticleStatus" AS ENUM ('draft', 'published', 'archived');

-- CreateEnum
CREATE TYPE "KnowledgeArticleVisibility" AS ENUM ('internal', 'admin_only');

-- AlterTable
ALTER TABLE "jobs" ADD COLUMN     "recurring_template_id" UUID;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "amount_before_vat" INTEGER,
ADD COLUMN     "currency_exchange_rate" DECIMAL(18,6),
ADD COLUMN     "total_amount" INTEGER,
ADD COLUMN     "vat_amount" INTEGER,
ADD COLUMN     "vat_rate_basis_points" INTEGER;

-- AlterTable
ALTER TABLE "receipt_documents" ADD COLUMN     "credited_receipt_id" UUID,
ADD COLUMN     "exchange_rate" DECIMAL(18,6);

-- AlterTable
ALTER TABLE "saved_views" ADD COLUMN     "is_default" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "visibility" "SavedViewVisibility" NOT NULL DEFAULT 'personal';

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" "NotificationKind" NOT NULL,
    "payload" JSONB NOT NULL,
    "link" TEXT,
    "seen_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sla_defaults" (
    "id" UUID NOT NULL,
    "priority" "JobPriority" NOT NULL,
    "target_minutes" INTEGER NOT NULL,
    "updated_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sla_defaults_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_settings" (
    "id" UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
    "legal_name_en" TEXT,
    "legal_name_he" TEXT,
    "company_number" TEXT,
    "vat_number" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Jerusalem',
    "default_vat_basis_points" INTEGER NOT NULL DEFAULT 1800,
    "default_currency" "Currency" NOT NULL DEFAULT 'ILS',
    "email" TEXT,
    "phone" TEXT,
    "address_line1" TEXT,
    "address_line2" TEXT,
    "city" TEXT,
    "postal_code" TEXT,
    "country" "CountryCode" NOT NULL DEFAULT 'IL',
    "website_url" TEXT,
    "receipt_footer_en" TEXT,
    "receipt_footer_he" TEXT,
    "updated_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recurring_job_templates" (
    "id" UUID NOT NULL,
    "name" TEXT,
    "title_template" TEXT NOT NULL,
    "description" TEXT,
    "department_id" UUID NOT NULL,
    "client_id" UUID,
    "priority" "JobPriority" NOT NULL DEFAULT 'normal',
    "severity" "JobSeverity" NOT NULL DEFAULT 'moderate',
    "default_assignee_id" UUID,
    "cadence" "RecurringCadence" NOT NULL,
    "anchor" JSONB NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Jerusalem',
    "next_run_at" TIMESTAMP(3) NOT NULL,
    "last_generated_at" TIMESTAMP(3),
    "generated_count" INTEGER NOT NULL DEFAULT 0,
    "status" "RecurringTemplateStatus" NOT NULL DEFAULT 'active',
    "created_by_user_id" UUID NOT NULL,
    "updated_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recurring_job_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_articles" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "summary" TEXT,
    "status" "KnowledgeArticleStatus" NOT NULL DEFAULT 'draft',
    "visibility" "KnowledgeArticleVisibility" NOT NULL DEFAULT 'internal',
    "author_user_id" UUID NOT NULL,
    "last_edited_by_user_id" UUID,
    "published_at" TIMESTAMP(3),
    "related_client_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_article_tags" (
    "article_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,

    CONSTRAINT "knowledge_article_tags_pkey" PRIMARY KEY ("article_id","tag_id")
);

-- CreateTable
CREATE TABLE "client_health_snapshots" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "open_jobs" INTEGER NOT NULL,
    "delayed_jobs" INTEGER NOT NULL,
    "hours_consumed" DECIMAL(10,2) NOT NULL,
    "outstanding_minor_units" INTEGER NOT NULL,
    "avg_projected_months" DECIMAL(8,2),
    "extra" JSONB NOT NULL DEFAULT '{}',
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_health_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "notifications_user_id_seen_at_idx" ON "notifications"("user_id", "seen_at");

-- CreateIndex
CREATE UNIQUE INDEX "sla_defaults_priority_key" ON "sla_defaults"("priority");

-- CreateIndex
CREATE INDEX "recurring_job_templates_status_next_run_at_idx" ON "recurring_job_templates"("status", "next_run_at");

-- CreateIndex
CREATE INDEX "recurring_job_templates_department_id_idx" ON "recurring_job_templates"("department_id");

-- CreateIndex
CREATE INDEX "recurring_job_templates_client_id_idx" ON "recurring_job_templates"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_articles_slug_key" ON "knowledge_articles"("slug");

-- CreateIndex
CREATE INDEX "knowledge_articles_status_updated_at_idx" ON "knowledge_articles"("status", "updated_at" DESC);

-- CreateIndex
CREATE INDEX "knowledge_articles_related_client_id_idx" ON "knowledge_articles"("related_client_id");

-- CreateIndex
CREATE INDEX "client_health_snapshots_client_id_period_start_idx" ON "client_health_snapshots"("client_id", "period_start" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "client_health_snapshots_client_id_period_start_key" ON "client_health_snapshots"("client_id", "period_start");

-- CreateIndex
CREATE INDEX "jobs_recurring_template_id_idx" ON "jobs"("recurring_template_id");

-- CreateIndex
CREATE INDEX "saved_views_visibility_scope_idx" ON "saved_views"("visibility", "scope");

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_recurring_template_id_fkey" FOREIGN KEY ("recurring_template_id") REFERENCES "recurring_job_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt_documents" ADD CONSTRAINT "receipt_documents_credited_receipt_id_fkey" FOREIGN KEY ("credited_receipt_id") REFERENCES "receipt_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt_documents" ADD CONSTRAINT "receipt_documents_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sla_defaults" ADD CONSTRAINT "sla_defaults_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_settings" ADD CONSTRAINT "company_settings_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_job_templates" ADD CONSTRAINT "recurring_job_templates_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_job_templates" ADD CONSTRAINT "recurring_job_templates_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_job_templates" ADD CONSTRAINT "recurring_job_templates_default_assignee_id_fkey" FOREIGN KEY ("default_assignee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_job_templates" ADD CONSTRAINT "recurring_job_templates_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_job_templates" ADD CONSTRAINT "recurring_job_templates_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_articles" ADD CONSTRAINT "knowledge_articles_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_articles" ADD CONSTRAINT "knowledge_articles_last_edited_by_user_id_fkey" FOREIGN KEY ("last_edited_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_articles" ADD CONSTRAINT "knowledge_articles_related_client_id_fkey" FOREIGN KEY ("related_client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_article_tags" ADD CONSTRAINT "knowledge_article_tags_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "knowledge_articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_article_tags" ADD CONSTRAINT "knowledge_article_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_health_snapshots" ADD CONSTRAINT "client_health_snapshots_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
