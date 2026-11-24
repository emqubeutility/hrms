-- Several supporting documents per leave application. Existing single attachments are copied into the link table.
CREATE TABLE "leave_attachments" (
    "id" BIGSERIAL NOT NULL,
    "applicationId" INTEGER NOT NULL,
    "fileId" BIGINT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leave_attachments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "leave_attachments_applicationId_fileId_key" ON "leave_attachments"("applicationId", "fileId");
CREATE INDEX "leave_attachments_applicationId_idx" ON "leave_attachments"("applicationId");

ALTER TABLE "leave_attachments" ADD CONSTRAINT "leave_attachments_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "leave_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "leave_attachments" ADD CONSTRAINT "leave_attachments_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "stored_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "leave_attachments" ("applicationId", "fileId")
SELECT "id", "attachmentFileId" FROM "leave_applications" WHERE "attachmentFileId" IS NOT NULL;
