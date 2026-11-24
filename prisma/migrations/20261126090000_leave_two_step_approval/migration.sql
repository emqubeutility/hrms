-- Two-step leave approval: the manager approves (MANAGER_APPROVED), then HR confirms (APPROVED).
ALTER TABLE "leave_applications" ADD COLUMN "managerDecidedById" INTEGER,
  ADD COLUMN "managerDecidedAt" TIMESTAMPTZ(3),
  ADD COLUMN "managerNote" TEXT;
