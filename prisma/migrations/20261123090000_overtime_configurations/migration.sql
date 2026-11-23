-- Overtime configurations (Attendance setup > Overtime). Assigned to employees in the Attendance section of the profile.
CREATE TABLE "overtime_configurations" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "fixedAmount" DECIMAL(12,2),
    "weekdayMultiplier" DECIMAL(6,3),
    "weekendMultiplier" DECIMAL(6,3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdByProfileId" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "overtime_configurations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "overtime_configurations_name_key" ON "overtime_configurations"("name");
