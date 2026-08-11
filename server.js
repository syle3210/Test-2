const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

const NIM_API_KEY = process.env.NIM_API_KEY;
const NIM_BASE = 'https://integrate.api.nvidia.com/v1';

// Better CORS handling (important for Janitor)
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '50mb' }));

// Handle preflight
app.options('*', cors());

app.get('/', (req, res) => {
  res.json({ status: 'Clean NIM Proxy running', time: new Date().toISOString() });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', hasKey: !!NIM_API_KEY });
});

app.get('/v1/models', (req, res) => {
  res.json({
    object: 'list',
    data: [
      { id: 'z-ai/glm-5.2', object: 'model', owned_by: 'nvidia' },
      { id: 'meta/llama-3.3-70b-instruct', object: 'model', owned_by: 'nvidia' },
      { id: 'nvidia/llama-3.3-nemotron-super-49b-v1.5', object: 'model', owned_by: 'nvidia' }
    ]
  });
});

app.post('/v1/chat/completions', async (req, res) => {
  console.log('========== NEW REQUEST ==========');
  console.log('Time:', new Date().toISOString());
  console.log('Model requested:', req.body?.model);
  console.log('Stream:', req.body?.stream);
  console.log('Messages count:', req.body?.messages?.length);

  if (!NIM_API_KEY) {
    console.error('No NIM_API_KEY');
    return res.status(500).json({ error: { message: 'NIM_API_KEY not set' } });
  }

  try {
    // Force a known working model for testing if needed
    const body = {
      ...req.body,
      model: req.body.model || 'z-ai/glm-5.2'
    };

    console.log('Sending to NVIDIA with model:', body.model);

    const response = await axios({
      method: 'post',
      url: `${NIM_BASE}/chat/completions`,
      data: body,
      headers: {
        'Authorization': `Bearer ${NIM_API_KEY}`,
        'Content-Type': 'application/json'
      },
      responseType: body.stream ? 'stream' : 'json',
      timeout: 180000,
      validateStatus: () => true
    });

    console.log('NVIDIA status:', response.status);

    if (response.status >= 400) {
      console.error('NVIDIA error body:', JSON.stringify(response.data).slice(0, 500));
      return res.status(response.status).json(response.data);
    }

    if (body.stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      response.data.pipe(res);
    } else {
      console.log('Non-stream response received, sending to client');
      res.json(response.data);
    }

  } catch (err) {
    console.error('Proxy crash:', err.message);
    if (err.response) {
      console.error('Status:', err.response.status);
      console.error('Data:', JSON.stringify(err.response.data).slice(0, 300));
    }
    if (!res.headersSent) {
      res.status(500).json({ error: { message: err.message } });
    }
  }
});

app.listen(PORT, () => {
  console.log(`Clean NIM Proxy listening on port ${PORT}`);
});
