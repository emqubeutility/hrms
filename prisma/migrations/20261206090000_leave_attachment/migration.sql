-- A leave application can carry a supporting document (stored privately).
ALTER TABLE "leave_applications" ADD COLUMN "attachmentFileId" BIGINT;
ALTER TABLE "leave_applications" ADD CONSTRAINT "leave_applications_attachmentFileId_fkey" FOREIGN KEY ("attachmentFileId") REFERENCES "stored_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;
