const request = require('supertest');

// Use mock prefix for variables accessed inside jest.mock factories
let mockTokens = [];
let mockCounterValue = 0;

// Shared mock state accessible from both factory and tests
const mockState = { tokens: mockTokens, counterValue: mockCounterValue };

jest.mock('../backend/models/Token', () => {
  // Return a function (constructor) with static methods
  const MockToken = function (data) {
    const doc = {
      _id: `id_${data.tokenNumber}`,
      ...data,
      status: data.status || 'waiting',
      notified: false,
      createdAt: new Date(),
    };
    doc.save = jest.fn().mockImplementation(() => {
      const idx = MockToken._store.findIndex((t) => t.tokenNumber === doc.tokenNumber);
      if (idx >= 0) {
        MockToken._store[idx] = doc;
      } else {
        MockToken._store.push(doc);
      }
      return Promise.resolve(doc);
    });
    return doc;
  };
  MockToken._store = [];
  MockToken.find = jest.fn();
  MockToken.findOne = jest.fn();
  MockToken.countDocuments = jest.fn();
  MockToken.updateMany = jest.fn();
  MockToken.deleteMany = jest.fn();
  return MockToken;
});

jest.mock('../backend/models/Counter', () => ({
  findOneAndUpdate: jest.fn(),
  _counter: { value: 0 },
}));

process.env.NODE_ENV = 'test';
process.env.AVG_SERVICE_TIME_MINUTES = '5';

const Token = require('../backend/models/Token');
const Counter = require('../backend/models/Counter');
const app = require('../backend/server');

function setupMocks() {
  Counter._counter = { value: 0 };
  Counter.findOneAndUpdate.mockImplementation((filter, update, opts) => {
    if (update && update.$inc) {
      Counter._counter.value += update.$inc.value || 1;
    } else if (update && update.value !== undefined) {
      Counter._counter.value = update.value;
    }
    return Promise.resolve({ value: Counter._counter.value });
  });

  Token.find.mockImplementation((query = {}) => {
    let result = [...Token._store];
    if (query.status) result = result.filter((t) => t.status === query.status);
    return {
      sort: jest.fn().mockReturnValue(Promise.resolve(result.sort((a, b) => a.tokenNumber - b.tokenNumber))),
    };
  });

  Token.findOne.mockImplementation((query = {}) => {
    let result = [...Token._store];
    if (query.status) result = result.filter((t) => t.status === query.status);
    if (query.tokenNumber !== undefined && typeof query.tokenNumber === 'number') {
      result = result.filter((t) => t.tokenNumber === query.tokenNumber);
    }
    result.sort((a, b) => a.tokenNumber - b.tokenNumber);
    const found = result[0] || null;
    const ret = Promise.resolve(found);
    ret.sort = jest.fn().mockReturnValue(Promise.resolve(found));
    return ret;
  });

  Token.countDocuments.mockImplementation((query = {}) => {
    let result = [...Token._store];
    if (query.status) result = result.filter((t) => t.status === query.status);
    if (query.tokenNumber && query.tokenNumber.$lt !== undefined) {
      result = result.filter((t) => t.tokenNumber < query.tokenNumber.$lt);
    }
    return Promise.resolve(result.length);
  });

  Token.updateMany.mockImplementation((filter, update) => {
    Token._store.forEach((t) => {
      if (filter.status && t.status === filter.status) {
        t.status = update.status || t.status;
        if (update.completedAt) t.completedAt = update.completedAt;
      }
    });
    return Promise.resolve();
  });

  Token.deleteMany.mockImplementation(() => {
    Token._store = [];
    return Promise.resolve();
  });
}

beforeEach(() => {
  Token._store = [];
  jest.clearAllMocks();
  setupMocks();
});

describe('Token API', () => {
  describe('POST /api/tokens', () => {
    it('should create a new token', async () => {
      const res = await request(app)
        .post('/api/tokens')
        .send({ name: 'Alice', phone: '1234567890' });

      expect(res.status).toBe(201);
      expect(res.body.token).toBeDefined();
      expect(res.body.token.tokenNumber).toBe(1);
      expect(res.body.token.name).toBe('Alice');
      expect(res.body.positionInQueue).toBe(1);
      expect(res.body.estimatedWaitMinutes).toBe(0);
    });

    it('should increment token numbers', async () => {
      await request(app).post('/api/tokens').send({ name: 'Alice', phone: '111' });
      const res = await request(app).post('/api/tokens').send({ name: 'Bob', phone: '222' });

      expect(res.body.token.tokenNumber).toBe(2);
      expect(res.body.positionInQueue).toBe(2);
      expect(res.body.estimatedWaitMinutes).toBe(5);
    });

    it('should return 400 if name or phone is missing', async () => {
      const res = await request(app).post('/api/tokens').send({ name: 'Alice' });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/tokens/status', () => {
    it('should return empty queue status', async () => {
      const res = await request(app).get('/api/tokens/status');

      expect(res.status).toBe(200);
      expect(res.body.currentlyServing).toBeNull();
      expect(res.body.waitingCount).toBe(0);
    });

    it('should reflect waiting tokens', async () => {
      await request(app).post('/api/tokens').send({ name: 'Alice', phone: '111' });
      await request(app).post('/api/tokens').send({ name: 'Bob', phone: '222' });

      const res = await request(app).get('/api/tokens/status');

      expect(res.body.waitingCount).toBe(2);
      expect(res.body.waitingTokens).toHaveLength(2);
      expect(res.body.nextInQueue).toBe(1);
    });
  });

  describe('GET /api/tokens/:tokenNumber/check', () => {
    it('should return token info', async () => {
      await request(app).post('/api/tokens').send({ name: 'Alice', phone: '111' });

      const res = await request(app).get('/api/tokens/1/check');

      expect(res.status).toBe(200);
      expect(res.body.tokenNumber).toBe(1);
      expect(res.body.name).toBe('Alice');
      expect(res.body.status).toBe('waiting');
      expect(res.body.isYourTurn).toBe(true); // first in queue
    });

    it('should return 404 for non-existent token', async () => {
      const res = await request(app).get('/api/tokens/999/check');
      expect(res.status).toBe(404);
    });

    it('should calculate position and wait correctly', async () => {
      await request(app).post('/api/tokens').send({ name: 'Alice', phone: '111' });
      await request(app).post('/api/tokens').send({ name: 'Bob', phone: '222' });
      await request(app).post('/api/tokens').send({ name: 'Charlie', phone: '333' });

      const res = await request(app).get('/api/tokens/3/check');

      expect(res.body.positionInQueue).toBe(3);
      expect(res.body.estimatedWaitMinutes).toBe(10); // 2 people ahead * 5 min
      expect(res.body.isYourTurn).toBe(false);
    });
  });

  describe('POST /api/tokens/admin/next', () => {
    it('should serve next token in queue', async () => {
      await request(app).post('/api/tokens').send({ name: 'Alice', phone: '111' });
      await request(app).post('/api/tokens').send({ name: 'Bob', phone: '222' });

      const res = await request(app).post('/api/tokens/admin/next');

      expect(res.status).toBe(200);
      expect(res.body.currentlyServing.tokenNumber).toBe(1);
      expect(res.body.currentlyServing.name).toBe('Alice');
    });

    it('should complete previous and serve next', async () => {
      await request(app).post('/api/tokens').send({ name: 'Alice', phone: '111' });
      await request(app).post('/api/tokens').send({ name: 'Bob', phone: '222' });

      await request(app).post('/api/tokens/admin/next');
      const res = await request(app).post('/api/tokens/admin/next');

      expect(res.body.currentlyServing.tokenNumber).toBe(2);
      expect(res.body.currentlyServing.name).toBe('Bob');
    });

    it('should return message when queue is empty', async () => {
      const res = await request(app).post('/api/tokens/admin/next');
      expect(res.body.currentlyServing).toBeNull();
    });
  });

  describe('POST /api/tokens/admin/reset', () => {
    it('should clear all tokens and reset counter', async () => {
      await request(app).post('/api/tokens').send({ name: 'Alice', phone: '111' });
      await request(app).post('/api/tokens').send({ name: 'Bob', phone: '222' });

      const res = await request(app).post('/api/tokens/admin/reset');
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Queue has been reset');

      const statusRes = await request(app).get('/api/tokens/status');
      expect(statusRes.body.waitingCount).toBe(0);

      // Token numbers should restart
      const newToken = await request(app).post('/api/tokens').send({ name: 'Charlie', phone: '333' });
      expect(newToken.body.token.tokenNumber).toBe(1);
    });
  });

  describe('PATCH /api/tokens/admin/:tokenNumber/cancel', () => {
    it('should cancel a waiting token', async () => {
      await request(app).post('/api/tokens').send({ name: 'Alice', phone: '111' });

      const res = await request(app).patch('/api/tokens/admin/1/cancel');

      expect(res.status).toBe(200);
      expect(res.body.token.status).toBe('cancelled');
    });

    it('should return 404 for non-existent token', async () => {
      const res = await request(app).patch('/api/tokens/admin/999/cancel');
      expect(res.status).toBe(404);
    });

    it('should not cancel already completed token', async () => {
      await request(app).post('/api/tokens').send({ name: 'Alice', phone: '111' });
      await request(app).post('/api/tokens/admin/next'); // serve
      await request(app).post('/api/tokens/admin/next'); // complete

      const res = await request(app).patch('/api/tokens/admin/1/cancel');
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/tokens/admin/all', () => {
    it('should return all tokens', async () => {
      await request(app).post('/api/tokens').send({ name: 'Alice', phone: '111' });
      await request(app).post('/api/tokens').send({ name: 'Bob', phone: '222' });

      const res = await request(app).get('/api/tokens/admin/all');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
    });
  });
});
