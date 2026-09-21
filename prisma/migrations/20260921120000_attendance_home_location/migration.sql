-- ATT-LOC: WFH home-location anti-fraud check
-- Adds a captured GPS home baseline to employees, and per-event GPS/distance/anomaly
-- columns to attendance records for both check-in and check-out.

ALTER TABLE "employee"."employees"
  ADD COLUMN "home_latitude" DECIMAL(9,6),
  ADD COLUMN "home_longitude" DECIMAL(9,6),
  ADD COLUMN "home_location_captured_at" TIMESTAMPTZ;

ALTER TABLE "attendance"."attendance_records"
  ADD COLUMN "check_in_latitude" DECIMAL(9,6),
  ADD COLUMN "check_in_longitude" DECIMAL(9,6),
  ADD COLUMN "check_in_distance_meters" DECIMAL(10,2),
  ADD COLUMN "check_in_location_anomaly" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "check_out_latitude" DECIMAL(9,6),
  ADD COLUMN "check_out_longitude" DECIMAL(9,6),
  ADD COLUMN "check_out_distance_meters" DECIMAL(10,2),
  ADD COLUMN "check_out_location_anomaly" BOOLEAN NOT NULL DEFAULT false;
