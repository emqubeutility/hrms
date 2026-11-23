-- A leave type can offer choices when applying (for example bereavement by relationship), each with its own length.
ALTER TABLE "leave_types" ADD COLUMN "variants" JSONB NOT NULL DEFAULT '[]', ADD COLUMN "variantLabel" TEXT;
ALTER TABLE "leave_applications" ADD COLUMN "variant" TEXT;
