-- Migration: remove legacy registration_status column after API and schema cleanup.
-- Run only after all status writes/read paths were switched to status enum and verified.
--
-- 1) Confirm no recent legacy writes remain (optional safety check):
SELECT
  COUNT(*) AS registrations_left,
  COALESCE(MAX(updated_at), '1970-01-01'::timestamptz) AS latest_updated_at
FROM marathon_editions
WHERE registration_status IS NOT NULL;

-- 2) Drop legacy field.
ALTER TABLE marathon_editions DROP COLUMN registration_status;