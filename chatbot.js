// chatbot.js - GlobalPay AI Assistant Frontend Client
(function () {
    let chatHistory = [];

    // Inject Chat Widget DOM elements directly into document body
    const launcherHtml = `
    <button id="gp-chat-launcher" aria-label="Open Chat">💬</button>
    <div id="gp-chat-window" class="gp-hidden">
      <div class="gp-chat-header">
        <h4><span class="gp-status-dot"></span> GlobalPay Assistant</h4>
        <button class="gp-chat-close" id="gp-close-btn">&times;</button>
      </div>
      <div class="gp-chat-body" id="gp-chat-body">
        <div class="gp-msg gp-msg-bot">
          Hello! I'm your GlobalPay assistant. How can I help you analyze exchange rates, hidden transfer fees, or use our simulator today?
        </div>
        <div class="gp-suggestions">
          <button class="gp-chip" data-q="How does the simulator work?">How simulator works</button>
          <button class="gp-chip" data-q="What is the Mid-Market Rate?">What is Mid-Market Rate?</button>
          <button class="gp-chip" data-q="How do hidden bank margins work?">Hidden Bank Margins</button>
        </div>
      </div>
      <div class="gp-chat-footer">
        <input type="text" id="gp-chat-input" class="gp-chat-input" placeholder="Type your question..." />
        <button id="gp-send-btn" class="gp-chat-send">Send</button>
      </div>
    </div>
  `;

    document.body.insertAdjacentHTML('beforeend', launcherHtml);

    const launcher = document.getElementById('gp-chat-launcher');
    const windowEl = document.getElementById('gp-chat-window');
    const closeBtn = document.getElementById('gp-close-btn');
    const sendBtn = document.getElementById('gp-send-btn');
    const inputEl = document.getElementById('gp-chat-input');
    const chatBody = document.getElementById('gp-chat-body');

    // Toggle Chat Window Visibility
    launcher.addEventListener('click', () => {
        windowEl.classList.toggle('gp-hidden');
        if (!windowEl.classList.contains('gp-hidden')) {
            inputEl.focus();
        }
    });

    closeBtn.addEventListener('click', () => windowEl.classList.add('gp-hidden'));

    // Quick Suggestion Chips
    chatBody.addEventListener('click', (e) => {
        if (e.target.classList.contains('gp-chip')) {
            const query = e.target.getAttribute('data-q');
            if (query) {
                inputEl.value = query;
                handleSend();
            }
        }
    });

    // Event Listeners for Input Submission
    sendBtn.addEventListener('click', handleSend);
    inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleSend();
    });

    async function handleSend() {
        const text = inputEl.value.trim();
        if (!text) return;

        // Append User Message to UI
        appendMessage(text, 'user');
        inputEl.value = '';
        chatHistory.push({ role: 'user', content: text });

        // Append placeholder for real-time streaming response
        const botMsgId = appendMessage('...', 'bot');
        const botMsgEl = document.getElementById(botMsgId);

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages: chatHistory })
            });

            if (!response.ok) {
                botMsgEl.textContent = 'Sorry, there was an issue connecting to the AI assistant.';
                return;
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let accumulatedReply = '';
            let buffer = '';

            // Clear initial placeholder text
            botMsgEl.textContent = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const frames = buffer.split('\n\n');
                buffer = frames.pop() || '';

                for (const frame of frames) {
                    const trimmed = frame.trim();
                    if (trimmed.startsWith('data: ')) {
                        const payload = trimmed.replace('data: ', '').trim();

                        if (payload === '[DONE]') break;

                        try {
                            const parsed = JSON.parse(payload);
                            if (parsed.text) {
                                accumulatedReply += parsed.text;
                                botMsgEl.textContent = accumulatedReply;
                                chatBody.scrollTop = chatBody.scrollHeight;
                            } else if (parsed.error) {
                                botMsgEl.textContent = 'Error: ' + parsed.error;
                            }
                        } catch (e) {
                            // Ignore split chunk parse errors
                        }
                    }
                }
            }

            // Record full response in history context
            if (accumulatedReply) {
                chatHistory.push({ role: 'assistant', content: accumulatedReply });
            }
        } catch (err) {
            console.error('Streaming Network Error:', err);
            botMsgEl.textContent = 'Unable to connect to the GlobalPay server.';
        }
    }

    function appendMessage(content, sender) {
        const msgDiv = document.createElement('div');
        const id = 'msg-' + Date.now() + Math.random().toString(36).substr(2, 4);
        msgDiv.id = id;
        msgDiv.className = `gp-msg ${sender === 'user' ? 'gp-msg-user' : 'gp-msg-bot'}`;
        msgDiv.textContent = content;
        chatBody.appendChild(msgDiv);
        chatBody.scrollTop = chatBody.scrollHeight;
        return id;
    }
})();