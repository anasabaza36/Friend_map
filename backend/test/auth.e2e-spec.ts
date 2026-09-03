import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { Server } from 'http';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let httpServer: Server;

  jest.setTimeout(60000);

  const testUser = {
    email: 'testuser@example.com',
    username: 'testuser',
    password: 'TestPass123',
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );

    await app.init();
    httpServer = app.getHttpServer() as Server;
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await prisma.user.deleteMany({
      where: { email: { contains: '@example.com' } },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { contains: '@example.com' } },
    });
    await app.close();
  });

  it('registers a user successfully', async () => {
    const response = await request(httpServer)
      .post('/auth/register')
      .send(testUser)
      .expect(201);

    expect(response.body).toHaveProperty('accessToken');
    expect(typeof response.body.accessToken).toBe('string');

    const stored = await prisma.user.findUnique({
      where: { email: testUser.email },
    });
    expect(stored).not.toBeNull();
    expect(stored?.passwordHash).not.toBe(testUser.password);
    expect(await bcrypt.compare(testUser.password, stored!.passwordHash)).toBe(
      true,
    );
  });

  it('rejects duplicate email', async () => {
    await request(httpServer).post('/auth/register').send(testUser).expect(201);

    const response = await request(httpServer)
      .post('/auth/register')
      .send({
        ...testUser,
        username: 'anotherusername',
      })
      .expect(409);

    expect(response.body.message).toContain('Email');
  });

  it('rejects duplicate username', async () => {
    await request(httpServer).post('/auth/register').send(testUser).expect(201);

    const response = await request(httpServer)
      .post('/auth/register')
      .send({
        email: 'other@example.com',
        username: testUser.username,
        password: testUser.password,
      })
      .expect(409);

    expect(response.body.message).toContain('Username');
  });

  it('logs in successfully', async () => {
    await request(httpServer).post('/auth/register').send(testUser).expect(201);

    const response = await request(httpServer)
      .post('/auth/login')
      .send({
        email: testUser.email,
        password: testUser.password,
      })
      .expect(201);

    expect(response.body).toHaveProperty('accessToken');
  });

  it('rejects invalid password', async () => {
    await request(httpServer).post('/auth/register').send(testUser).expect(201);

    const response = await request(httpServer)
      .post('/auth/login')
      .send({
        email: testUser.email,
        password: 'WrongPassword123',
      })
      .expect(401);

    expect(response.body.message).toContain('Invalid');
  });

  it('authenticates JWT on protected route', async () => {
    const registerResponse = await request(httpServer)
      .post('/auth/register')
      .send(testUser)
      .expect(201);

    const token = registerResponse.body.accessToken as string;

    const profileResponse = await request(httpServer)
      .get('/users/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(profileResponse.body.email).toBe(testUser.email);
    expect(profileResponse.body.username).toBe(testUser.username);
    expect(profileResponse.body).not.toHaveProperty('passwordHash');
  });

  it('rejects protected route without JWT', async () => {
    const response = await request(httpServer).get('/users/me').expect(401);

    expect(response.body.message).toContain('Authentication');
  });
});
