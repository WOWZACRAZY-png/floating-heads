// 1. Connect to the server
const socket = io();

// 2. Setup the 3D Scene, Camera, and Renderer
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x222222); // Dark grey background

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 3, 6); // Stand back and look down slightly

const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Add some light so we aren't in the dark
const light = new THREE.AmbientLight(0xffffff, 0.8);
scene.add(light);

// 3. Create the Arena Floor
const floorGeo = new THREE.PlaneGeometry(50, 50);
const floorMat = new THREE.MeshBasicMaterial({ color: 0x333333 }); // Dark floor
const floor = new THREE.Mesh(floorGeo, floorMat);
floor.rotation.x = -Math.PI / 2; // Lay it flat
scene.add(floor);

// 4. Create YOU (The Local Player)
const myGeo = new THREE.SphereGeometry(0.35, 32, 16);
const myMat = new THREE.MeshBasicMaterial({ color: 0x00ffff }); // You are Cyan!
const myPlayer = new THREE.Mesh(myGeo, myMat);
myPlayer.position.y = 0.35; // Sit perfectly on the floor
scene.add(myPlayer);

// 5. Track other players and our keyboard inputs
const otherPlayers = {};
const keys = { w: false, a: false, s: false, d: false, Shift: false };

document.addEventListener('keydown', (e) => {
    if (keys.hasOwnProperty(e.key)) keys[e.key] = true;
});

document.addEventListener('keyup', (e) => {
    if (keys.hasOwnProperty(e.key)) keys[e.key] = false;
});

// 6. Multiplayer Networking (Socket.io)
socket.on('currentPlayers', (players) => {
    for (let id in players) {
        if (id !== socket.id) addOtherPlayer(id, players[id]);
    }
});

socket.on('newPlayer', (playerInfo) => {
    addOtherPlayer(playerInfo.id, playerInfo);
});

socket.on('playerMoved', (playerInfo) => {
    if (otherPlayers[playerInfo.id]) {
        otherPlayers[playerInfo.id].position.set(playerInfo.x, playerInfo.y, playerInfo.z);
    }
});

socket.on('playerDisconnected', (id) => {
    if (otherPlayers[id]) {
        scene.remove(otherPlayers[id]);
        delete otherPlayers[id];
    }
});

function addOtherPlayer(id, playerInfo) {
    const geo = new THREE.SphereGeometry(0.35, 32, 16);
    const mat = new THREE.MeshBasicMaterial({ color: 0xff0000 }); // Enemies are Red!
    const enemy = new THREE.Mesh(geo, mat);
    
    enemy.position.set(playerInfo.x, playerInfo.y, playerInfo.z);
    scene.add(enemy);
    otherPlayers[id] = enemy; // Store them so we can move/delete them later
}

// 7. The Main Game Loop (Runs 60 times a second)
function animate() {
    requestAnimationFrame(animate);

    // Sprinting Logic! Normal speed is 0.1, Sprint is 0.25
    const speed = keys.Shift ? 0.25 : 0.1;
    let moved = false;

    // Movement
    if (keys.w) { myPlayer.position.z -= speed; moved = true; }
    if (keys.s) { myPlayer.position.z += speed; moved = true; }
    if (keys.a) { myPlayer.position.x -= speed; moved = true; }
    if (keys.d) { myPlayer.position.x += speed; moved = true; }

    // Make the camera follow you
    camera.position.x = myPlayer.position.x;
    camera.position.z = myPlayer.position.z + 6;

    // If we moved, tell the server so it can tell our friends!
    if (moved) {
        socket.emit('move', { 
            x: myPlayer.position.x, 
            y: myPlayer.position.y, 
            z: myPlayer.position.z 
        });
    }

    renderer.render(scene, camera);
}

// Start the game!
animate();
