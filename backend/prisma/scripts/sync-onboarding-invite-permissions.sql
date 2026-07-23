-- Sync onboarding invite permissions for existing databases (idempotent).
INSERT INTO permission.permissions (id, key, description, category, created_at, updated_at)
SELECT gen_random_uuid(), k.key, k.description, 'Employee Onboarding', NOW(), NOW()
FROM (VALUES
  ('employee:onboarding:invite:view', 'ดูลิงก์เชิญพนักงาน'),
  ('employee:onboarding:invite:create', 'สร้างลิงก์เชิญพนักงาน'),
  ('employee:onboarding:invite:manage', 'จัดการลิงก์เชิญพนักงาน'),
  ('employee:onboarding:invite:cancel', 'ยกเลิกลิงก์เชิญ'),
  ('employee:onboarding:invite:regenerate', 'สร้างลิงก์ใหม่'),
  ('employee:onboarding:invite:link-existing', 'เชื่อม Telegram ให้พนักงานเดิม'),
  ('employee:onboarding:invite:new-employee', 'เชิญพนักงานใหม่')
) AS k(key, description)
WHERE NOT EXISTS (
  SELECT 1 FROM permission.permissions p WHERE p.key = k.key
);

INSERT INTO permission.role_permissions (id, role_id, permission_id, created_at, updated_at)
SELECT gen_random_uuid(), r.id, p.id, NOW(), NOW()
FROM permission.roles r
CROSS JOIN permission.permissions p
WHERE r.code IN ('super_admin', 'owner', 'secretary', 'big_leader')
  AND p.key LIKE 'employee:onboarding:invite:%'
  AND NOT EXISTS (
    SELECT 1 FROM permission.role_permissions rp
    WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

-- Platform admin should not be tied to a placeholder employee record.
UPDATE permission.users SET employee_id = NULL WHERE username = 'admin' AND employee_id IS NOT NULL;
