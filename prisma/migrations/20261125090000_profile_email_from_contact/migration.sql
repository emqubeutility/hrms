-- Profile.email (used by the employee list and login emails) is filled from Personal details > Contact,
-- for employees who entered it there before the email was kept in step. Personal email first, then official.
UPDATE "profiles" AS p
SET "email" = LOWER(TRIM(COALESCE(NULLIF(TRIM(s."data"->>'personalEmail'), ''), NULLIF(TRIM(s."data"->>'officialEmail'), ''))))
FROM "employees" AS e
JOIN "employee_profile_sections" AS s ON s."employeeId" = e."id" AND s."sectionKey" = 'personal'
WHERE e."profileId" = p."id"
  AND p."email" IS NULL
  AND COALESCE(NULLIF(TRIM(s."data"->>'personalEmail'), ''), NULLIF(TRIM(s."data"->>'officialEmail'), '')) IS NOT NULL;
