// api/chat.js
export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

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
        return res.status(200).json({ error: 'GEMINI_API_KEY environment variable is missing on Vercel.' });
    }

    const systemInstruction = `You are GlobalPay Assistant, an expert AI support guide for GlobalPay Simulator (globalpay-sim.vercel.app).
Your goal is to assist users with questions about cross-border payment flows, mid-market FX exchange rates, hidden banking markups, wire transfer fees, and how to operate the GlobalPay simulator.

Key Knowledge Base:
- Platform Overview: GlobalPay Simulator calculates true net take-home payouts by exposing hidden FX markup rates and intermediary fees.
- Core Concepts: Interbank Mid-Market Rate is the midpoint wholesale exchange rate without retail markups.
- Available Blog Guides: Wire Transfers (/blog/wire-transfers.html), Foreign Currency Volatility (/blog/currency-volatility.html), Neobanks vs. Legacy Retail Banks (/blog/neobanks-vs-retail.html)
- Support Email: kylash.rao@gmail.com`;

    const contents = messages.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content || msg.text || '' }]
    }));

    try {
        // 1. Auto-discover active models for this API key
        let targetModel = 'models/gemini-1.5-flash';

        const listRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        if (listRes.ok) {
            const listData = await listRes.json();
            if (listData.models && listData.models.length > 0) {
                const validModels = listData.models.filter(m =>
                    m.supportedGenerationMethods?.includes('generateContent')
                );
                if (validModels.length > 0) {
                    const flashModel = validModels.find(m => m.name.includes('flash'));
                    targetModel = flashModel ? flashModel.name : validModels[0].name;
                }
            }
        }

        const modelPath = targetModel.startsWith('models/') ? targetModel : `models/${targetModel}`;

        // 2. Query content generation with auto-discovered model
        const generateUrl = `https://generativelanguage.googleapis.com/v1beta/${modelPath}:generateContent?key=${apiKey}`;

        const response = await fetch(generateUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                systemInstruction: { parts: [{ text: systemInstruction }] },
                contents: contents
            })
        });

        const data = await response.json();

        if (!response.ok) {
            console.error(`Gemini API Error (${response.status}):`, data);
            return res.status(200).json({ error: `Google API Error (${response.status}): ${data.error?.message || 'Request failed'}` });
        }

        const replyText = data.candidates?.[0]?.content?.parts?.[0]?.text || "No response generated.";
        return res.status(200).json({ text: replyText });

    } catch (err) {
        console.error('Serverless Function Error:', err);
        return res.status(200).json({ error: "Internal server error: " + err.message });
    }
}