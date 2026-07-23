-- Grant attendance:write to secretary and big_leader (idempotent).
INSERT INTO permission.role_permissions (id, role_id, permission_id, created_at, updated_at)
SELECT gen_random_uuid(), r.id, p.id, NOW(), NOW()
FROM permission.roles r
CROSS JOIN permission.permissions p
WHERE r.code IN ('secretary', 'big_leader')
  AND p.key = 'attendance:write'
  AND NOT EXISTS (
    SELECT 1 FROM permission.role_permissions rp
    WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );
