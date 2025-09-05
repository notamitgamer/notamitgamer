// A simple Express server to proxy requests to the JDoodle API.
// This bypasses CORS issues by making the cross-origin request from the server,
// which is not subject to browser security policies.

import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3000;

// IMPORTANT: Replace these with your actual JDoodle credentials.
// For security, it's best to set these as environment variables on Render.
const JDOODLE_CLIENT_ID = process.env.JDOODLE_CLIENT_ID || 'YOUR_JDOODLE_CLIENT_ID';
const JDOODLE_CLIENT_SECRET = process.env.JDOODLE_CLIENT_SECRET || 'YOUR_JDOODLE_CLIENT_SECRET';

app.use(express.json());
app.use(cors()); // Allow cross-origin requests from your frontend

// A single endpoint to handle the code execution request.
app.post('/api/run-code', async (req, res) => {
    try {
        const { script, language, versionIndex } = req.body;

        const response = await fetch('https://api.jdoodle.com/v1/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                script,
                language,
                versionIndex,
                clientId: JDOODLE_CLIENT_ID,
                clientSecret: JDOODLE_CLIENT_SECRET
            })
        });

        const data = await response.json();
        res.json(data);
        
    } catch (error) {
        console.error('Error proxying request to JDoodle:', error);
        res.status(500).json({ error: 'Failed to execute code on backend.' });
    }
});

// A simple health check endpoint for Render.
app.get('/', (req, res) => {
  res.send('Proxy server is running!');
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
