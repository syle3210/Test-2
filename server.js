const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

const NIM_API_KEY = process.env.NIM_API_KEY;
const NIM_BASE = 'https://integrate.api.nvidia.com/v1';

app.use(cors({ origin: '*', methods: ['GET','POST','OPTIONS'], allowedHeaders: ['Content-Type','Authorization'] }));
app.use(express.json({ limit: '50mb' }));
app.options('*', cors());

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.post('/v1/chat/completions', async (req, res) => {
  console.log('=== NEW REQUEST ===');
  console.log('Model:', req.body?.model);
  console.log('Stream:', req.body?.stream);
  console.log('Msgs:', req.body?.messages?.length);

  if (!NIM_API_KEY) {
    return res.status(500).json({ error: { message: 'No NIM_API_KEY' } });
  }

  try {
    // Minimal cleaning that many working proxies do
    const body = {
      model: req.body.model || 'z-ai/glm-5.2',
      messages: req.body.messages,
      temperature: req.body.temperature ?? 0.85,
      max_tokens: Math.min(req.body.max_tokens || 1024, 2048), // hard cap
      top_p: req.body.top_p ?? 0.95,
      stream: !!req.body.stream,
      // remove fields that sometimes cause issues
    };

    // Remove undefined fields
    Object.keys(body).forEach(k => body[k] === undefined && delete body[k]);

    console.log('Sending cleaned body to NVIDIA...');

    const response = await axios({
      method: 'post',
      url: `${NIM_BASE}/chat/completions`,
      data: body,
      headers: {
        'Authorization': `Bearer ${NIM_API_KEY}`,
        'Content-Type': 'application/json'
      },
      responseType: body.stream ? 'stream' : 'json',
      timeout: 120000,
      validateStatus: () => true
    });

    console.log('NVIDIA status:', response.status);

    if (response.status >= 400) {
      console.error('Error from NVIDIA:', JSON.stringify(response.data).slice(0, 400));
      return res.status(response.status).json(response.data);
    }

    if (body.stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      response.data.pipe(res);
    } else {
      res.json(response.data);
    }

  } catch (err) {
    console.error('Crash:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: { message: err.message } });
    }
  }
});

app.listen(PORT, () => console.log('Proxy running'));
