-- A leave type can be locked until the balance of other leave types is used up.
ALTER TABLE "leave_types" ADD COLUMN "unlockAfterTypeIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[];
