-- AlterTable
ALTER TABLE "company_settings" ALTER COLUMN "id" SET DEFAULT '00000000-0000-0000-0000-000000000001';

-- AlterTable
ALTER TABLE "receipt_documents" ADD COLUMN     "cached_pdf_attachment_id" UUID,
ADD COLUMN     "header_snapshot" JSONB;

-- AddForeignKey
ALTER TABLE "receipt_documents" ADD CONSTRAINT "receipt_documents_cached_pdf_attachment_id_fkey" FOREIGN KEY ("cached_pdf_attachment_id") REFERENCES "attachments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
