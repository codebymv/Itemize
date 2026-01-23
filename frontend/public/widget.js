/**
 * Itemize Chat Widget - Embeddable Script
 * This script creates a live chat widget on any website
 */
(function() {
  'use strict';

  // Widget configuration
  const WIDGET_VERSION = '1.0.0';
  const API_BASE = window.ITEMIZE_API_URL || 'https://itemize.cloud';
  const WS_BASE = window.ITEMIZE_WS_URL || API_BASE.replace('https://', 'wss://').replace('http://', 'ws://');
  
  // State
  let widgetKey = null;
  let config = null;
  let sessionToken = null;
  let messages = [];
  let isOpen = false;
  let isMinimized = false;
  let socket = null;
  let unreadCount = 0;
  let isAgentTyping = false;
  let visitorInfo = {};

  // DOM Elements
  let container = null;
  let widget = null;
  let chatWindow = null;
  let messagesContainer = null;
  let inputField = null;

  // CSS Styles
  const styles = `
    .itemize-chat-widget {
      position: fixed;
      z-index: 999999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    }
    .itemize-chat-widget.bottom-right { bottom: 20px; right: 20px; }
    .itemize-chat-widget.bottom-left { bottom: 20px; left: 20px; }
    .itemize-chat-widget.top-right { top: 20px; right: 20px; }
    .itemize-chat-widget.top-left { top: 20px; left: 20px; }

    .itemize-chat-button {
      width: 60px;
      height: 60px;
      border-radius: 50%;
      border: none;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform 0.2s, box-shadow 0.2s;
      position: relative;
    }
    .itemize-chat-button:hover {
      transform: scale(1.05);
      box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
    }
    .itemize-chat-button svg {
      width: 28px;
      height: 28px;
    }
    .itemize-chat-badge {
      position: absolute;
      top: -5px;
      right: -5px;
      background: #ef4444;
      color: white;
      font-size: 12px;
      font-weight: bold;
      min-width: 20px;
      height: 20px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0 6px;
    }

    .itemize-chat-window {
      position: absolute;
      bottom: 80px;
      width: 380px;
      max-width: calc(100vw - 40px);
      height: 520px;
      max-height: calc(100vh - 120px);
      background: white;
      border-radius: 16px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
      display: none;
      flex-direction: column;
      overflow: hidden;
    }
    .itemize-chat-widget.bottom-right .itemize-chat-window { right: 0; }
    .itemize-chat-widget.bottom-left .itemize-chat-window { left: 0; }
    .itemize-chat-window.open { display: flex; }

    .itemize-chat-header {
      padding: 16px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid #e5e7eb;
    }
    .itemize-chat-header-title {
      font-size: 16px;
      font-weight: 600;
      color: white;
    }
    .itemize-chat-header-subtitle {
      font-size: 12px;
      opacity: 0.9;
      color: white;
    }
    .itemize-chat-close {
      background: none;
      border: none;
      cursor: pointer;
      padding: 4px;
      border-radius: 4px;
      color: white;
      opacity: 0.8;
      transition: opacity 0.2s;
    }
    .itemize-chat-close:hover { opacity: 1; }
    .itemize-chat-close svg { width: 20px; height: 20px; }

    .itemize-chat-welcome {
      padding: 24px 20px;
      text-align: center;
      border-bottom: 1px solid #e5e7eb;
    }
    .itemize-chat-welcome-title {
      font-size: 20px;
      font-weight: 600;
      color: #111827;
      margin-bottom: 8px;
    }
    .itemize-chat-welcome-message {
      font-size: 14px;
      color: #6b7280;
    }

    .itemize-chat-form {
      padding: 20px;
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .itemize-chat-form input {
      width: 100%;
      padding: 12px 16px;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      font-size: 14px;
      outline: none;
      transition: border-color 0.2s;
      box-sizing: border-box;
    }
    .itemize-chat-form input:focus {
      border-color: var(--primary-color);
    }
    .itemize-chat-form button {
      width: 100%;
      padding: 12px 16px;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: opacity 0.2s;
      color: white;
    }
    .itemize-chat-form button:hover {
      opacity: 0.9;
    }
    .itemize-chat-form button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .itemize-chat-messages {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .itemize-chat-message {
      max-width: 80%;
      padding: 10px 14px;
      border-radius: 16px;
      font-size: 14px;
      line-height: 1.4;
      word-wrap: break-word;
    }
    .itemize-chat-message.visitor {
      align-self: flex-end;
      color: white;
      border-bottom-right-radius: 4px;
    }
    .itemize-chat-message.agent {
      align-self: flex-start;
      background: #f3f4f6;
      color: #111827;
      border-bottom-left-radius: 4px;
    }
    .itemize-chat-message.system {
      align-self: center;
      background: transparent;
      color: #9ca3af;
      font-size: 12px;
      font-style: italic;
    }
    .itemize-chat-typing {
      align-self: flex-start;
      padding: 12px 16px;
      background: #f3f4f6;
      border-radius: 16px;
      border-bottom-left-radius: 4px;
    }
    .itemize-chat-typing-dots {
      display: flex;
      gap: 4px;
    }
    .itemize-chat-typing-dots span {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #9ca3af;
      animation: itemize-typing 1.4s infinite ease-in-out both;
    }
    .itemize-chat-typing-dots span:nth-child(1) { animation-delay: -0.32s; }
    .itemize-chat-typing-dots span:nth-child(2) { animation-delay: -0.16s; }
    @keyframes itemize-typing {
      0%, 80%, 100% { transform: scale(0.6); opacity: 0.5; }
      40% { transform: scale(1); opacity: 1; }
    }

    .itemize-chat-input-area {
      padding: 12px 16px;
      border-top: 1px solid #e5e7eb;
      display: flex;
      gap: 8px;
      align-items: flex-end;
    }
    .itemize-chat-input {
      flex: 1;
      padding: 10px 14px;
      border: 1px solid #e5e7eb;
      border-radius: 20px;
      font-size: 14px;
      outline: none;
      resize: none;
      max-height: 120px;
      min-height: 40px;
      line-height: 1.4;
    }
    .itemize-chat-input:focus {
      border-color: var(--primary-color);
    }
    .itemize-chat-send {
      width: 40px;
      height: 40px;
      border: none;
      border-radius: 50%;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: opacity 0.2s;
    }
    .itemize-chat-send:hover { opacity: 0.9; }
    .itemize-chat-send:disabled { opacity: 0.5; cursor: not-allowed; }
    .itemize-chat-send svg { width: 20px; height: 20px; }

    .itemize-chat-branding {
      padding: 8px;
      text-align: center;
      font-size: 11px;
      color: #9ca3af;
      border-top: 1px solid #e5e7eb;
    }
    .itemize-chat-branding a {
      color: #6b7280;
      text-decoration: none;
    }
    .itemize-chat-branding a:hover {
      text-decoration: underline;
    }

    .itemize-chat-offline {
      padding: 20px;
      text-align: center;
      background: #fef3c7;
      border-radius: 8px;
      margin: 16px;
    }
    .itemize-chat-offline-icon {
      font-size: 32px;
      margin-bottom: 8px;
    }
    .itemize-chat-offline-message {
      font-size: 14px;
      color: #92400e;
    }

    @media (max-width: 480px) {
      .itemize-chat-window {
        width: calc(100vw - 20px);
        height: calc(100vh - 100px);
        bottom: 70px;
        right: 10px;
        left: 10px;
        border-radius: 12px;
      }
      .itemize-chat-button {
        width: 50px;
        height: 50px;
      }
    }
  `;

  // SVG Icons
  const icons = {
    chat: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg>',
    close: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    send: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>',
    minimize: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/></svg>'
  };

  // Initialize widget
  function init(key) {
    widgetKey = key;
    injectStyles();
    loadConfig();
  }

  // Inject CSS styles
  function injectStyles() {
    const styleEl = document.createElement('style');
    styleEl.textContent = styles;
    document.head.appendChild(styleEl);
  }

  // Load widget configuration
  async function loadConfig() {
    try {
      const response = await fetch(`${API_BASE}/api/chat-widget/public/config/${widgetKey}`);
      if (!response.ok) {
        console.error('Itemize Chat: Widget not found or inactive');
        return;
      }
      config = await response.json();
      renderWidget();
      
      // Auto-open after delay if configured
      if (config.auto_open_delay > 0) {
        setTimeout(() => {
          if (!isOpen) toggleChat();
        }, config.auto_open_delay * 1000);
      }
    } catch (error) {
      console.error('Itemize Chat: Failed to load widget config', error);
    }
  }

  // Render the widget
  function renderWidget() {
    container = document.createElement('div');
    container.className = `itemize-chat-widget ${config.position || 'bottom-right'}`;
    container.style.setProperty('--primary-color', config.primary_color || '#3B82F6');
    
    container.innerHTML = `
      <div class="itemize-chat-window" id="itemize-chat-window">
        <div class="itemize-chat-header" style="background: ${config.primary_color}">
          <div>
            <div class="itemize-chat-header-title">${config.name || 'Chat'}</div>
            <div class="itemize-chat-header-subtitle">${config.is_online ? 'Online' : 'Offline'}</div>
          </div>
          <button class="itemize-chat-close" onclick="window.ItemizeChat.toggle()">${icons.close}</button>
        </div>
        <div id="itemize-chat-content"></div>
        ${config.show_branding ? '<div class="itemize-chat-branding">Powered by <a href="https://itemize.cloud" target="_blank">Itemize</a></div>' : ''}
      </div>
      <button class="itemize-chat-button" style="background: ${config.primary_color}; color: ${config.text_color}" onclick="window.ItemizeChat.toggle()">
        <span id="itemize-chat-icon">${icons.chat}</span>
        <span class="itemize-chat-badge" id="itemize-chat-badge" style="display: none;">0</span>
      </button>
    `;

    document.body.appendChild(container);
    chatWindow = document.getElementById('itemize-chat-window');
    
    // Load existing session or show form
    const existingSession = localStorage.getItem('itemize_chat_session');
    if (existingSession) {
      try {
        const sessionData = JSON.parse(existingSession);
        if (sessionData.widget_key === widgetKey) {
          sessionToken = sessionData.session_token;
          visitorInfo = sessionData.visitor_info || {};
          renderChatView();
          loadMessages();
          connectWebSocket();
          return;
        }
      } catch (e) {
        localStorage.removeItem('itemize_chat_session');
      }
    }
    
    renderPreChatForm();
  }

  // Render pre-chat form
  function renderPreChatForm() {
    const content = document.getElementById('itemize-chat-content');
    
    let formFields = '';
    if (config.require_name) {
      formFields += '<input type="text" id="itemize-visitor-name" placeholder="Your name" required>';
    }
    if (config.require_email) {
      formFields += '<input type="email" id="itemize-visitor-email" placeholder="Your email" required>';
    }
    if (config.require_phone) {
      formFields += '<input type="tel" id="itemize-visitor-phone" placeholder="Your phone">';
    }

    content.innerHTML = `
      <div class="itemize-chat-welcome">
        <div class="itemize-chat-welcome-title">${config.welcome_title || 'Hi there! 👋'}</div>
        <div class="itemize-chat-welcome-message">${config.welcome_message || 'How can we help you today?'}</div>
      </div>
      ${!config.is_online ? `
        <div class="itemize-chat-offline">
          <div class="itemize-chat-offline-icon">😴</div>
          <div class="itemize-chat-offline-message">${config.offline_message || 'We are currently offline.'}</div>
        </div>
      ` : ''}
      <div class="itemize-chat-form">
        ${formFields}
        <button id="itemize-start-chat" style="background: ${config.primary_color}">Start Chat</button>
      </div>
    `;

    document.getElementById('itemize-start-chat').addEventListener('click', startChat);
  }

  // Start chat session
  async function startChat() {
    const nameEl = document.getElementById('itemize-visitor-name');
    const emailEl = document.getElementById('itemize-visitor-email');
    const phoneEl = document.getElementById('itemize-visitor-phone');

    visitorInfo = {
      name: nameEl?.value || '',
      email: emailEl?.value || '',
      phone: phoneEl?.value || ''
    };

    // Validate
    if (config.require_name && !visitorInfo.name) {
      alert('Please enter your name');
      return;
    }
    if (config.require_email && !visitorInfo.email) {
      alert('Please enter your email');
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/api/chat-widget/public/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          widget_key: widgetKey,
          visitor_name: visitorInfo.name,
          visitor_email: visitorInfo.email,
          visitor_phone: visitorInfo.phone,
          current_page_url: window.location.href,
          referrer_url: document.referrer
        })
      });

      if (!response.ok) {
        const error = await response.json();
        alert(error.error || 'Failed to start chat');
        return;
      }

      const data = await response.json();
      sessionToken = data.session_token;
      
      // Save session
      localStorage.setItem('itemize_chat_session', JSON.stringify({
        widget_key: widgetKey,
        session_token: sessionToken,
        visitor_info: visitorInfo
      }));

      renderChatView();
      connectWebSocket();
      
      // Add welcome message
      if (!data.resumed) {
        messages.push({
          id: 'welcome',
          sender_type: 'system',
          content: `Welcome ${visitorInfo.name || 'Guest'}! An agent will be with you shortly.`,
          created_at: new Date().toISOString()
        });
        renderMessages();
      }
    } catch (error) {
      console.error('Itemize Chat: Failed to start session', error);
      alert('Failed to start chat. Please try again.');
    }
  }

  // Render chat view
  function renderChatView() {
    const content = document.getElementById('itemize-chat-content');
    content.innerHTML = `
      <div class="itemize-chat-messages" id="itemize-messages"></div>
      <div class="itemize-chat-input-area">
        <textarea class="itemize-chat-input" id="itemize-input" placeholder="${config.placeholder_text || 'Type your message...'}" rows="1"></textarea>
        <button class="itemize-chat-send" id="itemize-send" style="background: ${config.primary_color}; color: ${config.text_color}">${icons.send}</button>
      </div>
    `;

    messagesContainer = document.getElementById('itemize-messages');
    inputField = document.getElementById('itemize-input');

    // Auto-resize textarea
    inputField.addEventListener('input', () => {
      inputField.style.height = 'auto';
      inputField.style.height = Math.min(inputField.scrollHeight, 120) + 'px';
    });

    // Send on Enter (Shift+Enter for new line)
    inputField.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    // Typing indicator
    let typingTimeout;
    inputField.addEventListener('input', () => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'visitorTyping', sessionToken, isTyping: true }));
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
          socket.send(JSON.stringify({ type: 'visitorTyping', sessionToken, isTyping: false }));
        }, 1000);
      }
    });

    document.getElementById('itemize-send').addEventListener('click', sendMessage);
    
    renderMessages();
  }

  // Load messages
  async function loadMessages() {
    try {
      const response = await fetch(`${API_BASE}/api/chat-widget/public/messages/${sessionToken}`);
      if (response.ok) {
        messages = await response.json();
        renderMessages();
      }
    } catch (error) {
      console.error('Itemize Chat: Failed to load messages', error);
    }
  }

  // Render messages
  function renderMessages() {
    if (!messagesContainer) return;

    messagesContainer.innerHTML = messages.map(msg => {
      const typeClass = msg.sender_type === 'visitor' ? 'visitor' : msg.sender_type === 'system' ? 'system' : 'agent';
      const bgStyle = msg.sender_type === 'visitor' ? `background: ${config.primary_color}` : '';
      return `<div class="itemize-chat-message ${typeClass}" style="${bgStyle}">${escapeHtml(msg.content)}</div>`;
    }).join('');

    // Add typing indicator if agent is typing
    if (isAgentTyping) {
      messagesContainer.innerHTML += `
        <div class="itemize-chat-typing">
          <div class="itemize-chat-typing-dots">
            <span></span><span></span><span></span>
          </div>
        </div>
      `;
    }

    // Scroll to bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  // Send message
  async function sendMessage() {
    const content = inputField.value.trim();
    if (!content) return;

    // Add to UI immediately
    const tempMsg = {
      id: 'temp-' + Date.now(),
      sender_type: 'visitor',
      content,
      created_at: new Date().toISOString()
    };
    messages.push(tempMsg);
    renderMessages();
    inputField.value = '';
    inputField.style.height = 'auto';

    try {
      const response = await fetch(`${API_BASE}/api/chat-widget/public/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_token: sessionToken,
          content
        })
      });

      if (!response.ok) {
        // Remove temp message on error
        messages = messages.filter(m => m.id !== tempMsg.id);
        renderMessages();
        alert('Failed to send message');
      }
    } catch (error) {
      console.error('Itemize Chat: Failed to send message', error);
      messages = messages.filter(m => m.id !== tempMsg.id);
      renderMessages();
    }
  }

  // Connect to WebSocket
  function connectWebSocket() {
    try {
      socket = new WebSocket(WS_BASE);

      socket.onopen = () => {
        console.log('Itemize Chat: WebSocket connected');
        socket.send(JSON.stringify({
          type: 'joinChatSession',
          sessionToken
        }));
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'newChatMessage' && data.message) {
            // Don't add duplicate messages
            if (!messages.find(m => m.id === data.message.id)) {
              messages.push(data.message);
              renderMessages();
              
              // Update badge if window is closed
              if (!isOpen) {
                unreadCount++;
                updateBadge();
                playNotificationSound();
              }
            }
          } else if (data.type === 'agentTyping') {
            isAgentTyping = data.is_typing;
            renderMessages();
          }
        } catch (e) {
          console.error('Itemize Chat: Failed to parse WebSocket message', e);
        }
      };

      socket.onclose = () => {
        console.log('Itemize Chat: WebSocket closed, reconnecting...');
        setTimeout(connectWebSocket, 3000);
      };

      socket.onerror = (error) => {
        console.error('Itemize Chat: WebSocket error', error);
      };
    } catch (error) {
      console.error('Itemize Chat: Failed to connect WebSocket', error);
    }
  }

  // Toggle chat window
  function toggle() {
    isOpen = !isOpen;
    chatWindow.classList.toggle('open', isOpen);
    
    const iconEl = document.getElementById('itemize-chat-icon');
    iconEl.innerHTML = isOpen ? icons.minimize : icons.chat;
    
    if (isOpen) {
      unreadCount = 0;
      updateBadge();
      inputField?.focus();
    }
  }

  // Update notification badge
  function updateBadge() {
    const badge = document.getElementById('itemize-chat-badge');
    if (badge) {
      badge.style.display = unreadCount > 0 ? 'flex' : 'none';
      badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
    }
  }

  // Play notification sound
  function playNotificationSound() {
    if (config?.notification_sound === false) return;
    try {
      const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2teleXAscJXn8oFcCDmB28jJh1w1VZbe9pBRAhN1xbXAglhBWJHW64lJBhZvwbC7hFpMX5TU54pLChtxxq+6g1pOYZbU54hJCRxyyK66hFtPYpbT5ohJCh1yya26hFxQYpbT5ohJCx5zy624hV1RY5XT5YhKDB9zy624hV5RY5XT5YhKDR9zy624hV5RY5XT5YhKDh9zy624hV5RY5XT5YhKDx9zy624hV5RY5XT5YhKEB9zy624hV5RY5XT5YhKER9zy624hV5RY5XT5YhKEh9zy624hV5RY5XT5YhKEx9zy624hV5RY5XT5YhKFB9zy624hV5RY5XT5YhKFR9zy624hV5RY5XT5YhKFh9zy624hV5RY5XT5YhKFx9zy624hV5RY5XT5YhKGB9zy624hV5RY5XT5YhKGR9zy624hV5RY5XT5YhKGh9zy624hV5RY5XT5YhKGx9zy624hV5RY5XT5YhKHB9zy624hV5RY5XT5YhKHR9zy624hV5RY5XT5YhKHh9zy624hV5RY5XT5YhKHx9zy624hV5RY5XT5YhKIB9zy624hV5RY5XT5YhKIR9zy624hV5RY5XT5YhKIh9zy624hV5RY5XT5YhKIx9zy624hV5RY5XT5YhKJB9zy624hV5RY5XT5YhKJR9zy624hV5RY5XT5YhKJh9zy624hV5RY5XT5YhKJx9zy624hV5RY5XT5YhKKB9zy624hV5RY5XT5YhKKR9zy624hV5RY5XT5YhKKh9zy624hV5RY5XT5YhKKx9zy624hV5RY5XT5YhKLB9zy624hV5RY5XT5YhKLR9zy624hV5RY5XT5YhKLh9zy624hV5RY5XT5YhKLx9zy624hV5RY5XT5YhKMB9zy624hV5RY5XT5YhKMR9zy624hV5RY5XT5YhKMh9zy624hV5RY5XT5YhK');
      audio.volume = 0.3;
      audio.play().catch(() => {}); // Ignore errors (e.g., if user hasn't interacted)
    } catch (e) {}
  }

  // Escape HTML
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // End chat session
  async function endChat() {
    if (sessionToken) {
      try {
        await fetch(`${API_BASE}/api/chat-widget/public/end-session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_token: sessionToken })
        });
      } catch (e) {}
      
      localStorage.removeItem('itemize_chat_session');
      sessionToken = null;
      messages = [];
      
      if (socket) {
        socket.close();
        socket = null;
      }
      
      renderPreChatForm();
    }
  }

  // Public API
  window.ItemizeChat = {
    init,
    toggle,
    endChat,
    version: WIDGET_VERSION
  };

  // Process queued commands
  if (window.ichat && window.ichat.q) {
    window.ichat.q.forEach(args => {
      const cmd = args[0];
      if (cmd === 'init' && args[1]) {
        init(args[1]);
      }
    });
  }

  // Replace queue function with direct call
  window.ichat = function() {
    const args = Array.from(arguments);
    const cmd = args[0];
    if (cmd === 'init' && args[1]) {
      init(args[1]);
    }
  };
})();
