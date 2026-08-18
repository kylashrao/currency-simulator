// api/chat.js - GlobalPay Backend Proxy
export default async function handler(req, res) {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight OPTIONS request
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    let body = req.body;
    if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch (e) { }
    }

    const { messages } = body || {};
    if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: 'Invalid or missing messages array.' });
    }

    const apiKey = (process.env.GEMINI_API_KEY || '').trim();
    if (!apiKey) {
        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        res.write(`data: ${JSON.stringify({ error: 'GEMINI_API_KEY environment variable is missing on Vercel.' })}\n\n`);
        return res.end();
    }

    // Configure Server-Sent Events (SSE) streaming headers
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');

    const systemInstruction = `You are GlobalPay Assistant, an expert AI support guide for GlobalPay Simulator (globalpay-sim.vercel.app).
Your goal is to assist users with questions about cross-border payment flows, mid-market FX exchange rates, hidden banking markups, wire transfer fees, and how to operate the GlobalPay simulator.

Key Knowledge Base:
- Platform Overview: GlobalPay Simulator calculates true net take-home payouts by exposing hidden FX markup rates and intermediary fees.
- Support Email: kylash.rao@gmail.com

Tone & Style Guidelines:
- Direct, concise, helpful, and transparent.
- Avoid markdown headers; keep answers concise for easy reading.`;

    try {
        const contents = messages.map(msg => ({
            role: msg.role === 'user' ? 'user' : 'model',
            parts: [{ text: msg.content }]
        }));

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:streamGenerateContent?alt=sse&key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    systemInstruction: { parts: [{ text: systemInstruction }] },
                    contents: contents
                })
            }
        );

        if (!response.ok) {
            const errText = await response.text();
            console.error(`Gemini API Error (${response.status}):`, errText);
            res.write(`data: ${JSON.stringify({ error: `Google API Error (${response.status})` })}\n\n`);
            return res.end();
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const jsonStr = line.replace('data: ', '').trim();
                    if (!jsonStr) continue;

                    try {
                        const parsed = JSON.parse(jsonStr);
                        const textChunk = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
                        if (textChunk) {
                            res.write(`data: ${JSON.stringify({ text: textChunk })}\n\n`);
                        }
                    } catch (e) { }
                }
            }
        }

        res.write('data: [DONE]\n\n');
        res.end();
    } catch (err) {
        console.error('Serverless Function Error:', err);
        res.write(`data: ${JSON.stringify({ error: "Internal server error: " + err.message })}\n\n`);
        res.end();
    }
}