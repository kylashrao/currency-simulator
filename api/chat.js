// api/chat.js - GlobalPay Backend Proxy
export default async function handler(req, res) {
    // Enable CORS
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

    const apiKey = (process.env.GEMINI_API_KEY || '').trim();

    // Helper to send unified response across all potential frontend key expectations
    const sendResponse = (textResponse) => {
        return res.status(200).json({
            text: textResponse,
            reply: textResponse,
            message: textResponse,
            response: textResponse
        });
    };

    if (!apiKey) {
        return sendResponse('Configuration Error: GEMINI_API_KEY environment variable is missing on Vercel.');
    }

    const rawHistory = body?.chatHistory || body?.messages || [];

    // Normalize role formatting (Gemini API requires strictly 'user' or 'model')
    const contents = rawHistory.map(msg => {
        const role = (msg.role === 'user' || msg.sender === 'user') ? 'user' : 'model';
        const textContent = msg.text || msg.content || (msg.parts && msg.parts[0]?.text) || '';
        return {
            role: role,
            parts: [{ text: textContent }]
        };
    }).filter(item => item.parts[0].text.trim() !== '');

    // Fallback if conversation history is empty
    if (contents.length === 0 && body?.prompt) {
        contents.push({ role: 'user', parts: [{ text: body.prompt }] });
    }

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
- Support Email: kylash.rao@gmail.com`;

    // 7-second abort controller to force a response before Vercel times out
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 7000);

    try {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: controller.signal,
                body: JSON.stringify({
                    systemInstruction: { parts: [{ text: systemInstructionText }] },
                    contents: contents
                })
            }
        );

        clearTimeout(timeoutId);
        const data = await response.json();

        if (!response.ok) {
            console.error("Gemini API Error:", data);
            const detail = data.error?.message || "API request failed";
            return sendResponse(`API Error (${response.status}): ${detail}`);
        }

        const replyText = data.candidates?.[0]?.content?.parts?.[0]?.text || "No response generated.";
        return sendResponse(replyText);

    } catch (err) {
        clearTimeout(timeoutId);
        console.error('Serverless Execution Error:', err);
        const errMsg = err.name === 'AbortError' ? 'Connection timed out to Gemini API.' : err.message;
        return sendResponse(`Backend Error: ${errMsg}`);
    }
}