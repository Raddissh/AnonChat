// app.js
const socket = io({
    maxHttpBufferSize: 1e8   // 100 MB
});
let unreadCount = 0;
let windowFocused = true;
let notificationSound;

// Elements
const chatBox = document.getElementById('chat-box');
const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');
const fileInput = document.getElementById('file-input');
const sendFileButton = document.getElementById('send-file-button');
const newChatButton = document.getElementById('new-chat');
const endChatButton = document.getElementById('end-chat');
const typingIndicator = document.getElementById('typing-indicator');

// Load user data from sessionStorage
const userGender = sessionStorage.getItem('userGender');
const userInterests = sessionStorage.getItem('userInterests');

// Initially disable chat inputs
disableChatInputs();

// Emit user data to the server after connecting
socket.on('connect', () => {
    if (userGender && userInterests) {
        socket.emit('userData', { gender: userGender, interests: userInterests });
    }
});

// Load the notification sound after user interaction
document.addEventListener('click', () => {
    if (!notificationSound) {
        notificationSound = new Audio('/sounds/notification.mp3');
    }
});

// Update UI elements based on chat state
function enableChatInputs() {
    messageInput.disabled = false;
    sendButton.disabled = false;
    fileInput.disabled = false;
    sendFileButton.disabled = false;
    endChatButton.disabled = false;
    newChatButton.disabled = true;
}

function disableChatInputs() {
    messageInput.disabled = true;
    sendButton.disabled = true;
    fileInput.disabled = true;
    sendFileButton.disabled = true;
    endChatButton.disabled = true;
    newChatButton.disabled = false;
}

// Function to send a message
function sendMessage() {
    const message = messageInput.value.trim();
    if (message !== '') {
        socket.emit('sendMessage', { text: message });
        messageInput.value = ''; // Clear the input field after sending
    }
}

// Handle sending messages with the Send button
sendButton.addEventListener('click', sendMessage);

// Handle pressing "Enter" to send messages
messageInput.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
        event.preventDefault(); // Prevent default form submit behavior
        sendMessage();
    }
});

// Handle file uploads and validate before sending
sendFileButton.addEventListener('click', () => {
    const file = fileInput.files[0];

    // Check if a file is selected
    if (!file) {
        alert('Please select a file to send.');
        return;
    }

    // Validate file type and size
    if (!validateFile(file)) return;

    // If validation passes, read and send the file
    const reader = new FileReader();
    reader.onloadend = () => {
        const fileData = {
            name: file.name,
            type: file.type,
            content: reader.result // base64 encoded
        };

        // Emit the file to the server
        socket.emit('sendFile', fileData);

        // Clear the file input
        fileInput.value = '';
    };

    // Read the file
    reader.readAsDataURL(file);
});

// Function to validate file before sending
function validateFile(file) {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'video/mp4', 'audio/mpeg'];
    const maxSize = 50 * 1024 * 1024; // 50MB max file size

    if (!allowedTypes.includes(file.type)) {
        alert('Invalid file type. Please upload an image (JPEG, PNG, GIF), video (MP4), or audio (MP3).');
        return false;
    }

    if (file.size > maxSize) {
        alert('File is too large. Maximum allowed size is 50MB.');
        return false;
    }

    return true;
}

// Show spinner while searching for a new chat partner
newChatButton.addEventListener('click', () => {
    if (messageInput.disabled) {
        socket.emit('newChat');
        chatBox.innerHTML = ''; // Clear chat box
    } else {
        alert('Please end the current chat before starting a new one.');
    }
});

// Event listener for "End Chat" button
endChatButton.addEventListener('click', () => {
    socket.emit('endChat');
    disableChatInputs();
    chatBox.innerHTML = ''; // Clear chat box
    appendMessage('You have ended the chat.', 'system-message');
});

// Listen for window focus and blur events
window.addEventListener('focus', () => {
    windowFocused = true;
    unreadCount = 0;
    document.title = 'Anon Chat';  // Reset the title when user returns
});

window.addEventListener('blur', () => {
    windowFocused = false;
});

// Listen for messages and distinguish between "You" and "Stranger"
socket.on('message', (data) => {
    if (data.sender === 'System') {
        appendMessage(data.text, 'system-message');
    } else {
        const sender = data.sender === socket.id ? 'You' : 'Stranger';
        const messageClass = sender === 'You' ? 'user-message' : 'stranger-message';
        appendMessage(`${sender}: ${data.text}`, messageClass);
    }
    playNotificationSound();
});

// Listen for files from the server
socket.on('fileMessage', (fileData) => {
    const sender = fileData.sender === socket.id ? 'You' : 'Stranger';
    const messageClass = sender === 'You' ? 'user-message' : 'stranger-message';
    displayMedia(sender, fileData, messageClass);
    playNotificationSound();
});

// Hide spinner when a new partner is found and start the chat
socket.on('newPartner', () => {
    chatBox.innerHTML = ''; // Clear chat box
    appendMessage('You are now connected to a random person!', 'system-message');
    enableChatInputs();
});

// Handle socket disconnection
socket.on('disconnect', () => {
    disableChatInputs();
    appendMessage('Disconnected from the server.', 'system-message');
});

// Function to append message to chat box
function appendMessage(message, messageClass = '') {
    const messageElement = document.createElement('div');
    messageElement.textContent = message;
    if (messageClass) {
        messageElement.classList.add(messageClass);
    }
    chatBox.appendChild(messageElement);
    chatBox.scrollTop = chatBox.scrollHeight; // Auto scroll to the bottom
}

// Function to display media in chat box
function displayMedia(sender, fileData, messageClass = '') {
    const mediaElement = document.createElement('div');
    if (messageClass) {
        mediaElement.classList.add(messageClass);
    }

    const senderElement = document.createElement('div');
    senderElement.textContent = `${sender}:`;
    mediaElement.appendChild(senderElement);

    if (fileData.type.startsWith('image/')) {
        const img = document.createElement('img');
        img.src = fileData.content;
        img.style.maxWidth = '200px';
        mediaElement.appendChild(img);
    } else if (fileData.type.startsWith('video/')) {
        const video = document.createElement('video');
        video.src = fileData.content;
        video.controls = true;
        video.style.maxWidth = '200px';
        mediaElement.appendChild(video);
    } else if (fileData.type.startsWith('audio/')) {
        const audio = document.createElement('audio');
        audio.src = fileData.content;
        audio.controls = true;
        mediaElement.appendChild(audio);
    }

    chatBox.appendChild(mediaElement);
    chatBox.scrollTop = chatBox.scrollHeight; // Auto scroll to the bottom
}

// Function to play notification sound
function playNotificationSound() {
    if (notificationSound) {
        notificationSound.play().catch(error => {
            console.error('Error playing notification sound:', error);
        });
    }
    if (!windowFocused) {
        unreadCount++;
        document.title = `(${unreadCount}) New message`;
    }
}

// Typing indicator implementation
let typing = false;
let timeout;

messageInput.addEventListener('input', () => {
    if (!typing) {
        typing = true;
        socket.emit('typing', { typing: true });
    }
    clearTimeout(timeout);
    timeout = setTimeout(stopTyping, 1000);
});

function stopTyping() {
    if (typing) {
        typing = false;
        socket.emit('typing', { typing: false });
    }
}

socket.on('displayTyping', (data) => {
    if (data.typing) {
        typingIndicator.style.display = 'block';
    } else {
        typingIndicator.style.display = 'none';
    }
});

// Emit typing false on disconnect to clear the typing indicator
socket.on('disconnect', () => {
    socket.emit('typing', { typing: false });
});