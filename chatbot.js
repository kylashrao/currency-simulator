// chatbot.js - GlobalPay AI Assistant Client
(function () {
    let chatHistory = [];
    let currentAgent = 'Chatbot';
    let isListening = false;
    let isProcessing = false;

    // 1. Web Speech API Setup
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    let recognition = null;

    if (SpeechRecognition) {
        recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.lang = 'en-US';

        recognition.onstart = () => {
            isListening = true;
            if (voiceBtn) voiceBtn.style.background = '#dc2626';
            if (inputEl) inputEl.placeholder = "AI Voice Agent is listening...";
        };

        recognition.onresult = (event) => {
            const userSpeech = event.results[0][0].transcript;
            inputEl.value = userSpeech;
            handleSend(true);
        };

        recognition.onerror = (err) => {
            console.warn("Speech recognition error:", err);
            resetMicUI();
        };

        recognition.onend = () => resetMicUI();
    }

    let activeUtterance = null;

    function unlockSpeechEngine() {
        if ('speechSynthesis' in window) {
            window.speechSynthesis.resume();
            const dummy = new SpeechSynthesisUtterance('');
            dummy.volume = 0;
            window.speechSynthesis.speak(dummy);
        }
    }

    function speak(text) {
        if (!('speechSynthesis' in window)) return;

        window.speechSynthesis.resume();
        window.speechSynthesis.cancel();

        const cleanText = text.replace(/[*#_`~]/g, '');

        activeUtterance = new SpeechSynthesisUtterance(cleanText);
        activeUtterance.rate = 1.0;
        activeUtterance.pitch = 1.0;

        const voices = window.speechSynthesis.getVoices();
        if (voices.length > 0) {
            const preferredVoice = voices.find(v => v.lang.includes('en') && (v.name.includes('Natural') || v.name.includes('Samantha') || v.name.includes('Google')));
            if (preferredVoice) activeUtterance.voice = preferredVoice;
        }

        activeUtterance.onend = () => { activeUtterance = null; };
        activeUtterance.onerror = () => { activeUtterance = null; };

        window.speechSynthesis.speak(activeUtterance);
    }

    function resetMicUI() {
        isListening = false;
        if (voiceBtn) voiceBtn.style.background = '#2563eb';
        if (inputEl) inputEl.placeholder = "Type a message...";
    }

    function stopActiveAudioAndVoice() {
        if ('speechSynthesis' in window) window.speechSynthesis.cancel();
        if (recognition && isListening) {
            try { recognition.stop(); } catch (e) { }
        }
        resetMicUI();
    }

    function setInputLock(locked) {
        isProcessing = locked;
        if (sendBtn) sendBtn.disabled = locked;
        if (voiceBtn) voiceBtn.disabled = locked;
        if (inputEl) inputEl.disabled = locked;
    }

    // 2. DOM Layout Insertion
    const launcherHtml = `
    <button id="gp-chat-launcher" aria-label="Open Chat">💬</button>
    <div id="gp-chat-window" class="gp-hidden">
        <div class="gp-chat-header" style="display:flex; justify-content:space-between; align-items:center;">
            <div class="gp-header-title" style="display:flex; align-items:center; gap:8px;">
                <span class="gp-status-dot" style="width:8px; height:8px; background-color:#22c55e; border-radius:50%; display:inline-block;"></span>
                <h4 style="margin:0; font-weight:600; font-size:15px; color:#fff;">GlobalPay Assistant</h4>
            </div>
            <div class="gp-header-actions">
                <button class="gp-chat-close" id="gp-close-btn">&times;</button>
            </div>
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
        <div class="gp-chat-footer" style="display:flex; gap:6px; align-items:center;">
            <input type="text" id="gp-chat-input" class="gp-chat-input" placeholder="Type a message..." />
            <button id="gp-voice-btn" type="button" style="background:#2563eb; color:#fff; border:none; padding:8px 10px; border-radius:6px; cursor:pointer; font-size:16px;">🎙️</button>
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
    const voiceBtn = document.getElementById('gp-voice-btn');

    // 3. Event Listeners
    voiceBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        unlockSpeechEngine();
        if (isProcessing) return;

        if (!recognition) {
            alert("Speech recognition is not supported on this browser context.");
            return;
        }

        if (isListening) {
            stopActiveAudioAndVoice();
            return;
        }

        stopActiveAudioAndVoice();
        currentAgent = 'Voice';
        windowEl.classList.remove('gp-hidden');

        try {
            recognition.start();
        } catch (err) {
            console.error("Mic start error:", err);
            resetMicUI();
        }
    });

    inputEl.addEventListener('focus', () => {
        if (currentAgent !== 'Chatbot' && !isProcessing) {
            stopActiveAudioAndVoice();
            currentAgent = 'Chatbot';
        }
    });

    launcher.addEventListener('click', () => {
        windowEl.classList.toggle('gp-hidden');
        if (!windowEl.classList.contains('gp-hidden') && currentAgent === 'Chatbot') inputEl.focus();
    });

    closeBtn.addEventListener('click', () => {
        stopActiveAudioAndVoice();
        windowEl.classList.add('gp-hidden');
    });

    chatBody.addEventListener('click', (e) => {
        if (isProcessing) return;
        if (e.target.classList.contains('gp-chip')) {
            const query = e.target.getAttribute('data-q');
            if (query) {
                stopActiveAudioAndVoice();
                currentAgent = 'Chatbot';
                inputEl.value = query;
                handleSend(false);
            }
        }
    });

    sendBtn.addEventListener('click', () => {
        if (isProcessing) return;
        stopActiveAudioAndVoice();
        currentAgent = 'Chatbot';
        handleSend(false);
    });

    inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !isProcessing) {
            stopActiveAudioAndVoice();
            currentAgent = 'Chatbot';
            handleSend(false);
        }
    });

    // 4. Send Message via Backend Serverless Proxy (/api/chat)
    async function handleSend(isVoiceTriggered = false) {
        if (isProcessing) return;

        const text = inputEl.value.trim();
        if (!text) return;

        if (isVoiceTriggered) currentAgent = 'Voice';

        setInputLock(true);
        appendMessage(text, 'user');
        inputEl.value = '';

        chatHistory.push({ role: 'user', content: text });

        const processingLabel = currentAgent === 'Voice'
            ? '🎙️ AI Voice Agent is processing...'
            : '💬 AI Chatbot Agent is processing...';

        const botMsgId = appendMessage(processingLabel, 'bot');
        const botMsgEl = document.getElementById(botMsgId);

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages: chatHistory })
            });

            const data = await response.json();

            if (!response.ok || data.error) {
                chatHistory.pop();
                botMsgEl.textContent = data.error || `Server Error (${response.status})`;
                return;
            }

            const replyText = data.text || data.reply || "No response received.";
            botMsgEl.textContent = replyText;
            chatBody.scrollTop = chatBody.scrollHeight;

            chatHistory.push({ role: 'assistant', content: replyText });

            if (currentAgent === 'Voice' || isVoiceTriggered) {
                speak(replyText);
            }
        } catch (err) {
            chatHistory.pop();
            console.error('Fetch Error:', err);
            botMsgEl.textContent = 'Network error. Unable to connect to backend.';
        } finally {
            setInputLock(false);
            if (currentAgent === 'Chatbot' && inputEl) {
                inputEl.focus();
            }
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