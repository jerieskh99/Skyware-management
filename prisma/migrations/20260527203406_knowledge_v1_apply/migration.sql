-- CreateEnum
CREATE TYPE "KnowledgeArticleType" AS ENUM ('internal_task_lesson', 'external_reference', 'how_to_guide', 'troubleshooting_note', 'architecture_decision', 'process_policy_note');

-- CreateEnum
CREATE TYPE "KnowledgeReliabilityTier" AS ENUM ('verified', 'validated', 'single_source', 'anecdotal');

-- CreateEnum
CREATE TYPE "KnowledgeArticleReviewStatus" AS ENUM ('pending', 'approved', 'changes_requested', 'rejected');

-- CreateEnum
CREATE TYPE "KnowledgeArticleReferenceKind" AS ENUM ('related', 'supersedes', 'superseded_by', 'see_also');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "KnowledgeArticleStatus" ADD VALUE 'ai_structured';
ALTER TYPE "KnowledgeArticleStatus" ADD VALUE 'pending_review';
ALTER TYPE "KnowledgeArticleStatus" ADD VALUE 'approved';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationKind" ADD VALUE 'knowledge_review_requested';
ALTER TYPE "NotificationKind" ADD VALUE 'knowledge_review_decided';
ALTER TYPE "NotificationKind" ADD VALUE 'knowledge_freshness_due';
ALTER TYPE "NotificationKind" ADD VALUE 'knowledge_link_broken';

-- AlterTable
ALTER TABLE "company_settings" ALTER COLUMN "id" SET DEFAULT '00000000-0000-0000-0000-000000000001';

-- AlterTable
ALTER TABLE "knowledge_articles" ADD COLUMN     "ai_structured_snapshot" JSONB,
ADD COLUMN     "confidence_score" INTEGER,
ADD COLUMN     "current_version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "external_source" TEXT,
ADD COLUMN     "external_url" TEXT,
ADD COLUMN     "external_url_hash" TEXT,
ADD COLUMN     "kind" "KnowledgeArticleType" NOT NULL DEFAULT 'how_to_guide',
ADD COLUMN     "last_reviewed_at" TIMESTAMP(3),
ADD COLUMN     "last_verified_at" TIMESTAMP(3),
ADD COLUMN     "last_verified_by_user_id" UUID,
ADD COLUMN     "raw_input_snapshot" TEXT,
ADD COLUMN     "reliability_tier" "KnowledgeReliabilityTier" NOT NULL DEFAULT 'single_source',
ADD COLUMN     "reviewer_user_id" UUID,
ADD COLUMN     "source_job_id" UUID,
ADD COLUMN     "source_work_report_id" UUID,
ADD COLUMN     "why_it_matters" TEXT;

-- CreateTable
CREATE TABLE "knowledge_article_revisions" (
    "id" UUID NOT NULL,
    "article_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "summary" TEXT,
    "why_it_matters" TEXT,
    "author_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_article_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_article_reviews" (
    "id" UUID NOT NULL,
    "article_id" UUID NOT NULL,
    "reviewer_user_id" UUID NOT NULL,
    "status" "KnowledgeArticleReviewStatus" NOT NULL DEFAULT 'pending',
    "comment" TEXT,
    "decided_at" TIMESTAMP(3),
    "cycle_number" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_article_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_article_references" (
    "id" UUID NOT NULL,
    "article_id" UUID NOT NULL,
    "referenced_article_id" UUID NOT NULL,
    "kind" "KnowledgeArticleReferenceKind" NOT NULL DEFAULT 'related',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_article_references_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "knowledge_article_revisions_article_id_created_at_idx" ON "knowledge_article_revisions"("article_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_article_revisions_article_id_version_key" ON "knowledge_article_revisions"("article_id", "version");

-- CreateIndex
CREATE INDEX "knowledge_article_reviews_article_id_created_at_idx" ON "knowledge_article_reviews"("article_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "knowledge_article_reviews_reviewer_user_id_status_idx" ON "knowledge_article_reviews"("reviewer_user_id", "status");

-- CreateIndex
CREATE INDEX "knowledge_article_references_referenced_article_id_idx" ON "knowledge_article_references"("referenced_article_id");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_article_references_article_id_referenced_article__key" ON "knowledge_article_references"("article_id", "referenced_article_id", "kind");

-- AddForeignKey
ALTER TABLE "knowledge_articles" ADD CONSTRAINT "knowledge_articles_source_job_id_fkey" FOREIGN KEY ("source_job_id") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_articles" ADD CONSTRAINT "knowledge_articles_source_work_report_id_fkey" FOREIGN KEY ("source_work_report_id") REFERENCES "work_reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_articles" ADD CONSTRAINT "knowledge_articles_last_verified_by_user_id_fkey" FOREIGN KEY ("last_verified_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_articles" ADD CONSTRAINT "knowledge_articles_reviewer_user_id_fkey" FOREIGN KEY ("reviewer_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_article_revisions" ADD CONSTRAINT "knowledge_article_revisions_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "knowledge_articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_article_revisions" ADD CONSTRAINT "knowledge_article_revisions_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_article_reviews" ADD CONSTRAINT "knowledge_article_reviews_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "knowledge_articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_article_reviews" ADD CONSTRAINT "knowledge_article_reviews_reviewer_user_id_fkey" FOREIGN KEY ("reviewer_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_article_references" ADD CONSTRAINT "knowledge_article_references_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "knowledge_articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_article_references" ADD CONSTRAINT "knowledge_article_references_referenced_article_id_fkey" FOREIGN KEY ("referenced_article_id") REFERENCES "knowledge_articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
