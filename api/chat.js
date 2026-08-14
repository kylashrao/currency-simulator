// api/chat.js
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

    // Ensure request method is POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { messages } = req.body || {};
    if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: 'Invalid or missing messages array.' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'GEMINI_API_KEY environment variable is missing on the server.' });
    }

    // Configure Server-Sent Events (SSE) streaming headers
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');

    // Knowledge base and behavioral prompt tailored for GlobalPay Simulator
    const systemInstruction = `You are GlobalPay Assistant, an expert AI support guide for GlobalPay Simulator (globalpay-sim.vercel.app).
Your goal is to assist users with questions about cross-border payment flows, mid-market FX exchange rates, hidden banking markups, wire transfer fees, and how to operate the GlobalPay simulator.

Key Knowledge Base:
- Platform Overview: GlobalPay Simulator is a free, data-driven financial utility designed for global freelancers, remote workers, and contractors to calculate true net take-home payouts by exposing hidden FX markup rates and intermediary fees.
- Simulator Functionality:
  * Send Volume & Currency Pair inputs.
  * Custom Variable Markup (%) & Fixed Intermediary Fee controls.
  * Simulation Waterfall Breakdown: Shows Initial Send Volume, Total Operational Deductions, Net Convertible Principal Amount, Wholesale FX Rate, and Net Take-Home Payout.
- Core Financial Concepts:
  * Interbank Mid-Market Rate: The midpoint wholesale exchange rate without retail markups.
  * Hidden Markups: Legacy banks and retail processors often advertise "zero fees" while sneaking in 1% to 5% markups on exchange rates.
- Available Blog Guides:
  * Wire Transfers (/blog/wire-transfers.html)
  * Foreign Currency Volatility (/blog/currency-volatility.html)
  * Neobanks vs. Legacy Retail Banks (/blog/neobanks-vs-retail.html)
- Support Email: kylash.rao@gmail.com

Tone & Style Guidelines:
- Direct, concise, helpful, and transparent.
- Use clear markdown formatting (bolding, bullet points) for readability.`;

    try {
        // Format conversation history for Gemini API
        const contents = messages.map(msg => ({
            role: msg.role === 'user' ? 'user' : 'model',
            parts: [{ text: msg.content }]
        }));

        // Query Gemini SSE streaming endpoint
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse&key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    system_instruction: { parts: [{ text: systemInstruction }] },
                    contents: contents
                })
            }
        );

        if (!response.ok) {
            const errData = await response.text();
            console.error('Gemini API Error:', errData);
            res.write(`data: ${JSON.stringify({ error: "Failed to connect to AI engine." })}\n\n`);
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
                    } catch (e) {
                        // Skip partial JSON chunks
                    }
                }
            }
        }

        // Stream completion signal
        res.write('data: [DONE]\n\n');
        res.end();
    } catch (err) {
        console.error('Serverless Function Error:', err);
        res.write(`data: ${JSON.stringify({ error: "Internal server error during streaming." })}\n\n`);
        res.end();
    }
}