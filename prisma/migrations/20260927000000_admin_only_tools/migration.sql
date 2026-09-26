-- Notion, goal templates and the audit log become admin-only: remove them from the built-in MANAGER role.
-- Admins can re-grant any of them from «الأدوار والصلاحيات» if a manager genuinely needs one.
DELETE FROM "RolePermission" rp
USING "Role" r, "Permission" p
WHERE rp."roleId" = r."id"
  AND rp."permissionId" = p."id"
  AND r."key" = 'MANAGER'
  AND p."key" IN ('notion.manage', 'notion.sync', 'goal_templates.manage', 'audit.view');
