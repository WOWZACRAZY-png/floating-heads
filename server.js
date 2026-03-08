const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// This object will hold the data for every player in the arena
const players = {}; 

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // 1. When a player clicks "ENTER" in the lobby
    socket.on('join game', (userData) => {
        players[socket.id] = {
            id: socket.id,
            name: userData.name || 'Anonymous Head',
            color: userData.color || '#556B2F', // Default to a nice Olive Green
            face: 'O_O', // Default emoticon
            x: 0, y: 5, z: 0 // Starting spawn coordinates
        };

        // Send this new player the list of everyone already in the room
        socket.emit('current players', players);
        
        // Announce the new player to everyone else
        socket.broadcast.emit('new player', players[socket.id]);
    });

    // 2. When a player uses WASD, update their coordinates
    socket.on('move', (position) => {
        if (players[socket.id]) {
            players[socket.id].x = position.x;
            players[socket.id].y = position.y;
            players[socket.id].z = position.z;
            
            // Broadcast the new position to all other players
            socket.broadcast.emit('player moved', players[socket.id]);
        }
    });

    // Handle Face/Emoticon changes
    socket.on('change face', (newFace) => {
        if (players[socket.id]) {
            players[socket.id].face = newFace;
            socket.broadcast.emit('player changed face', { id: socket.id, face: newFace });
        }
    });
    
    // 3. Handle Chat (Now with Usernames!)
    socket.on('chat message', (msg) => {
        if (players[socket.id]) {
            io.emit('chat message', { name: players[socket.id].name, text: msg });
        }
    });

    // Handle Laser Pistol Shots
    socket.on('shoot laser', (beamData) => {
        // Broadcast the laser's start and end coordinates to everyone else
        socket.broadcast.emit('enemy laser', { 
            id: socket.id, 
            start: beamData.start, 
            end: beamData.end 
        });
    });

    // Handle a player getting *pew*ed
    socket.on('player hit', (targetId) => {
        // Tell the specific player who got hit to respawn!
        io.to(targetId).emit('respawn');
        
        // Announce the comical banishment in the chat
        if (players[socket.id] && players[targetId]) {
            io.emit('chat message', { 
                name: "SERVER", 
                text: `${players[socket.id].name} *pew*ed ${players[targetId].name} back to spawn!` 
            });
        }
    });

    // 4. Handle Disconnects
    socket.on('disconnect', () => {
        console.log('A head floated away:', socket.id);
        delete players[socket.id]; // Remove them from the master list
        io.emit('player disconnected', socket.id); // Tell clients to delete their 3D model
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
