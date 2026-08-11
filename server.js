const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

const NIM_API_KEY = process.env.NIM_API_KEY;
const NIM_BASE = 'https://integrate.api.nvidia.com/v1';

app.get('/', (req, res) => {
  res.json({ status: 'Clean NVIDIA NIM Proxy is running' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.post('/v1/chat/completions', async (req, res) => {
  if (!NIM_API_KEY) {
    return res.status(500).json({ error: { message: 'NIM_API_KEY not set' } });
  }

  const isStream = req.body.stream === true;

  try {
    const response = await axios({
      method: 'post',
      url: `${NIM_BASE}/chat/completions`,
      data: req.body,
      headers: {
        'Authorization': `Bearer ${NIM_API_KEY}`,
        'Content-Type': 'application/json',
        'Accept': isStream ? 'text/event-stream' : 'application/json'
      },
      responseType: isStream ? 'stream' : 'json',
      timeout: 180000,
      // Important for streaming stability
      maxRedirects: 0,
      validateStatus: () => true
    });

    // Forward status code
    res.status(response.status);

    if (isStream) {
      // Proper streaming headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no'); // critical for some hosts

      // Pipe the stream and handle errors properly
      response.data.pipe(res);

      response.data.on('error', (err) => {
        console.error('Upstream stream error:', err.message);
        if (!res.headersSent) {
          res.status(500).end();
        } else {
          res.end();
        }
      });

      req.on('close', () => {
        response.data.destroy(); // clean up if client disconnects
      });

    } else {
      res.json(response.data);
    }

  } catch (err) {
    console.error('Proxy error:', err.message);
    const status = err.response?.status || 500;
    const data = err.response?.data || { error: { message: err.message } };
    
    if (!res.headersSent) {
      res.status(status).json(data);
    }
  }
});

app.listen(PORT, () => {
  console.log(`Clean NIM Proxy running on port ${PORT}`);
});
