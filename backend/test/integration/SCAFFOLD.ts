// ============================================================================
// test/integration/README.md stub — integration test scaffold
//
// modules/performance/infrastructure/persistence/
//   performance.prisma.repository.integration.spec.ts
//
// Integration tests require a real PostgreSQL database.
// Run with: DATABASE_URL=<url> npx jest --selectProjects integration
//
// This file is a scaffold showing the patterns to follow when writing
// integration tests for the Prisma repository adapters.
// ============================================================================

// ── Typical integration test structure ────────────────────────────────────────
//
// import { PrismaService } from '../../../src/shared/prisma/prisma.service';
// import { PrismaPerformanceCycleRepository } from '../../../src/modules/performance/...';
//
// describe('PrismaPerformanceCycleRepository (integration)', () => {
//   let prisma: PrismaService;
//   let repo: PrismaPerformanceCycleRepository;
//   const createdIds: string[] = [];
//
//   beforeAll(async () => {
//     prisma = new PrismaService();
//     await prisma.$connect();
//     repo = new PrismaPerformanceCycleRepository(prisma);
//   });
//
//   afterAll(async () => {
//     // Clean up test data
//     if (createdIds.length > 0) {
//       await prisma.performanceCycle.deleteMany({ where: { id: { in: createdIds } } });
//     }
//     await prisma.$disconnect();
//   });
//
//   it('creates and retrieves a performance cycle', async () => {
//     const id = randomUUID();
//     createdIds.push(id);
//
//     await repo.create({
//       id,
//       companyId: TEST_COMPANY_ID,
//       periodStart: new Date('2024-01-01'),
//       periodEnd: new Date('2024-01-31'),
//       actorUserId: 'system',
//     });
//
//     const cycle = await repo.findById(id);
//     expect(cycle).not.toBeNull();
//     expect(cycle!.status).toBe('open');
//   });
// });

export {};
