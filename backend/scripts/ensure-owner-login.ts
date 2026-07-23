/**
 * One-shot: ensure local owner back-office login (owner / password).
 * Run: npx ts-node -r tsconfig-paths/register scripts/ensure-owner-login.ts
 */
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const OWNER_USERNAME = 'owner';
const OWNER_DISPLAY = 'alynn';
const PASSWORD = 'password';

async function main(): Promise<void> {
  const admin = await prisma.user.findFirst({
    where: { username: 'admin', deletedAt: null },
    include: {
      userRoles: { where: { deletedAt: null } },
      businessRoleAssignments: { where: { isActive: true, deletedAt: null } },
      scopeGrants: { where: { deletedAt: null } },
    },
  });
  if (!admin) throw new Error('admin user missing — run prisma seed first');

  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  let owner = await prisma.user.findFirst({
    where: { username: OWNER_USERNAME, deletedAt: null },
  });

  if (owner) {
    owner = await prisma.user.update({
      where: { id: owner.id },
      data: { passwordHash, displayName: OWNER_DISPLAY, isActive: true, employeeId: null },
    });
    console.log('Updated existing owner user');
  } else {
    owner = await prisma.user.create({
      data: {
        id: randomUUID(),
        username: OWNER_USERNAME,
        displayName: OWNER_DISPLAY,
        passwordHash,
        userType: 'human',
        isActive: true,
      },
    });
    console.log('Created owner user');
  }

  for (const ur of admin.userRoles) {
    const exists = await prisma.userRole.findFirst({
      where: { userId: owner.id, roleId: ur.roleId, deletedAt: null },
    });
    if (!exists) {
      await prisma.userRole.create({
        data: {
          id: randomUUID(),
          userId: owner.id,
          roleId: ur.roleId,
          grantedBy: admin.id,
          createdBy: admin.id,
          updatedBy: admin.id,
        },
      });
    }
  }

  for (const br of admin.businessRoleAssignments) {
    const exists = await prisma.businessRoleAssignment.findFirst({
      where: { userId: owner.id, role: br.role, isActive: true, deletedAt: null },
    });
    if (!exists) {
      await prisma.businessRoleAssignment.create({
        data: {
          id: randomUUID(),
          userId: owner.id,
          role: br.role,
          isActive: true,
          assignedBy: admin.id,
          createdBy: admin.id,
          updatedBy: admin.id,
        },
      });
    }
  }

  for (const sg of admin.scopeGrants) {
    const exists = await prisma.scopeGrant.findFirst({
      where: {
        userId: owner.id,
        scopeType: sg.scopeType,
        companyId: sg.companyId,
        teamId: sg.teamId,
        deletedAt: null,
      },
    });
    if (!exists) {
      await prisma.scopeGrant.create({
        data: {
          id: randomUUID(),
          userId: owner.id,
          scopeType: sg.scopeType,
          companyId: sg.companyId,
          teamId: sg.teamId,
          createdBy: admin.id,
          updatedBy: admin.id,
        },
      });
    }
  }

  console.log(`\n✅ Login ready: username "${OWNER_USERNAME}" or display "${OWNER_DISPLAY}" / password "${PASSWORD}"`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
