var gui = require('nw.gui');
var win = gui.Window.get();
var isMac = require('os').platform() === 'darwin';
var assistant = null;
// win.showDevTools(); // uncomment if you want to debug

if (isMac) {
    document.title = '\u3000'; // to get around https://github.com/nwjs/nw.js/issues/3645
}

// don't let clippy.js add any handlers
$.fn.on = function() {};

var chatLog = document.getElementById('chat-log');
var chatForm = document.getElementById('chat-form');
var chatInput = document.getElementById('chat-input');
var apiKeyInput = document.getElementById('api-key');
var modelInput = document.getElementById('model');
var endpointInput = document.getElementById('endpoint');
var saveSettingsButton = document.getElementById('save-settings');

var settings = {
    apiKey: localStorage.getItem('clippy.ai.apiKey') || '',
    model: localStorage.getItem('clippy.ai.model') || 'gpt-4o-mini',
    endpoint: localStorage.getItem('clippy.ai.endpoint') || 'https://api.openai.com/v1/chat/completions'
};

apiKeyInput.value = settings.apiKey;
modelInput.value = settings.model;
endpointInput.value = settings.endpoint;

var conversation = [{
    role: 'system',
    content: 'You are Clippy, a playful but helpful desktop assistant. Keep responses concise.'
}];

function addMessage(role, text) {
    var messageEl = document.createElement('div');
    messageEl.className = 'message';

    var titleEl = document.createElement('strong');
    titleEl.textContent = role;

    var textEl = document.createElement('span');
    textEl.textContent = text;

    messageEl.appendChild(titleEl);
    messageEl.appendChild(textEl);
    chatLog.appendChild(messageEl);
    chatLog.scrollTop = chatLog.scrollHeight;
}

function saveSettings() {
    settings.apiKey = apiKeyInput.value.trim();
    settings.model = modelInput.value.trim() || 'gpt-4o-mini';
    settings.endpoint = endpointInput.value.trim() || 'https://api.openai.com/v1/chat/completions';

    localStorage.setItem('clippy.ai.apiKey', settings.apiKey);
    localStorage.setItem('clippy.ai.model', settings.model);
    localStorage.setItem('clippy.ai.endpoint', settings.endpoint);

    addMessage('system', 'AI settings saved.');
}

function speakAsClippy(text) {
    if (assistant) {
        assistant.stop();
        assistant.speak(text);
    }
}

function requestAIReply() {
    return fetch(settings.endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + settings.apiKey
        },
        body: JSON.stringify({
            model: settings.model,
            messages: conversation
        })
    }).then(function(res) {
        if (!res.ok) {
            return res.text().then(function(body) {
                throw new Error('AI request failed (' + res.status + '): ' + body);
            });
        }

        return res.json();
    }).then(function(data) {
        if (!data.choices || !data.choices.length || !data.choices[0].message) {
            throw new Error('AI response did not include a message.');
        }

        return data.choices[0].message.content;
    });
}

chatForm.addEventListener('submit', function(event) {
    event.preventDefault();

    var userText = chatInput.value.trim();
    if (!userText) {
        return;
    }

    if (!settings.apiKey) {
        addMessage('system', 'Please add an API key in AI settings first.');
        speakAsClippy('Please add an API key first.');
        return;
    }

    addMessage('you', userText);
    conversation.push({ role: 'user', content: userText });
    chatInput.value = '';

    addMessage('clippy', 'Thinking...');

    requestAIReply().then(function(reply) {
        conversation.push({ role: 'assistant', content: reply });

        var pending = chatLog.querySelector('.message:last-child span');
        if (pending) {
            pending.textContent = reply;
        } else {
            addMessage('clippy', reply);
        }

        speakAsClippy(reply);
    }).catch(function(error) {
        var errorMessage = error && error.message ? error.message : 'Unknown AI error.';
        addMessage('system', errorMessage);
        speakAsClippy('Sorry, I hit an error talking to AI.');
    });
});

saveSettingsButton.addEventListener('click', saveSettings);

addMessage('system', 'Hi! Save your API settings, then start chatting with Clippy.');

// show clippy
clippy.load('Clippy', function(agent) {
    assistant = agent;
    agent.show();
    var intiialSpeechTimeoutId = setTimeout(function() {
        agent.speak('Need some help closing me? Try double-clicking...');
    }, 20000);

    var windowX = null;
    var windowY = null;
    setTimeout(function() {
        windowX = win.x;
        windowY = win.y;
    }, 250);

    // to be safe: use focus as a click handler kinda, to trigger animations. Blur when done so every click triggers
    // an animation
    win.on('focus', function() {
        agent.animate();
        win.blur();
    });

    // In case the OS doesn't support blurring, we'll just call animate every now and again anyway
    setInterval(function() {
        agent.animate();
    }, 12000);

    // Since double-clicking draggable areas triggers maximizing on some platforms, when tell the user double-clicking
    // closes clippy but actually we'll hide the window, unmaximize, resize back to the normal size and show again
    // with a speech bubble
    win.on('maximize', function() {
        document.body.classList.add('hidden');
        win.hide();
        if (intiialSpeechTimeoutId) {
            clearTimeout(intiialSpeechTimeoutId);
            intiialSpeechTimeoutId = null;
        }

        setTimeout(function() {
            win.unmaximize();
            win.resizeTo(gui.App.manifest.window.width, gui.App.manifest.window.height);
            win.moveTo(windowX, windowY);
        }, 250);

        setTimeout(function() {
            win.show();
            document.body.classList.remove('hidden');
            setTimeout(function() {
                agent.speak('Need some help?');
            }, 500);
        }, 2000);
    });
});
