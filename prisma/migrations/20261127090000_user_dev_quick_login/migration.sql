-- Development only: users listed on the login page for passwordless sign-in (ignored in production).
ALTER TABLE "users" ADD COLUMN "devQuickLogin" BOOLEAN NOT NULL DEFAULT false;
