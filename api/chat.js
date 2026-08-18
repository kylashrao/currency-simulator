// api/chat.js - GlobalPay Backend Proxy
export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

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

    const apiKey = (process.env.GEMINI_API_KEY || '').trim();
    if (!apiKey) {
        return res.status(200).json({ text: 'Error: GEMINI_API_KEY environment variable is missing in Vercel settings.' });
    }

    const rawHistory = body?.chatHistory || body?.messages || [];

    const contents = rawHistory.map(msg => {
        if (msg.parts) return msg;
        return {
            role: msg.role === 'user' ? 'user' : 'model',
            parts: [{ text: msg.content || msg.text || '' }]
        };
    });

    const systemInstructionText = `You are GlobalPay Assistant, an expert AI support guide for GlobalPay Simulator (globalpay-sim.vercel.app).
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
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    systemInstruction: { parts: [{ text: systemInstructionText }] },
                    contents: contents
                })
            }
        );

        const data = await response.json();

        if (!response.ok) {
            console.error("Google API Error:", data);
            const detail = data.error?.message || JSON.stringify(data);
            return res.status(200).json({ text: `Google API Error (${response.status}): ${detail}` });
        }

        const replyText = data.candidates?.[0]?.content?.parts?.[0]?.text || "No response generated.";
        return res.status(200).json({ text: replyText });

    } catch (err) {
        console.error('Serverless Function Error:', err);
        return res.status(200).json({ text: "Serverless Function Exception: " + err.message });
    }
}