// api/chat.js - GlobalPay Backend Proxy
export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const sendReply = (textStr) => {
        return res.status(200).json({
            text: textStr,
            reply: textStr,
            message: textStr,
            response: textStr
        });
    };

    try {
        let body = req.body;
        if (typeof body === 'string') {
            try { body = JSON.parse(body); } catch (e) { }
        }

        const apiKey = (process.env.GEMINI_API_KEY || '').trim();
        if (!apiKey) {
            return sendReply("Config Error: GEMINI_API_KEY environment variable is missing on Vercel.");
        }

        // Safely extract the prompt text from various frontend body structures
        const rawHistory = body?.chatHistory || body?.messages || [];
        let userMessage = body?.prompt || body?.message || body?.text || "";

        if (!userMessage && rawHistory.length > 0) {
            const lastItem = rawHistory[rawHistory.length - 1];
            userMessage = typeof lastItem === 'string'
                ? lastItem
                : (lastItem.text || lastItem.content || lastItem.parts?.[0]?.text || "");
        }

        if (!userMessage) {
            return sendReply("Please enter a question.");
        }

        const systemInstruction = `You are GlobalPay Assistant, an expert AI support guide for GlobalPay Simulator (globalpay-sim.vercel.app).
Your goal is to assist users with questions about cross-border payment flows, mid-market FX exchange rates, hidden banking markups, wire transfer fees, and how to operate the GlobalPay simulator.

Key Knowledge Base:
- Platform Overview: GlobalPay Simulator calculates true net take-home payouts by exposing hidden FX markup rates and intermediary fees.
- Core Concepts: Interbank Mid-Market Rate is the midpoint wholesale exchange rate without retail markups.
- Support Email: kylash.rao@gmail.com`;

        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

        const apiResponse = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                systemInstruction: { parts: [{ text: systemInstruction }] },
                contents: [{ role: 'user', parts: [{ text: userMessage }] }]
            })
        });

        const data = await apiResponse.json();

        if (!apiResponse.ok) {
            const errMsg = data.error?.message || `HTTP ${apiResponse.status}`;
            return sendReply(`Gemini API Error: ${errMsg}`);
        }

        const textOutput = data.candidates?.[0]?.content?.parts?.[0]?.text || "No response generated.";
        return sendReply(textOutput);

    } catch (err) {
        return sendReply(`Serverless Function Error: ${err.message}`);
    }
}