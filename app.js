import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

const socket = io();

// --- 1. SCENE SETUP ---
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
// We will set camera position when the player spawns

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// --- 2. THE MULTI-ROOM MAP & COLLISION ---
const matWhite = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
const matBlack = new THREE.MeshBasicMaterial({ color: 0x000000 });
const matCyan = new THREE.MeshBasicMaterial({ color: 0x00ffff });

const collidableWalls = []; // We will store solid walls here for collision

// HUGE 300x300 Floor & Roof
const floor = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), matWhite);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

const roof = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), matWhite);
roof.rotation.x = Math.PI / 2;
roof.position.y = 15;
scene.add(roof);

// Function to build solid walls easily
function createWall(w, h, d, x, y, z, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    scene.add(mesh);
    collidableWalls.push(mesh);
}

// Giant Black Border Walls (Enclosing the 300x300 arena)
createWall(300, 15, 2, 0, 7.5, -151, matBlack); // North
createWall(300, 15, 2, 0, 7.5, 151, matBlack);  // South
createWall(2, 15, 300, -151, 7.5, 0, matBlack); // West
createWall(2, 15, 300, 151, 7.5, 0, matBlack);  // East

// --- CYAN INNER ROOMS ---

// 1. Central Hub (A big room with 4 doorways)
createWall(30, 15, 2, 0, 7.5, -20, matCyan); // North wall
createWall(30, 15, 2, 0, 7.5, 20, matCyan);  // South wall
// West wall (split in two for a doorway)
createWall(2, 15, 12, -15, 7.5, -14, matCyan); 
createWall(2, 15, 12, -15, 7.5, 14, matCyan);  
// East wall (split in two for a doorway)
createWall(2, 15, 12, 15, 7.5, -14, matCyan);  
createWall(2, 15, 12, 15, 7.5, 14, matCyan);   

// 2. The Timeout Corner (For when someone's mic is too loud)
createWall(40, 15, 2, -60, 7.5, -80, matCyan);

// 3. South-East L-Shaped Room
createWall(50, 15, 2, 60, 7.5, 70, matCyan);
createWall(2, 15, 30, 85, 7.5, 85, matCyan);

// 4. Random Cover Pillars Scattered Around
createWall(10, 15, 10, -50, 7.5, 50, matCyan);
createWall(10, 15, 10, 50, 7.5, -50, matCyan);
createWall(8, 15, 8, -90, 7.5, 10, matCyan);
createWall(8, 15, 8, 90, 7.5, -10, matCyan);

// --- 3. PLAYER GENERATION (EMOTICON FACES) ---
const otherPlayers = {}; // Store other players' 3D meshes

// This magically draws text onto a 3D texture!
function createFaceTexture(colorHex, faceText, username) {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 256;
    const ctx = canvas.getContext('2d');
    
    // Background Color
    ctx.fillStyle = colorHex;
    ctx.fillRect(0, 0, 256, 256);
    
    // The Emoticon Face
    ctx.fillStyle = 'white';
    ctx.font = 'bold 80px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(faceText, 128, 140);

    // The Username above the face
    ctx.font = 'bold 24px monospace';
    ctx.fillText(username, 128, 40);

    return new THREE.CanvasTexture(canvas);
}

function addOtherPlayer(playerData) {
    const geometry = new THREE.BoxGeometry(4, 4, 4); // Blocky heads
    
    // We create an array of materials. Only the front face gets the emoticon texture.
    const blankMat = new THREE.MeshBasicMaterial({ color: playerData.color });
    const faceMat = new THREE.MeshBasicMaterial({ 
        map: createFaceTexture(playerData.color, playerData.face, playerData.name) 
    });
    
    const materials = [blankMat, blankMat, blankMat, blankMat, faceMat, blankMat];
    const mesh = new THREE.Mesh(geometry, materials);
    
    mesh.position.set(playerData.x, playerData.y, playerData.z);
    mesh.userData = { id: playerData.id };
    scene.add(mesh);
    otherPlayers[playerData.id] = mesh;
}

// --- 4. MULTIPLAYER NETWORKING ---
socket.on('current players', (players) => {
    Object.keys(players).forEach((id) => {
        if (id !== socket.id) addOtherPlayer(players[id]);
    });
});

socket.on('new player', (playerData) => {
    addOtherPlayer(playerData);
});

socket.on('player moved', (playerData) => {
    if (otherPlayers[playerData.id]) {
        otherPlayers[playerData.id].position.set(playerData.x, playerData.y, playerData.z);
    }
});

socket.on('player disconnected', (id) => {
    if (otherPlayers[id]) {
        scene.remove(otherPlayers[id]);
        delete otherPlayers[id];
    }
});

socket.on('player changed face', (data) => {
    if (otherPlayers[data.id]) {
        // Find the player's data from the server's master list (or reconstruct it)
        // To keep it simple, we just update the material array on their 3D mesh
        const mesh = otherPlayers[data.id];
        // The face is on material index 4
        mesh.material[4].map = createFaceTexture(mesh.material[0].color.getStyle(), data.face, "Player");
        mesh.material[4].needsUpdate = true; 
    }
});

// --- 5. LOBBY, CONTROLS & MIC ---
const controls = new PointerLockControls(camera, document.body);
const lobby = document.getElementById('lobby-container');
const joinBtn = document.getElementById('join-btn');
const pauseMenu = document.getElementById('pause-menu');
const chatContainer = document.getElementById('chat-container');

let analyser, dataArray;
let myColor = '#556B2F';
let myName = 'Anon';
let currentFace = 'O_O';

joinBtn.addEventListener('click', async () => {
    myName = document.getElementById('username').value || 'Anon';
    myColor = document.getElementById('head-color').value;

    lobby.style.display = 'none';
    chatContainer.style.display = 'block';
    
    // Spawn in a random spot
    camera.position.set((Math.random() - 0.5) * 40, 5, (Math.random() - 0.5) * 40);
    
    // Tell the server we are ready
    socket.emit('join game', { name: myName, color: myColor });
    controls.lock();

    if (!analyser) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const source = audioCtx.createMediaStreamSource(stream);
            analyser = audioCtx.createAnalyser();
            analyser.fftSize = 256;
            source.connect(analyser);
            dataArray = new Uint8Array(analyser.frequencyBinCount);
        } catch (err) {
            console.error("Mic denied:", err);
        }
    }
});

controls.addEventListener('unlock', () => { pauseMenu.style.display = 'block'; });
controls.addEventListener('lock', () => { pauseMenu.style.display = 'none'; });
pauseMenu.addEventListener('click', () => { controls.lock(); });

// --- 6. MOVEMENT & COLLISION (RAYCASTING) ---
const keys = { w: false, a: false, s: false, d: false };
const speed = 0.3;
const raycaster = new THREE.Raycaster();

window.addEventListener('keydown', (e) => {
    if (document.activeElement.id === 'chat-input') return;
    if (keys.hasOwnProperty(e.key.toLowerCase())) keys[e.key.toLowerCase()] = true;
});
window.addEventListener('keyup', (e) => {
    if (keys.hasOwnProperty(e.key.toLowerCase())) keys[e.key.toLowerCase()] = false;
});

// Check if we are going to hit a wall
function checkCollision(directionVector) {
    raycaster.set(camera.position, directionVector);
    const intersections = raycaster.intersectObjects(collidableWalls);
    return intersections.length > 0 && intersections[0].distance < 2; // 2 units buffer
}

// --- 7. CHAT ---
const form = document.getElementById('chat-form');
const input = document.getElementById('chat-input');
const messages = document.getElementById('messages');

form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (input.value) {
        socket.emit('chat message', input.value);
        input.value = '';
    }
});

socket.on('chat message', (data) => {
    const item = document.createElement('div');
    item.innerHTML = `<strong>${data.name}:</strong> ${data.text}`;
    messages.appendChild(item);
    messages.scrollTop = messages.scrollHeight;
});

// --- 7.5 WEAPONS: THE LASER PISTOL ---

function drawLaser(start, end, colorHex) {
    const material = new THREE.LineBasicMaterial({ color: colorHex });
    const points = [
        new THREE.Vector3(start.x, start.y - 0.5, start.z),
        new THREE.Vector3(end.x, end.y, end.z)
    ];
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const line = new THREE.Line(geometry, material);
    scene.add(line);

    setTimeout(() => { 
        scene.remove(line); 
        geometry.dispose(); 
        material.dispose(); 
    }, 100);
}

// Left-Click to shoot
window.addEventListener('mousedown', (e) => {
    if (controls.isLocked && e.button === 0) { 
        raycaster.setFromCamera(new THREE.Vector2(0,0), camera);
        
        // Combine walls AND other players into one array for hit detection
        const allTargets = [...collidableWalls, ...Object.values(otherPlayers)];
        const intersects = raycaster.intersectObjects(allTargets);
        
        let endPoint = new THREE.Vector3();
        
        if (intersects.length > 0) {
            endPoint = intersects[0].point;
            const hitObject = intersects[0].object;
            
            // Did we hit a floating head?!
            if (hitObject.userData && hitObject.userData.id) {
                socket.emit('player hit', hitObject.userData.id); // *PEW*!
            }
        } else {
            endPoint.copy(raycaster.ray.direction).multiplyScalar(200).add(raycaster.ray.origin);
        }

        drawLaser(camera.position, endPoint, 0xff0000);
        
        socket.emit('shoot laser', { 
            start: { x: camera.position.x, y: camera.position.y, z: camera.position.z }, 
            end: { x: endPoint.x, y: endPoint.y, z: endPoint.z } 
        });
    }
});

socket.on('enemy laser', (data) => {
    drawLaser(data.start, data.end, 0xff8800); 
});

// --- THE RESPAWN LOGIC ---
socket.on('respawn', () => {
    // We got hit! Teleport instantly to a random spot near the center
    camera.position.set((Math.random() - 0.5) * 40, 5, (Math.random() - 0.5) * 40);
    
    // Tell everyone we moved so our body disappears from where we got shot
    socket.emit('move', { x: camera.position.x, y: camera.position.y, z: camera.position.z });
});

// --- 8. ANIMATION LOOP ---
const direction = new THREE.Vector3();

function animate() {
    requestAnimationFrame(animate);
    
    if (controls.isLocked) {
        // Calculate the direction we want to move based on camera angle
        let moveX = 0, moveZ = 0;
        if (keys.w) moveZ -= speed;
        if (keys.s) moveZ += speed;
        if (keys.a) moveX -= speed;
        if (keys.d) moveX += speed;

        if (moveX !== 0 || moveZ !== 0) {
            // Apply collision check before moving
            direction.set(moveX, 0, moveZ).applyQuaternion(camera.quaternion).normalize();
            if (!checkCollision(direction)) {
                controls.moveRight(moveX);
                controls.moveForward(-moveZ);
            }
            
            // Tell the server where we moved so other players see us move
            socket.emit('move', { x: camera.position.x, y: camera.position.y, z: camera.position.z });
        }
    }

    // Audio Reactivity (Change emoticon based on volume!)
    if (analyser) {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for(let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        let averageVolume = sum / dataArray.length;
        
        let newFace = 'O_O';
        if (averageVolume > 60) newFace = 'X_X';
        else if (averageVolume > 20) newFace = 'O_o';
        else if (averageVolume > 5) newFace = '-_-';

 if (newFace !== currentFace) {
            currentFace = newFace;
            socket.emit('change face', currentFace); // Tell everyone!
            
            // Note: To see your OWN face change, we'd need a mirror or a 3rd person camera!
            // But right now, everyone else will see it happen perfectly.
        }
    }
    
    renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});