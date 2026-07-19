import { test, describe, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import app from '../src/app.js';
import { sequelize } from '../src/config/db.js';

// Данные валидного юзера, которыми пользуемся в тестах.
const validUser = {
  email: 'test@mail.ru',
  password: 'secret123',
  displayName: 'Test User',
};

// Перед КАЖДЫМ тестом обнуляем схему тестовой БД — чтобы тесты не влияли друг на друга.
// force: true дропает и заново создаёт таблицы. Допустимо ТОЛЬКО на videocall_test!
beforeEach(async () => {
  await sequelize.sync({ force: true });
});

// После всех тестов закрываем соединение с БД, иначе процесс не завершится сам.
after(async () => {
  await sequelize.close();
});

describe('POST /api/auth/register', () => {
  test('регистрирует юзера → 201, отдаёт user без passwordHash, ставит cookie', async () => {
    const res = await request(app).post('/api/auth/register').send(validUser);

    assert.equal(res.status, 201);
    assert.equal(res.body.user.email, validUser.email);
    assert.equal(res.body.user.displayName, validUser.displayName);
    assert.equal(res.body.user.passwordHash, undefined); // хеш наружу не утёк
    assert.ok(res.headers['set-cookie'], 'должна быть выставлена cookie с токеном');
  });

  test('дубль email → 409', async () => {
    await request(app).post('/api/auth/register').send(validUser);
    const res = await request(app).post('/api/auth/register').send(validUser);

    assert.equal(res.status, 409);
  });

  test('короткий пароль → 400', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validUser, password: '123' });

    assert.equal(res.status, 400);
  });
});

describe('POST /api/auth/login', () => {
  // Перед каждым тестом логина — сначала регистрируем юзера
  // (beforeEach выше уже очистил БД, порядок: сначала обнуление, потом эта регистрация).
  beforeEach(async () => {
    await request(app).post('/api/auth/register').send(validUser);
  });

  test('верный пароль → 200 + user', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: validUser.email, password: validUser.password });

    assert.equal(res.status, 200);
    assert.equal(res.body.user.email, validUser.email);
  });

  test('неверный пароль → 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: validUser.email, password: 'wrong-password' });

    assert.equal(res.status, 401);
  });
});

describe('GET /api/auth/me', () => {
  test('без токена → 401', async () => {
    const res = await request(app).get('/api/auth/me');

    assert.equal(res.status, 401);
  });

  test('с токеном после регистрации → 200 + текущий юзер', async () => {
    // request.agent хранит cookie между запросами — как браузер.
    const agent = request.agent(app);
    await agent.post('/api/auth/register').send(validUser);

    const res = await agent.get('/api/auth/me');

    assert.equal(res.status, 200);
    assert.equal(res.body.user.email, validUser.email);
  });
});
