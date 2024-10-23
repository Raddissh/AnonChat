// server.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    maxHttpBufferSize: 1e8   // 100 MB
});

// Serve static files (for the frontend)
app.use(express.static(path.join(__dirname, 'public')));

// Serve landing.html at the root URL '/'
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'landing.html'));
});

// Variables to manage users and rooms
let waitingUsers = [];  // Queue for users waiting to be connected
let roomCounter = 1;  // Room counter to assign unique room names

io.on('connection', (socket) => {
    console.log(`A user connected: ${socket.id}`);

    // Handle user data from the landing page
    socket.on('userData', (userData) => {
        const userInterests = userData.interests.split(',').map(item => item.trim());
        socket.userData = { gender: userData.gender, interests: userInterests };
        findPartner(socket);
    });

    // Handle "endChat" event when the user wants to end the current chat
    socket.on('endChat', () => {
        if (socket.partnerRoom) {
            io.to(socket.partnerRoom).emit('message', { sender: 'System', text: 'Your partner has ended the chat.' });
            leaveRoom(socket, true);  // End chat and purge the room
        }
    });

    // Handle "newChat" event when the user wants a new chat
    socket.on('newChat', () => {
        if (!socket.partnerRoom) {
            findPartner(socket);
        }
    });

    // Handle text messages and ensure they are sent only to the room
    socket.on('sendMessage', (message) => {
        if (socket.partnerRoom) {
            console.log(`Message from ${socket.id} in room ${socket.partnerRoom}:`, message.text);
            io.to(socket.partnerRoom).emit('message', { sender: socket.id, text: message.text });
        }
    });

    // Handle file uploads and ensure they are sent only to the room
    socket.on('sendFile', (fileData) => {
        if (socket.partnerRoom) {
            console.log(`File from ${socket.id} in room ${socket.partnerRoom}: ${fileData.name}`);
            fileData.sender = socket.id; // Add sender ID to file data
            io.to(socket.partnerRoom).emit('fileMessage', fileData);
        }
    });

    // Handle typing event
    socket.on('typing', (data) => {
        if (socket.partnerRoom) {
            socket.to(socket.partnerRoom).emit('displayTyping', data);
        }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        console.log(`A user disconnected: ${socket.id}`);
        leaveRoom(socket, false);
    });

    // Function to find a partner for a user
    function findPartner(socket) {
        // Remove the user from any existing waiting list
        waitingUsers = waitingUsers.filter(user => user.id !== socket.id);

        // Attempt to match with another available user
        if (waitingUsers.length > 0) {
            const partner = waitingUsers.shift(); // Get the next available user

            // Ensure the partner's socket is still connected
            const partnerSocket = io.sockets.sockets.get(partner.id);
            if (!partnerSocket) {
                console.log(`Partner socket ${partner.id} is no longer available.`);
                findPartner(socket);  // Try to find another partner
                return;
            }

            // Found a partner, pair them
            const roomName = `room-${roomCounter++}`;

            // Join the room for both users
            socket.join(roomName);
            partnerSocket.join(roomName);

            // Assign the room to both users
            socket.partnerRoom = roomName;
            partnerSocket.partnerRoom = roomName;

            // Inform both users they are connected
            socket.emit('newPartner');
            partnerSocket.emit('newPartner');

            console.log(`Paired ${socket.id} and ${partner.id} in ${roomName}`);
        } else {
            // No partner found, waiting for a match
            waitingUsers.push({ id: socket.id });
            console.log(`User ${socket.id} is waiting for a partner.`);
        }
    }

    // Function to handle leaving a room
    function leaveRoom(socket, purgeRoom) {
        if (socket.partnerRoom) {
            const roomName = socket.partnerRoom;
            socket.leave(roomName);
            socket.partnerRoom = null;

            if (purgeRoom) {
                // Notify and disconnect all members of the room
                const roomSockets = Array.from(io.sockets.adapter.rooms.get(roomName) || []);
                roomSockets.forEach((socketId) => {
                    const partnerSocket = io.sockets.sockets.get(socketId);
                    if (partnerSocket) {
                        partnerSocket.leave(roomName);
                        partnerSocket.partnerRoom = null;
                        partnerSocket.emit('message', { sender: 'System', text: 'The chat has ended.' });
                    }
                });
            }
        } else {
            // If the user is in the waiting queue, remove them
            waitingUsers = waitingUsers.filter(user => user.id !== socket.id);
        }
    }
});

// Start the server
server.listen(3000, () => {
    console.log('Server running on port 3000');
});