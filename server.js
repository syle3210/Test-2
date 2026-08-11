const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

const NIM_API_BASE = process.env.NIM_API_BASE || 'https://integrate.api.nvidia.com/v1';
const NIM_API_KEY = process.env.NIM_API_KEY;
const CLIENT_AUTH_KEY = process.env.CLIENT_AUTH_KEY; // optional but recommended

app.use(cors());
app.use(express.json({ limit: '20mb' }));

// Optional simple auth
app.use((req, res, next) => {
  if (req.path === '/health' || req.path === '/v1/models') return next();
  if (!CLIENT_AUTH_KEY) return next(); // no auth if not set

  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : auth;
  if (token !== CLIENT_AUTH_KEY) {
    return res.status(403).json({ error: { message: 'Invalid API key' } });
  }
  next();
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', pure: true });
});

app.get('/v1/models', (req, res) => {
  res.json({
    object: 'list',
    data: [
      { id: 'glm-5.2', object: 'model' },
      { id: 'meta/llama-3.3-70b-instruct', object: 'model' },
      { id: 'nvidia/llama-3.3-nemotron-super-49b-v1.5', object: 'model' },
      { id: 'mistralai/mistral-large-3-675b-instruct-2512', object: 'model' }
    ]
  });
});

app.post('/v1/chat/completions', async (req, res) => {
  try {
    if (!NIM_API_KEY) {
      return res.status(500).json({ error: { message: 'NIM_API_KEY not set' } });
    }

    // Pure pass-through — no system prompt injection, no rewriting
    const response = await axios.post(
      `${NIM_API_BASE}/chat/completions`,
      {
        ...req.body,                    // keep everything Janitor sent
        model: req.body.model || 'z-ai/glm-5.2'
      },
      {
        headers: {
          Authorization: `Bearer ${NIM_API_KEY}`,
          'Content-Type': 'application/json'
        },
        responseType: req.body.stream ? 'stream' : 'json',
        timeout: 180000
      }
    );

    if (req.body.stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      response.data.pipe(res);
    } else {
      res.json(response.data);
    }
  } catch (err) {
    const status = err.response?.status || 500;
    const data = err.response?.data || { error: { message: err.message } };
    res.status(status).json(data);
  }
});

app.listen(PORT, () => {
  console.log(`Pure NIM proxy running on port ${PORT}`);
});
