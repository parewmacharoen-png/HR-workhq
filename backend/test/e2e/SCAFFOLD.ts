// ============================================================================
// test/e2e/SCAFFOLD.ts
// E2E test scaffold showing the full NestJS bootstrap + supertest pattern.
// Run with: DATABASE_URL=<url> npx jest --selectProjects e2e
// ============================================================================

// ── Typical e2e test structure ────────────────────────────────────────────────
//
// import { Test, TestingModule } from '@nestjs/testing';
// import { INestApplication, ValidationPipe } from '@nestjs/common';
// import * as request from 'supertest';
// import { AppModule } from '../../src/app.module';
//
// describe('PerformanceController (e2e)', () => {
//   let app: INestApplication;
//   let authToken: string;
//
//   beforeAll(async () => {
//     const moduleFixture: TestingModule = await Test.createTestingModule({
//       imports: [AppModule],
//     }).compile();
//
//     app = moduleFixture.createNestApplication();
//
//     // Mirror main.ts setup
//     app.useGlobalPipes(new ValidationPipe({
//       whitelist: true,
//       transform: true,
//       forbidNonWhitelisted: true,
//     }));
//     app.setGlobalPrefix('api/v1');
//     await app.init();
//
//     // Get auth token
//     const loginRes = await request(app.getHttpServer())
//       .post('/api/v1/auth/login')
//       .send({ username: 'test@workhq.com', password: 'testpassword' });
//     authToken = loginRes.body.accessToken;
//   });
//
//   afterAll(async () => {
//     await app.close();
//   });
//
//   it('POST /api/v1/performance/cycles creates a cycle', async () => {
//     const response = await request(app.getHttpServer())
//       .post('/api/v1/performance/cycles')
//       .set('Authorization', `Bearer ${authToken}`)
//       .send({
//         companyId: TEST_COMPANY_ID,
//         periodStart: '2024-01-01',
//         periodEnd: '2024-01-31',
//       })
//       .expect(201);
//
//     expect(response.body.status).toBe('open');
//   });
//
//   it('GET /api/v1/performance/cycles returns 401 without auth', () => {
//     return request(app.getHttpServer())
//       .get('/api/v1/performance/cycles?companyId=xxx')
//       .expect(401);
//   });
// });

export {};
