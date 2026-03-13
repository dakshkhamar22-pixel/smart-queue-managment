const express = require('express');
const router = express.Router();
const Token = require('../models/Token');
const Counter = require('../models/Counter');

const AVG_SERVICE_TIME = parseInt(process.env.AVG_SERVICE_TIME_MINUTES, 10) || 5;

// Get next token number
async function getNextTokenNumber() {
  const counter = await Counter.findOneAndUpdate(
    { name: 'tokenCounter' },
    { $inc: { value: 1 } },
    { new: true, upsert: true }
  );
  return counter.value;
}

// POST /api/tokens - Take a new token
router.post('/', async (req, res) => {
  try {
    const { name, phone } = req.body;

    if (!name || !phone) {
      return res.status(400).json({ error: 'Name and phone are required' });
    }

    const tokenNumber = await getNextTokenNumber();

    const token = new Token({
      tokenNumber,
      name,
      phone,
    });

    await token.save();

    const waitingCount = await Token.countDocuments({ status: 'waiting', tokenNumber: { $lt: tokenNumber } });
    const estimatedWait = waitingCount * AVG_SERVICE_TIME;

    res.status(201).json({
      token: {
        id: token._id,
        tokenNumber: token.tokenNumber,
        name: token.name,
        status: token.status,
        createdAt: token.createdAt,
      },
      estimatedWaitMinutes: estimatedWait,
      positionInQueue: waitingCount + 1,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create token' });
  }
});

// GET /api/tokens/status - Live queue status
router.get('/status', async (req, res) => {
  try {
    const waiting = await Token.find({ status: 'waiting' }).sort({ tokenNumber: 1 });
    const serving = await Token.find({ status: 'serving' }).sort({ tokenNumber: 1 });
    const currentlyServing = serving.length > 0 ? serving[0].tokenNumber : null;
    const nextInQueue = waiting.length > 0 ? waiting[0].tokenNumber : null;

    res.json({
      currentlyServing,
      nextInQueue,
      waitingCount: waiting.length,
      waitingTokens: waiting.map((t) => ({
        tokenNumber: t.tokenNumber,
        name: t.name,
      })),
      servingTokens: serving.map((t) => ({
        tokenNumber: t.tokenNumber,
        name: t.name,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch queue status' });
  }
});

// GET /api/tokens/:tokenNumber/check - Check individual token + notification
router.get('/:tokenNumber/check', async (req, res) => {
  try {
    const tokenNumber = parseInt(req.params.tokenNumber, 10);
    const token = await Token.findOne({ tokenNumber });

    if (!token) {
      return res.status(404).json({ error: 'Token not found' });
    }

    let positionInQueue = 0;
    let estimatedWait = 0;
    let isYourTurn = false;

    if (token.status === 'waiting') {
      positionInQueue = await Token.countDocuments({
        status: 'waiting',
        tokenNumber: { $lt: tokenNumber },
      });
      estimatedWait = positionInQueue * AVG_SERVICE_TIME;
      isYourTurn = positionInQueue === 0;
    } else if (token.status === 'serving') {
      isYourTurn = true;
    }

    // Mark as notified when it's their turn
    if (isYourTurn && !token.notified) {
      token.notified = true;
      await token.save();
    }

    res.json({
      tokenNumber: token.tokenNumber,
      name: token.name,
      status: token.status,
      positionInQueue: token.status === 'waiting' ? positionInQueue + 1 : 0,
      estimatedWaitMinutes: estimatedWait,
      isYourTurn,
      notified: token.notified,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to check token' });
  }
});

// Admin routes

// GET /api/tokens/admin/all - Get all tokens for admin
router.get('/admin/all', async (req, res) => {
  try {
    const tokens = await Token.find().sort({ tokenNumber: 1 });
    res.json(tokens);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch tokens' });
  }
});

// POST /api/tokens/admin/next - Call next token
router.post('/admin/next', async (req, res) => {
  try {
    // Complete currently serving tokens
    await Token.updateMany(
      { status: 'serving' },
      { status: 'completed', completedAt: new Date() }
    );

    // Get next waiting token
    const nextToken = await Token.findOne({ status: 'waiting' }).sort({ tokenNumber: 1 });

    if (!nextToken) {
      return res.json({ message: 'No more tokens in queue', currentlyServing: null });
    }

    nextToken.status = 'serving';
    nextToken.servedAt = new Date();
    await nextToken.save();

    res.json({
      message: `Now serving token #${nextToken.tokenNumber}`,
      currentlyServing: {
        tokenNumber: nextToken.tokenNumber,
        name: nextToken.name,
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to call next token' });
  }
});

// POST /api/tokens/admin/reset - Reset queue
router.post('/admin/reset', async (req, res) => {
  try {
    await Token.deleteMany({});
    await Counter.findOneAndUpdate(
      { name: 'tokenCounter' },
      { value: 0 },
      { upsert: true }
    );

    res.json({ message: 'Queue has been reset' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reset queue' });
  }
});

// PATCH /api/tokens/admin/:tokenNumber/cancel - Cancel a token
router.patch('/admin/:tokenNumber/cancel', async (req, res) => {
  try {
    const tokenNumber = parseInt(req.params.tokenNumber, 10);
    const token = await Token.findOne({ tokenNumber });

    if (!token) {
      return res.status(404).json({ error: 'Token not found' });
    }

    if (token.status === 'completed' || token.status === 'cancelled') {
      return res.status(400).json({ error: 'Token is already completed or cancelled' });
    }

    token.status = 'cancelled';
    await token.save();

    res.json({ message: `Token #${tokenNumber} cancelled`, token });
  } catch (err) {
    res.status(500).json({ error: 'Failed to cancel token' });
  }
});

module.exports = router;
