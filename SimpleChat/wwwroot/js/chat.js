document.addEventListener("DOMContentLoaded", () => {
    scrollToBottom("roomchat");
});

/**
 * Chat Client using SignalR
 * Handles broadcast, personal, and system messages along with user session tracking.
 */

const connection = new signalR.HubConnectionBuilder().withUrl("/chat").build();

// Set custom SignalR intervals
connection.keepAliveIntervalInMilliseconds = 5000;
connection.serverTimeoutInMilliseconds = 20000;

let senderId;
let receiverId = "room";

connection.start().then(() => {
    const clientName = document.getElementById('clientName').textContent;
    const message = `- ${clientName} has arrived -`;
    senderId = connection.connectionId;
    sessionStorage.setItem('senderId', senderId);
    sessionStorage.setItem('receiverId', receiverId);

    connection.invoke('broadcastMessage', clientName, message, "system", senderId);
}).catch(err => console.error("There is error" + err.toString()));

connection.on("UpdateUserCount", (userCount) => {
    document.getElementById("onlineUserCount").textContent = userCount;
});

connection.on("ReceiveMessage", (user, message, type, connId, sConnId) => {
    const newMsg = document.createElement("div");
    newMsg.textContent = sanitizeMessage(message);

    if (type === "system") {
        if (newMsg.textContent.includes("has arrived")) {
            if (sessionStorage.getItem(user)) {
                connection.invoke("duplicateUser", connId);
                return;
            }
        }

        newMsg.classList.add("system");
        document.querySelector(".chatbox.roomchat").appendChild(newMsg);

        if (newMsg.textContent.includes("has arrived")) {
            sessionStorage.setItem(user, connId);
            const className = `${user}Chat`.replace(/\s/g, "");

            const newUser = document.createElement("div");
            newUser.textContent = user;
            newUser.classList.add("username", "m-2", "mb-3", "border-3");
            newUser.addEventListener('click', () => switchUserChat(user, className, newUser));

            const newChatBox = document.createElement("div");
            newChatBox.classList.add(className, "p-2", "bg-light", "chatbox");
            newChatBox.hidden = true;

            document.querySelector(".roomchat.chatbox").insertAdjacentElement('afterend', newChatBox);
            document.querySelector(".username.selected").insertAdjacentElement('afterend', newUser);
        }
    } else if (type === "broadcast") {
        newMsg.classList.add("receiverMsg");
        newMsg.innerHTML = `<span class="chat_username">${user} ~ </span>${newMsg.textContent}`;
        document.querySelector(".chatbox.roomchat").appendChild(newMsg);
    } else if (type === "personal") {
        const className = `${user}Chat`.replace(/\s/g, "");
        newMsg.classList.add("receiverMsg");

        let senderChat = document.querySelector(`.chatbox.${className}`);

        if (!senderChat) {
            sessionStorage.setItem(user, sConnId);
            const newUser = document.createElement("div");
            newUser.textContent = user;
            newUser.classList.add("username", "m-2", "mb-3", "border-3");
            newUser.addEventListener('click', () => switchUserChat(user, className, newUser));

            const newChatBox = document.createElement("div");
            newChatBox.classList.add(className, "p-2", "bg-light", "chatbox");
            newChatBox.hidden = true;

            document.querySelector(".roomchat.chatbox").insertAdjacentElement('afterend', newChatBox);
            document.querySelector(".username.selected").insertAdjacentElement('afterend', newUser);

            newChatBox.appendChild(newMsg);
        } else {
            senderChat.appendChild(newMsg);
        }
    }
});

connection.on("DisconnectUser", (user) => {
    if (!user || user === sessionStorage.getItem("name")) return;

    const userId = sessionStorage.getItem(user);
    if (!userId) return;

    if (sessionStorage.getItem("receiverId") === userId) {
        sessionStorage.setItem("receiverId", "room");
    }
    sessionStorage.removeItem(user);

    const newMsg = document.createElement("div");
    newMsg.textContent = `- ${user} has left -`;
    newMsg.classList.add("system", "disconnect");
    document.querySelector(".chatbox.roomchat").appendChild(newMsg);

    const className = `${user}Chat`.replace(/\s/g, "");
    const chatBox = document.querySelector(`.chatbox.${className}`);

    if (chatBox) {
        if (!chatBox.hasAttribute('hidden')) {
            chatBox.setAttribute('hidden', '');
            document.querySelector(".chatbox.roomchat").removeAttribute('hidden');
        }
        chatBox.remove();
    }

    document.querySelectorAll('.username').forEach(e => {
        if (e.textContent.includes(user)) {
            if (e.classList.contains('selected')) {
                e.classList.remove('selected');
                document.querySelectorAll('.username').forEach(thing => {
                    if (thing.textContent.includes("Room Chat")) thing.classList.add("selected");
                });
            }
            e.remove();
        }
    });
});

connection.on("DuplicateUser", async () => {
    disconnectClient();
    const newMsg = document.createElement("div");
    newMsg.textContent = "Username already exists, please login with a different username. Redirecting to Login Page in 10 seconds.";
    newMsg.classList.add("system", "disconnect");
    document.querySelector(".chatbox.roomchat").appendChild(newMsg);
    await sleep(10000);
    window.location.href = "/";
});

/**
 * Sends message to either room or private user depending on active chatbox
 */
function sendMessage() {
    const clientName = document.getElementById('clientName').textContent;
    const message = sanitizeMessage(document.getElementById('messageInput').value);

    if (!isMessageUnder24KB(message)) {
        alert("The message size cannot be greater than 24KB.");
        return;
    }

    if (message.trim().length === 0) return;

    document.querySelectorAll('.chatbox').forEach(chatbox => {
        if (!chatbox.hasAttribute('hidden')) {
            const chatType = chatbox.classList[0];

            const newMsg = document.createElement("div");
            newMsg.textContent = message;
            newMsg.classList.add("userMsg");
            chatbox.appendChild(newMsg);
            scrollToBottom(chatType);
            document.getElementById('messageInput').value = "";

            if (chatType === "roomchat") {
                connection.invoke('broadcastMessage', clientName, message, 'broadcast', "");
            } else if (chatType.includes("Chat")) {
                const receiverName = chatType.replace("Chat", "");
                const rConnId = sessionStorage.getItem(receiverName);
                const sConnId = connection.connectionId;
                connection.invoke('personalMessage', clientName, message, "personal", rConnId, sConnId);
            }
        }
    });
}

/**
 * Disconnect the current client from chat
 */
function disconnectClient() {
    const clientName = sessionStorage.getItem("name");
    sessionStorage.clear();
    connection.invoke("disconnectClient", clientName).catch(() => console.info("Connection closed."));
}

/**
 * Scrolls to bottom of chat
 * @param {string} chatName - CSS class of chatbox
 */
function scrollToBottom(chatName) {
    const chat = document.querySelector(`.chatbox.${chatName}`);
    chat.scrollTop = chat.scrollHeight;
}

/**
 * Strips control/invisible characters and normalizes message
 * @param {string} message
 * @returns {string}
 */
function sanitizeMessage(message) {
    return message
        .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F]/g, '') // Remove invisible chars
        .normalize('NFKC')
        .replace(/[^\t\n\r\x20-\x7E]/g, ''); // Strip control chars
}

/**
 * Checks if the given message is less than or equal to 24KB
 * @param {string} message
 * @returns {boolean}
 */
function isMessageUnder24KB(message) {
    const encoder = new TextEncoder();
    return encoder.encode(message).length <= 24576;
}

/**
 * Handles switching between chatboxes on user click
 * @param {string} user - Username to switch chat with
 * @param {string} className - Associated chatbox class
 * @param {HTMLElement} newUser - DOM element representing the user
 */
function switchUserChat(user, className, newUser) {
    const selected = document.querySelector('.username.selected');
    if (selected) selected.classList.remove('selected');

    newUser.classList.add('selected');

    document.querySelectorAll('.chatbox').forEach(chat => chat.setAttribute('hidden', ''));
    document.querySelector(`.${className}.chatbox`).removeAttribute('hidden');

    const chatN = document.querySelector(".chatName");
    chatN.textContent = user;
    sessionStorage.setItem("receiverId", sessionStorage.getItem(user));
}


/**
 * File Transfer Module
 * Handles chunked file transfers with RSA-OAEP encryption,
 * IndexedDB persistence, and concurrent transfer management.
 */

// ─────────────────────────── CONFIG ───────────────────────────
/** @constant {number} Size of each data chunk in bytes (64KB) */
const CHUNK_SIZE = 64 * 1024;
/** @constant {string} Name of the IndexedDB database */
const DB_NAME = 'fileTransfers';
/** @constant {string} Name of the object store for chunks */
const STORE_NAME = 'chunks';

// ───────────────────── KEY GENERATION ─────────────────────
/**
 * RSA-OAEP key pair generation for this client.
 * Exports the public key (SPKI) to base64 and stores in sessionStorage.
 * @async
 */
(async () => {
    const keyPair = await crypto.subtle.generateKey(
        {
            name: 'RSA-OAEP',
            modulusLength: 2048,
            publicExponent: new Uint8Array([1, 0, 1]),
            hash: 'SHA-256'
        },
        true,
        ['encrypt', 'decrypt']
    );

    _myPrivateKey = keyPair.privateKey;
    _myPublicKey = keyPair.publicKey;

    // Export public key (SPKI) and store in sessionStorage
    const spkiBuffer = await crypto.subtle.exportKey('spki', _myPublicKey);
    const spkiBase64 = btoa(String.fromCharCode(...new Uint8Array(spkiBuffer)));
    sessionStorage.setItem('myPublicKey', spkiBase64);
})();

// Private key references
let _myPrivateKey;
let _myPublicKey;

// ───────────────────── STATE STORAGE ─────────────────────
/**
 * In-memory transfers registry:
 * transfers[fileName] = { file, metadata, rtc, dataChannel,
 *   paused, canceled, progressElem, hash }
 */
const transfers = {};

// Initialize receiver memory quota (50% of device memory or fallback)
if (typeof navigator.deviceMemory === 'number') {
    const halfDeviceBytes = navigator.deviceMemory * 1024 ** 3 * 0.5;
    sessionStorage
        .setItem('availableMemory',
            sessionStorage.getItem('availableMemory') || halfDeviceBytes.toString());
} else {
    sessionStorage
        .setItem('availableMemory',
            sessionStorage.getItem('availableMemory') || (1024 ** 3).toString());
}

// ──────────── TRANSFER MANAGER CLASS ────────────
/**
 * Manages file transfer jobs with a concurrency limit.
 */
class TransferManager {
    /**
     * @param {number} [maxConcurrent=3] Maximum concurrent transfers
     */
    constructor(maxConcurrent = 3) {
        /** @private @type {string[]} */ this.queue = [];
        /** @private @type {number} */ this.activeCount = 0;
        /** @private @type {number} */ this.maxConcurrent = maxConcurrent;
    }

    /**
     * Enqueue a file transfer job.
     * @param {string} fileName Name of file to transfer
     */
    add(fileName) {
        this.queue.push(fileName);
        this._tryToRun();
    }

    /** @private Attempts to run queued jobs if under the concurrency limit */
    _tryToRun() {
        while (this.activeCount < this.maxConcurrent && this.queue.length) {
            const fileName = this.queue.shift();
            this._runJob(fileName);
        }
    }

    /**
     * @private
     * @param {string} fileName Name of file to process
     */
    async _runJob(fileName) {
        this.activeCount++;
        const t = transfers[fileName];

        const totalChunks = t?.metadata?.totalChunks || 0;
        const maxAttempts = Math.max(10, totalChunks * 10);
        let attempts = 0;

        try {
            let done = false;
            while (!done && !t.canceled) {
                if (t.paused) {
                    attempts = 0;
                    await sleep(200);
                    continue;
                }

                if (++attempts > maxAttempts) {
                    console.error(
                        `Transfer "${fileName}" stuck after ${attempts} attempts — cancelling.`
                    );
                    await cancelTransfer(fileName);
                    break;
                }

                done = await sendNextChunk(fileName);
            }
        } catch (error) {
            console.error(`Transfer job error for ${fileName}`, error);
        } finally {
            this.activeCount--;
            this._tryToRun();
        }
    }
}

// Global transfer manager instance
const transferManager = new TransferManager(3);

// ───────────────── INDEXEDDB HELPERS ─────────────────
/**
 * Opens (or upgrades) the IndexedDB and returns the database instance.
 * @returns {Promise<IDBDatabase>}
 */
async function openDb() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);

        request.onupgradeneeded = () => {
            request.result.createObjectStore(
                STORE_NAME,
                { keyPath: ['fileName', 'chunkIndex'] }
            );
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = (e) => reject(e.target.error);
    });
}

/**
 * Persists a chunk into IndexedDB.
 * @param {string} fileName
 * @param {number} chunkIndex
 * @param {ArrayBuffer|Uint8Array} data
 * @returns {Promise<void>}
 */
async function saveChunk(fileName, chunkIndex, data) {
    if (!fileName || chunkIndex == null || !data) {
        return Promise.reject(new Error('Invalid arguments to saveChunk'));
    }

    const db = await openDb();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put({ fileName, chunkIndex, data });

    return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = (e) => reject(e.target.error);
        tx.onabort = (e) => reject(tx.error);
    });
}

/**
 * Loads all chunks for a file from IndexedDB.
 * @param {string} fileName
 * @param {number} totalChunks
 * @returns {Promise<Array<(ArrayBuffer|Uint8Array)>>}
 */
async function loadAllChunks(fileName, totalChunks) {
    const db = await openDb();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const chunks = [];

    for (let i = 0; i < totalChunks; i++) {
        const data = await new Promise((res) => {
            store.get([fileName, i]).onsuccess = (e) =>
                res(e.target.result?.data);
        });
        chunks[i] = data;
    }

    return chunks;
}

/**
 * Clears all stored chunks for a given file.
 * @param {string} fileName
 * @returns {Promise<void>}
 */
async function clearChunks(fileName) {
    const db = await openDb();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.openCursor();

    request.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
            if (cursor.key[0] === fileName) store.delete(cursor.key);
            cursor.continue();
        }
    };

    return tx.complete;
}

/**
 * File Transfer UI Helpers
 * Responsible for creating and updating transfer UI elements,
 * handling file selection and sending metadata.
 */

// ───────────────────── UI HELPERS ─────────────────────
/**
 * Create and insert the transfer UI for a file.
 * @param {string} fileName - Unique name for the file transfer
 * @param {'sender'|'receiver'} host - Indicates who hosts the transfer UI
 * @returns {Object} References to created UI elements
 */
function createTransferUI(fileName, host) {
    const wrapper = document.createElement('div');
    wrapper.classList.add('transfer-container');
    if (host === 'sender') {
        wrapper.classList.add('userMsg');
    } else if (host === 'receiver') {
        wrapper.classList.add('receiverMsg');
    }

    wrapper.id = `transfer-${fileName}`;
    wrapper.innerHTML = `
        <div class="transfer-header">
            <span class="transfer-filename" title="File name">${fileName}</span>
            <span class="transfer-status">Click "Send"</span>
        </div>
        <progress class="transfer-progress" value="0" max="100"></progress>
        <div class="transfer-footer">
            <div class="transfer-info">
                <span class="transfer-speed">0 KB/s</span>
                <span class="transfer-eta">ETA: --</span>
            </div>
            <div class="transfer-controls">
                <button class="btn pause" data-action="pause" title="Pause transfer" disabled>⏸</button>
                <button class="btn resume" data-action="resume" title="Resume transfer" disabled>▶️</button>
                <button class="btn cancel" data-action="cancel" title="Cancel transfer" disabled>✖</button>
            </div>
        </div>
    `;

    // Insert UI into the active chatbox
    document.querySelectorAll('.chatbox').forEach((chatbox) => {
        if (!chatbox.hasAttribute('hidden') && chatbox.classList[0].includes('Chat')) {
            chatbox.appendChild(wrapper);
            scrollToBottom(chatbox.classList[0]);
            document.getElementById('messageInput').value = '';
        }
    });

    // Grab references to UI controls
    const progress     = wrapper.querySelector('progress');
    const btnPause     = wrapper.querySelector('.btn.pause');
    const btnResume    = wrapper.querySelector('.btn.resume');
    const btnCancel    = wrapper.querySelector('.btn.cancel');
    const status       = wrapper.querySelector('.transfer-status');
    const speedElem    = wrapper.querySelector('.transfer-speed');
    const etaElem      = wrapper.querySelector('.transfer-eta');

    // Wire up control button actions
    btnPause.onclick  = async () => await toggleTransfer(fileName, true);
    btnResume.onclick = async () => await toggleTransfer(fileName, false);
    btnCancel.onclick = async () => await cancelTransfer(fileName);

    return { wrapper, progress, btnPause, btnResume, btnCancel, status, speedElem, etaElem };
}

// ────────────────── PROGRESS UPDATES ──────────────────
/**
 * Update the numeric progress bar.
 * @param {string} fileName
 * @param {number} percent - Completion percentage (0–100)
 */
function updateProgress(fileName, percent) {
    const ui = transfers[fileName]?.ui;
    if (ui?.progress) {
        ui.progress.value = percent;
    }
}

/**
 * Update the status text in the transfer header.
 * @param {string} fileName
 * @param {string} statusText - New status message
 */
function updateProgressStatus(fileName, statusText) {
    const ui = transfers[fileName]?.ui;
    if (ui?.status) {
        ui.status.textContent = statusText;
    }
}

/**
 * Refresh transfer speed and ETA based on bytes transferred.
 * @param {string} fileName
 * @param {number} bytesTransferred
 */
function updateTransferStats(fileName, bytesTransferred) {
    const t = transfers[fileName];
    const elapsedMs = getEffectiveElapsedMs(fileName);
    if (!t || elapsedMs <= 0) return;

    const now = Date.now();
    t.sampleHistory.push({ t: now, b: bytesTransferred });

    // Prune old samples beyond window (e.g., 3s)
    const windowMs = 3000;
    while (t.sampleHistory.length > 1 && now - t.sampleHistory[0].t > windowMs) {
        t.sampleHistory.shift();
    }

    // Compute speed in bytes/sec
    const first = t.sampleHistory[0];
    const last  = t.sampleHistory[t.sampleHistory.length - 1];
    const deltaBytes = last.b - first.b;
    const deltaTime  = (last.t - first.t) / 1000;
    const speedBps   = deltaBytes / deltaTime;

    // Format and display speed
    const speedText = speedBps >= 1024 * 1024
        ? `${(speedBps / (1024 * 1024)).toFixed(2)} MB/s`
        : `${(speedBps / 1024).toFixed(1)} KB/s`;
    t.ui.speedElem.textContent = speedText;

    // Compute and display ETA
    const remainingBytes = t.metadata.fileSize - bytesTransferred;
    const etaSeconds     = speedBps > 0 ? remainingBytes / speedBps : Infinity;
    t.ui.etaElem.textContent = `ETA: ${formatETA(etaSeconds)}`;
}

// ───────── FILE SELECTION & METADATA HANDLING ─────────
/**
 * Trigger file selector dialog when "Select Files" clicked.
 */
document.getElementById('selectFiles').onclick = () => {
    document.getElementById('fileInput').click();
};

/**
 * Handle chosen files, set up transfer entries and UI.
 */
document.getElementById('fileInput').onchange = (e) => {
    Array.from(e.target.files).forEach((file) => {
        const receiverId = sessionStorage.getItem('receiverId');
        const senderId   = sessionStorage.getItem('senderId');

        if (receiverId === 'room' || receiverId === senderId) {
            const msg = document.createElement('div');
            msg.classList.add('system');
            msg.textContent = 'Cannot send file to Room / Self';
            document.querySelectorAll('.chatbox').forEach((chatbox) => {
                if (!chatbox.hasAttribute('hidden')) {
                    chatbox.appendChild(msg);
                    scrollToBottom(chatbox.classList[0]);
                }
            });
            return;
        }

        // Generate unique key per file transfer
        const timestamp = Date.now();
        const [base, ext] = file.name.split(/\.(?=[^\.]+$)/);
        const uniqueKey = `${base}-${timestamp}.${ext}`.replaceAll(' ', '_');

        // Initialize transfer state
        transfers[uniqueKey] = {
            file,
            paused: false,
            canceled: false,
            metadata: null
        };
        transfers[uniqueKey].ui = createTransferUI(uniqueKey, 'sender');
    });

    // Clear file input for future selections
    e.target.value = '';
};

/**
 * Send metadata for all pending transfers when "Send Files" clicked.
 */
document.getElementById('sendFiles').addEventListener('click', async () => {
    for (const fn in transfers) {
        const t = transfers[fn];
        if (t.metadata) continue;

        const totalChunks = Math.ceil(t.file.size / CHUNK_SIZE);
        t.metadata = {
            fileName: fn,
            fileSize: t.file.size,
            fileType: t.file.type,
            senderConnectionId: sessionStorage.getItem('senderId'),
            receiverConnectionId: sessionStorage.getItem('receiverId'),
            totalChunks,
            fileHash: await computeHash(t.file)
        };
        t.movedBytes = 0;

        if (!preTransferChecks(t.metadata, 'sending')) {
            delete transfers[fn];
            return;
        }

        updateProgressStatus(fn, 'Request Sent');
        await connection.invoke('SendFileMetadata', t.metadata);
    }
});

/**
 * SignalR Event Handlers & Peer Connection Setup
 * Manages negotiation, transfer confirmation, and data channels for file transfers.
 */

// ─────────────────── SIGNALR EVENT HANDLERS ───────────────────

/**
 * Handle incoming file metadata: memory checks and prompt user.
 */
connection.on('ReceiveFileMetadata', metadata => {
    // Pre-transfer validation for receiving
    if (!preTransferChecks(metadata, 'receiving')) {
        connection.invoke(
            'ConfirmTransfer',
            metadata.senderConnectionId,
            false,
            metadata.fileName,
            null
        );
        return;
    }
    
    // Check available memory quota
    const availableMem = Number(sessionStorage.getItem('availableMemory'));
    if (metadata.fileSize > availableMem) {
        declineDueToMemory(metadata);
        return;
    }

    // Prompt user to accept or decline
    showReceivePrompt(metadata);
});

/**
 * Handle transfer confirmation from receiver.
 */
connection.on(
    'TransferConfirmation',
    async (accepted, fileName, receiverPublicKey) => {
        if (!accepted) {
            handleDeclinedTransfer(fileName);
            return;
        }
        await initiatePeerTransfer(fileName, receiverPublicKey);
    }
);

/**
 * Receive SDP offer from remote peer.
 */
connection.on(
    'ReceiveOffer',
    async (sdp, remoteId, fileName) => {
        const pc = transfers[fileName].rpc;
        await pc.setRemoteDescription({ type: 'offer', sdp });
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        connection.invoke(
            'SendAnswer',
            remoteId,
            answer.sdp,
            sessionStorage.getItem('senderId'),
            fileName
        );
    }
);

/**
 * Receive SDP answer from remote peer.
 */
connection.on(
    'ReceiveAnswer',
    async (sdp, senderConnectionId, fileName) => {
        const pc = transfers[fileName].rpc;
        await pc.setRemoteDescription({ type: 'answer', sdp });
    }
);

/**
 * Receive ICE candidate from remote peer.
 */
connection.on(
    'ReceiveIceCandidate',
    async (candidate, senderConnectionId, fileName) => {
        const pc = transfers[fileName].rpc;
        await pc.addIceCandidate(JSON.parse(candidate));
    }
);

// ───────────── PEER CONNECTION & DATA CHANNEL SETUP ─────────────

/**
 * Create an RTCPeerConnection configured with public STUN servers.
 * @param {string} connId - Remote peer connection ID
 * @param {string} fileName - Associated file transfer key
 * @returns {RTCPeerConnection}
 */
function createPeerConnection(connId, fileName) {
    const config = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' },
            { urls: 'stun:stun4.l.google.com:19302' }
        ]
    };
    const pc = new RTCPeerConnection(config);

    // Forward local ICE candidates to SignalR hub
    pc.onicecandidate = event => {
        if (event.candidate) {
            connection.invoke(
                'SendIceCandidate',
                connId,
                JSON.stringify(event.candidate),
                sessionStorage.getItem('senderId'),
                fileName
            );
        }
    };

    return pc;
}

/**
 * Configure data channel event handlers for file transfer.
 * @param {string} fileName - Key for the transfer
 * @param {RTCDataChannel} dataChannel
 */
function setupDataChannel(fileName, dataChannel) {
    const t = transfers[fileName];
    t.dataChannel = dataChannel;

    // Initialize UI state
    updateTransferStats(fileName, t.movedBytes);
    updateProgressStatus(fileName, 'Waiting');

    // Enqueue transfer once channel opens
    dataChannel.onopen = () => transferManager.add(fileName);

    // Handle incoming chunks
    dataChannel.onmessage = async event => receiveChunk(fileName, event.data);
}

// ──────────────────── HELPER FUNCTIONS ────────────────────

/**
 * Append a system message and invoke decline due to low memory.
 * @param {Object} metadata
 */
function declineDueToMemory(metadata) {
    const { fileName, fileSize } = metadata;
    const shortName =
        fileName.length > 20
            ? `${fileName.slice(0, 10)}…${fileName.slice(-10)}`
            : fileName;

    const msg = document.createElement('div');
    msg.classList.add('system');
    msg.textContent =
        `Transfer declined: insufficient memory for ${shortName}`;

    document.querySelectorAll('.chatbox').forEach(cb => {
        if (!cb.hasAttribute('hidden')) {
            cb.appendChild(msg);
        }
    });

    connection.invoke(
        'ConfirmTransfer',
        metadata.senderConnectionId,
        false,
        metadata.fileName,
        null
    );
}

/**
 * Show accept/decline UI for incoming file.
 * @param {Object} metadata
 */
function showReceivePrompt(metadata) {
    const prompt = document.createElement('div');
    prompt.classList.add('transfer-prompt', 'receiverMsg');
    prompt.innerHTML = `
        <div class="file-info">
            <strong>Incoming file:</strong> ${metadata.fileName}<br>
            <strong>Size:</strong> ${formatFileSize(metadata.fileSize)}
        </div>
        <div class="button-group">
            <button class="acceptBtn">Accept</button>
            <button class="declineBtn">Decline</button>
        </div>
    `;

    document.querySelectorAll('.chatbox').forEach(cb => {
        if (!cb.hasAttribute('hidden')) {
            cb.appendChild(prompt);
            scrollToBottom(cb.classList[0]);
        }
    });

    // Accept transfer: reserve memory, set up state
    prompt.querySelector('.acceptBtn').addEventListener('click', () => {
        prompt.remove();
        const avail = Number(sessionStorage.getItem('availableMemory'));
        sessionStorage.setItem(
            'availableMemory',
            (avail - metadata.fileSize).toString()
        );

        transfers[metadata.fileName] = {
            file: null,
            metadata,
            paused: false,
            canceled: false
        };
        transfers[metadata.fileName].ui = createTransferUI(
            metadata.fileName,
            'receiver'
        );
        const rpc = createPeerConnection(
            metadata.senderConnectionId,
            metadata.fileName
        );
        transfers[metadata.fileName].rpc = rpc;
        rpc.ondatachannel = event =>
            setupDataChannel(metadata.fileName, event.channel);
        transfers[metadata.fileName].movedBytes = 0;

        connection.invoke(
            'ConfirmTransfer',
            metadata.senderConnectionId,
            true,
            metadata.fileName,
            sessionStorage.getItem('myPublicKey')
        );
    });

    // Decline transfer: notify sender
    prompt.querySelector('.declineBtn').addEventListener('click', () => {
        prompt.remove();
        connection.invoke(
            'ConfirmTransfer',
            metadata.senderConnectionId,
            false,
            metadata.fileName,
            null
        );
    });
}

/**
 * Handle a declined transfer on the sender side.
 * @param {string} fileName
 */
function handleDeclinedTransfer(fileName) {
    const msg = document.createElement('div');
    msg.classList.add('system');
    msg.textContent = 'Transfer Declined';

    document.querySelectorAll('.chatbox').forEach(cb => {
        if (!cb.hasAttribute('hidden')) {
            cb.appendChild(msg);
            scrollToBottom(cb.classList[0]);
        }
    });

    updateProgressStatus(fileName, 'Declined');
    setTimeout(() => delete transfers[fileName], 500);
}

/**
 * Initiate P2P transfer from sender after confirmation.
 * @param {string} fileName
 * @param {string|null} receiverPublicKey
 */
async function initiatePeerTransfer(fileName, receiverPublicKey) {
    const t = transfers[fileName];
    if (receiverPublicKey) {
        t.receiverPublicKey = receiverPublicKey;
    }

    t.rpc = createPeerConnection(
        t.metadata.receiverConnectionId,
        fileName
    );

    const offerChannel = t.rpc.createDataChannel(
        `file-${fileName}-${Date.now()}`
    );
    setupDataChannel(fileName, offerChannel);

    const offer = await t.rpc.createOffer();
    await t.rpc.setLocalDescription(offer);

    await connection.invoke(
        'SendOffer',
        t.metadata.receiverConnectionId,
        offer.sdp,
        sessionStorage.getItem('senderId'),
        fileName
    );
}

/**
 * SENDING CHUNKS
 *
 * Performs exactly one step of a chunked file transfer over a DataChannel.
 * Manages:
 *   1. First‑time initialization (offsets, buffer thresholds, SOF packet).
 *   2. Flow control via `bufferedAmount` and `bufferedamountlow` events.
 *   3. Cancellation and pause handling (including UI state updates).
 *   4. Sending fixed‑size `CHUNK_SIZE` slices, with progress/ETA updates.
 *   5. Final cleanup and “complete” UI when all bytes have been sent.
 *
 * @async
 * @param {string} fileName
 *   Unique identifier for the transfer (matches an entry in the global `transfers` object).
 * @returns {Promise<boolean>}
 *   Resolves to `true` if the transfer is now complete or was cancelled;
 *   `false` if more chunks remain (so the caller should invoke again).
 *
 * @example
 * // Repeatedly call until it returns `true`:
 * (async () => {
 *   let done = false;
 *   while (!done) {
 *     done = await sendNextChunk("myFileKey");
 *     // throttle to avoid busy‑loop:
 *     await sleep(10);
 *   }
 *   console.log("Transfer finished!");
 * })();
 */

async function sendNextChunk(fileName) {
    const t = transfers[fileName];
    const { file, metadata, dataChannel } = t;

    // Nothing to send if file not set
    if (!file) return true;

    // ───────── Initialization ─────────
    if (t._offset === undefined) {
        t._offset      = 0;
        t._idx         = 0;
        t.sampleHistory = [];

        // Determine buffer threshold
        if (t._MAX_BUFFER === undefined) {
            updateProgressStatus(fileName, 'Calculating');
            t._MAX_BUFFER = await getBufferThreshold(dataChannel, fileName);
            dataChannel.bufferedAmountLowThreshold = t._MAX_BUFFER * 0.5;
        }

        // Wait until channel opens
        if (dataChannel.readyState !== 'open') {
            await sleep(100);
            return false;
        }

        // Send Start-Of-File packet
        try {
            const sofBuf = await makePacket(
                { type: 'SOF', senderPublicKey: sessionStorage.getItem('myPublicKey'), filename: fileName },
                null
            );
            dataChannel.send(sofBuf);

            // Record timing and enable controls
            t.startTime      = Date.now();
            t.totalPausedTime = 0;
            t.pauseStart     = null;

            updateProgressStatus(fileName, 'Initiated');
            const btnPause  = t.ui.wrapper.querySelector('.btn.pause');
            const btnCancel = t.ui.wrapper.querySelector('.btn.cancel');
            if (btnPause)  btnPause.disabled  = false;
            if (btnCancel) btnCancel.disabled = false;

            return false;
        } catch (err) {
            console.error(`[Sender] Failed SOF for "${fileName}":`, err);
            updateProgressStatus(fileName, 'Error');
            return false;
        }
    }

    // ───────── Cancellation / Pause ─────────
    if (t.canceled) {
        updateProgressStatus(fileName, 'Canceled');
        t.dataChannel?.close();
        clearChunks(fileName);

        // Reset UI
        t.ui.progress.value = 0;
        t.ui.wrapper.querySelectorAll('.btn').forEach(btn => btn.disabled = true);

        setTimeout(() => delete transfers[fileName], 500);
        return true;
    }
    if (t.paused) {
        updateProgressStatus(fileName, 'Paused');
        return false;
    }

    // ───────── Completion Check ─────────
    if (t._offset >= file.size) {
        // Finalize UI
        updateProgress(fileName, 100);
        updateProgressStatus(fileName, 'Complete');

        const doneMsg = document.createElement('div');
        doneMsg.textContent = `${fileName} — sent successfully.`;
        doneMsg.classList.add(`transfer-${fileName}`);
        doneMsg.style.color = 'darkgreen';
        doneMsg.style.fontWeight = 'bold';

        t.ui.wrapper.innerHTML = '';
        t.ui.wrapper.appendChild(doneMsg);

        setTimeout(() => delete transfers[fileName], 500);
        return true;
    }

    // ───────── Flow Control ─────────
    try {
        if (!t._MAX_BUFFER) {
            console.error(`_MAX_BUFFER is ${t._MAX_BUFFER}`);
            await cancelTransfer(fileName);
            return true;
        }
        if (dataChannel.bufferedAmount > t._MAX_BUFFER) {
            await waitForDrain(dataChannel, t._MAX_BUFFER);
        }
    } catch (err) {
        console.warn('[Sender] Buffer drain timeout, retrying');
        await sleep(100);
        return false;
    }

    // ───────── Chunk Preparation ─────────
    const slice = file.slice(t._offset, t._offset + CHUNK_SIZE);
    const arr   = new Uint8Array(await slice.arrayBuffer());
    const chunkBuf = await makePacket(
        { type: 'chunk', sequenceId: t._idx, filename: fileName },
        arr
    );

    // ───────── Send Chunk ─────────
    try {
        if (t.canceled || dataChannel.readyState !== 'open') {
            await sleep(100);
            return false;
        }
        dataChannel.send(chunkBuf);
    } catch (err) {
        console.error(`[Sender] Failed chunk #${t._idx} for "${fileName}":`, err);
        updateProgressStatus(fileName, 'Error');
        return false;
    }

    // ───────── State & UI Updates ─────────
    t._offset    += CHUNK_SIZE;
    t._idx       += 1;
    t.movedBytes += chunkBuf.byteLength;

    updateProgressStatus(
        fileName,
        t.paused   ? 'Paused'
            : t.canceled ? 'Canceled'
                : 'In-Progress'
    );
    updateProgress(
        fileName,
        Math.floor((t._idx / metadata.totalChunks) * 100)
    );
    updateTransferStats(fileName, t.movedBytes);

    return false;
}



/**
 * RECEIVING CHUNKS & CONTROL OPERATIONS
 * Handles unpacking incoming packets, saving chunks, managing pause/cancel states,
 * finalizing file assembly, and toggling transfer flow.
 */

// ────────────────── RECEIVE CHUNKS ──────────────────
/**
 * Process one incoming packet for a file transfer.
 *
 * Unpacks the raw DataChannel payload—either encrypted via `makePacket` or
 * (legacy) JSON—and routes it based on `meta.type`:
 *   - `"SOF"`: start‑of‑file, initialize receive state & UI controls.
 *   - `"chunk"`: save to IndexedDB, update progress/ETA, and when all chunks
 *     are in, call `finalizeFile()`.
 *   - `"pause"` / `"cancel"`: toggle or terminate the receive flow.
 *   - `"bufferCalc"`: optional recalc of buffer threshold.
 *
 * @async
 * @param {string} fileName
 *   Unique key matching the transfer entry in the global `transfers` registry.
 * @param {ArrayBuffer|string} raw
 *   Raw payload from the DataChannel:
 *   • An `ArrayBuffer` built by `makePacket` (encrypted or plaintext).
 *   • A JSON string (legacy support).
 *
 * @example
 * // Called by dataChannel.onmessage:
 * dataChannel.onmessage = ({ data }) => {
 *   receiveChunk("myFileKey", data);
 * };
 */

async function receiveChunk(fileName, raw) {
    const t = transfers[fileName];
    if (!t) return;

    // Initialize started flag
    if (t.started === undefined) {
        t.started = false;
    }

    // Unwrap packet metadata and data
    let meta, dataChunk;
    if (raw instanceof ArrayBuffer) {
        ({ meta, chunk: dataChunk } = await unwrapPacket(raw));
    } else {
        // Legacy JSON fallback
        try {
            const packet = JSON.parse(raw);
            meta = packet;
            if (packet.data) {
                dataChunk = new Uint8Array(packet.data);
            }
        } catch {
            console.warn(`[Receiver] Invalid JSON for "${fileName}"`);
            return;
        }
    }

    // Handle packet types
    switch (meta.type) {
        case 'SOF':
            // Start-of-file: initialize transfer state and UI
            if (meta.senderPublicKey) {
                sessionStorage.setItem('senderPublicKey', meta.senderPublicKey);
            }
            t.started = true;
            t.receivedCount = 0;
            t.startTime = Date.now();
            t.totalPausedTime = 0;
            t.pauseStart = null;
            t.sampleHistory = [];

            updateTransferStats(fileName, t.movedBytes);
            updateProgressStatus(fileName, 'Initiated');

            // Enable pause & cancel buttons
            t.ui.wrapper.querySelectorAll('.btn.pause, .btn.cancel')
                .forEach(btn => btn.disabled = false);
            return;

        case 'chunk':
            // Data chunk: save and update progress
            if (!t.started) return;

            const { sequenceId } = meta;
            const arr = new Uint8Array(dataChunk);
            saveChunk(fileName, sequenceId, arr);

            t.receivedCount = (t.receivedCount || 0) + 1;

            // Update UI
            t.ui.wrapper.querySelectorAll('.btn.pause, .btn.cancel')
                .forEach(btn => btn.disabled = false);
            
            if(t.paused) t.ui.btnPause.disabled  = true;
            
            updateProgressStatus(
                fileName,
                t.paused   ? 'Paused'
                    : t.canceled ? 'Canceled'
                        : 'In-Progress'
            );
            updateProgress(
                fileName,
                Math.floor((t.receivedCount / t.metadata.totalChunks) * 100)
            );
            t.movedBytes += raw.byteLength;
            updateTransferStats(fileName, t.movedBytes);

            // Finalize if all chunks received
            if (t.receivedCount === t.metadata.totalChunks) {
                t.started = false;
                await finalizeFile(fileName);
            }
            return;

        case 'pause':
            // Pause/resume signal
            t.paused = meta.state;
            t.ui.btnPause.disabled  = t.paused;
            t.ui.btnResume.disabled = !t.paused;

            updateProgressStatus(fileName, t.paused ? 'Paused' : 'Resumed');

            if (t.paused) {
                t.pauseStart = Date.now();
            } else if (t.pauseStart) {
                t.totalPausedTime += Date.now() - t.pauseStart;
                t.pauseStart = null;
            }
            return;

        case 'cancel':
            // Cancel signal: cleanup state and UI
            t.paused = false;
            t.canceled = true;
            t.started = false;

            // Disable controls and reset progress
            t.ui.wrapper.querySelectorAll('.btn.pause, .btn.resume, .btn.cancel')
                .forEach(btn => btn.disabled = true);
            t.ui.progress.value = 0;
            updateProgressStatus(fileName, 'Canceled');

            // Close channel and clear storage
            t.dataChannel?.close();
            clearChunks(fileName);

            // Restore memory quota
            const restoreSize = t.metadata?.fileSize || 0;
            const newAvailable =
                Number(sessionStorage.getItem('availableMemory')) + restoreSize;
            sessionStorage.setItem('availableMemory', newAvailable.toString());

            setTimeout(() => delete transfers[fileName], 500);
            return;

        case 'bufferCalc':
            // Optional: recalc buffer
            updateProgressStatus(fileName, 'Calculating');
            return;

        default:
            // Unknown packet types are ignored
            console.warn(`[Receiver] Unknown packet type: ${meta.type}`);
    }
}

// ─────────────────── FINALIZATION ───────────────────
/**
 * Assemble file from stored chunks, verify integrity, and provide download link.
 *
 * 1. Disables any further pause/cancel controls.
 * 2. Loads all saved slices (0…N‑1) via `loadAllChunks()`.
 * 3. Concatenates into a single `Blob`, then computes its SHA‑256 via `computeHash()`.
 * 4. If the hash matches the sender’s metadata, displays a download `<a>` with a
 *    2‑minute expiry; otherwise shows an error status.
 * 5. Frees memory quota and cleans up the `transfers[fileName]` entry after completion.
 *
 * @async
 * @param {string} fileName
 *   Transfer key whose received slices should be assembled.
 *
 * @example
 * // Automatically invoked when receiveChunk sees all chunks:
 * await finalizeFile("myFileKey");
 */

async function finalizeFile(fileName) {
    const t = transfers[fileName];
    updateProgressStatus(fileName, 'Compiling');

    // Disable controls during compile
    t.ui.wrapper.querySelectorAll('.btn.pause, .btn.resume, .btn.cancel')
        .forEach(btn => btn.disabled = true);

    try {
        // Load chunks in order and create blob
        const rawChunks = await loadAllChunks(fileName, t.metadata.totalChunks);
        const blob = new Blob(rawChunks, { type: t.metadata.fileType });
        clearChunks(fileName);

        // Integrity check
        const hash = await computeHash(blob);
        if (hash !== t.metadata.fileHash) {
            console.error(
                `[Receiver] Hash mismatch for "${fileName}". ` +
                `Expected ${t.metadata.fileHash}, got ${hash}`
            );
            updateProgressStatus(fileName, 'Error');
            return;
        }

        // Prepare download link UI
        updateProgressStatus(fileName, 'Complete');
        updateProgress(fileName, 100);

        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = fileName;
        link.textContent = `${fileName} — [expires in 2 mins]`;
        link.title = 'Click to download';
        link.classList.add('download-link', `transfer-${fileName}`);
        link.style.display = 'block';
        link.style.color = 'darkgreen';
        link.style.fontWeight = 'bold';

        let freed = false;
        const expiry = setTimeout(() => {
            if (!freed) {
                const restore =
                    Number(sessionStorage.getItem('availableMemory')) + t.metadata.fileSize;
                sessionStorage.setItem('availableMemory', restore.toString());
                freed = true;
            }
            URL.revokeObjectURL(link.href);
            link.textContent = `${fileName} — [expired]`;
        }, 2 * 60 * 1000);

        // On-download handler: free memory early
        link.addEventListener('click', async () => {
            if (!freed) {
                const restore =
                    Number(sessionStorage.getItem('availableMemory')) + t.metadata.fileSize;
                sessionStorage.setItem('availableMemory', restore.toString());
                freed = true;
            }
            await sleep(100);
            URL.revokeObjectURL(link.href);
            link.textContent = `${fileName} — [expired]`;
            clearTimeout(expiry);
        });

        t.ui.wrapper.innerHTML = '';
        t.ui.wrapper.appendChild(link);
    } catch (e) {
        console.error(`[Receiver] Finalization error for "${fileName}":`, e);
    } finally {
        setTimeout(() => delete transfers[fileName], 500);
    }
}

// ──────────── PAUSE / RESUME / CANCEL CONTROLS ────────────
/**
 * Send a pause or resume signal to the sender for a given file.
 * @async
 * @param {string} fileName
 * @param {boolean} pause - true to pause, false to resume
 */
async function toggleTransfer(fileName, pause) {
    const t = transfers[fileName];
    if (!t?.dataChannel || t.dataChannel.readyState !== 'open') return;

    // Update local timing
    if (pause) {
        t.pauseStart = Date.now();
    } else if (t.pauseStart) {
        t.totalPausedTime += Date.now() - t.pauseStart;
        t.pauseStart = null;
    }

    try {
        const meta = { type: 'pause', state: pause, filename: fileName };
        const buf = await makePacket(meta, null);
        t.dataChannel.send(buf);

        t.paused = pause;
        t.ui.btnPause.disabled  = pause;
        t.ui.btnResume.disabled = !pause;
        updateProgressStatus(fileName, pause ? 'Paused' : 'Resumed');
    } catch (err) {
        console.error(`[Controller] toggleTransfer failed:`, err);
    }
}

/**
 * Send a cancel signal and clean up transfer state for a file.
 * @async
 * @param {string} fileName
 */
async function cancelTransfer(fileName) {
    const t = transfers[fileName];
    if (!t?.dataChannel || t.dataChannel.readyState !== 'open') return;

    try {
        const meta = { type: 'cancel', state: true, filename: fileName };
        const buf = await makePacket(meta, null);
        t.dataChannel.send(buf);

        // Local cleanup identical to receive 'cancel'
        t.paused = false;
        t.canceled = true;
        t.started = false;
        t.dataChannel.close();

        t.ui.wrapper.querySelectorAll('.btn.pause, .btn.resume, .btn.cancel')
            .forEach(btn => btn.disabled = true);
        t.ui.progress.value = 0;
        updateProgressStatus(fileName, 'Canceled');

        clearChunks(fileName);

        const restore = Number(sessionStorage.getItem('availableMemory')) + (t.metadata?.fileSize || 0);
        sessionStorage.setItem('availableMemory', restore.toString());

        setTimeout(() => delete transfers[fileName], 500);
    } catch (err) {
        console.error(`[Controller] cancelTransfer failed:`, err);
    }
}


/**
 * UTILITIES
 * Collection of helper functions for hashing, timing, buffer detection,
 * packet construction/deconstruction, and cryptographic key import.
 */

// ─────────────────── HASH & SLEEP ───────────────────
/**
 * Compute SHA-256 hash of a Blob and return hex string.
 * @async
 * @param {Blob} blob - The Blob object to hash.
 * @returns {Promise<string>} Hex-encoded SHA-256 digest.
 * @example
 * const blob = new Blob(["Hello, world!"], { type: 'text/plain' });
 * computeHash(blob).then(hash => console.log(hash));
 */
async function computeHash(blob) {
    const buffer = await blob.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(digest))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

/**
 * Pause execution for a given duration.
 * @param {number} ms - Milliseconds to sleep.
 * @returns {Promise<void>} Resolves after specified delay.
 * @example
 * await sleep(500); // pauses for 500ms
 */
function sleep(ms) {
    return new Promise(res => setTimeout(res, ms));
}

// ───────────────── TRANSFER PRECHECKS ─────────────────
/**
 * Validate preconditions for sending or receiving a transfer.
 * @param {Object} metadata - Transfer metadata containing connection IDs.
 * @param {'sending'|'receiving'} action - Action mode to check.
 * @returns {boolean} True if preconditions pass.
 * @example
 * const ok = preTransferChecks(metadata, 'sending');
 * if (!ok) alert('Cannot send!');
 */
function preTransferChecks(metadata, action) {
    const currentId = sessionStorage.getItem('receiverId');
    if (action === 'sending') {
        return metadata.receiverConnectionId === currentId;
    } else if (action === 'receiving') {
        return metadata.senderConnectionId === currentId;
    }
    return false;
}

// ───────────────── BUFFER THRESHOLD DETECTION ─────────────────
/**
 * Detect maximum buffered amount by sending test packets until stall.
 * @async
 * @param {RTCDataChannel} dc - DataChannel to test.
 * @param {string} filename - Identifier for logging.
 * @returns {Promise<number>} Detected max buffered byte count.
 * @example
 * const maxBuf = await detectMaxBufferedAmount(dc, 'testFile');
 * console.log('Max buffer:', maxBuf);
 */
async function detectMaxBufferedAmount(dc, filename) {
    const testChunk = new Uint8Array(64 * 1024);
    const meta = { type: 'bufferCalc', sequenceId: 1, filename };
    const packet = await makePacket(meta, testChunk);

    let sent = 0;
    try {
        while (sent <= 32 * 1024 * 1024) {
            dc.send(packet);
            sent += packet.byteLength;
            if (dc.bufferedAmount > 0) await sleep(0);
        }
    } catch {
        // Stop on error
    }
    return sent;
}

let bufferThresholdPromise = null;
const STORAGE_KEY = 'bufferThreshold';

/**
 * Get or compute buffer threshold (20% of max) once per session.
 * @async
 * @param {RTCDataChannel} dc - DataChannel to measure.
 * @param {string} filename - Identifier for session storage.
 * @returns {Promise<number>} BufferedAmountLowThreshold value.
 * @example
 * const threshold = await getBufferThreshold(dc, 'myFile');
 */
async function getBufferThreshold(dc, filename) {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored !== null) {
        return Number(stored);
    }
    if (!bufferThresholdPromise) {
        bufferThresholdPromise = (async () => {
            const maxBuf = await detectMaxBufferedAmount(dc, filename);
            const threshold = maxBuf * 0.2;
            sessionStorage.setItem(STORAGE_KEY, threshold.toString());
            return threshold;
        })();
    }
    return bufferThresholdPromise;
}

// ───────────────────𐄂 WAIT FOR DRAIN ───────────────────
/**
 * Await bufferedamountlow event or timeout before sending more data.
 * @async
 * @param {RTCDataChannel} dc - DataChannel in use.
 * @param {number} maxBuffer - Threshold to wait for.
 * @param {number} [timeoutMs=30000] - Max wait in ms.
 * @returns {Promise<void>} Resolves when buffer is drained.
 * @example
 * await waitForDrain(dc, threshold, 10000);
 */
async function waitForDrain(dc, maxBuffer, timeoutMs = 30000) {
    if (dc.bufferedAmount <= dc.bufferedAmountLowThreshold) return;
    return new Promise((resolve, reject) => {
        const onLow = () => {
            clearTimeout(timer);
            dc.removeEventListener('bufferedamountlow', onLow);
            resolve();
        };
        const timer = setTimeout(() => {
            dc.removeEventListener('bufferedamountlow', onLow);
            if (dc.bufferedAmount <= dc.bufferedAmountLowThreshold) resolve();
            else reject(new Error('waitForDrain timeout'));
        }, timeoutMs);
        dc.addEventListener('bufferedamountlow', onLow);
    });
}

// ─────────────────⏲ ELAPSED TIME & ETA ─────────────────
/**
 * Calculate elapsed ms excluding pause durations for a transfer.
 * @param {string} fileName - Transfer identifier.
 * @returns {number} Effective elapsed milliseconds.
 * @example
 * const elapsed = getEffectiveElapsedMs('myFile');
 */
function getEffectiveElapsedMs(fileName) {
    const t = transfers[fileName];
    if (!t?.startTime) return 0;
    const now = Date.now();
    const paused = t.pauseStart
        ? t.totalPausedTime + (now - t.pauseStart)
        : t.totalPausedTime || 0;
    return now - t.startTime - paused;
}

/**
 * Format seconds into human-friendly ETA string.
 * @param {number} seconds - Number of seconds.
 * @returns {string} ETA formatted (e.g., "1h 2m 3s").
 * @example
 * console.log(formatETA(3661)); // "1h 1m 1s"
 */
function formatETA(seconds) {
    if (seconds <= 0 || !isFinite(seconds)) return '--';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const parts = [];
    if (hrs) parts.push(`${hrs}h`);
    if (mins || hrs) parts.push(`${mins}m`);
    parts.push(`${secs}s`);
    return parts.join(' ');
}

// ─────────────—— PACKET CONSTRUCTION —————─────────────
/**
 * Hybrid-encrypt metadata+chunk or build plaintext packet on failure.
 * @async
 * @param {Object} meta - Packet metadata (type, sequenceId, filename, etc.).
 * @param {Uint8Array|null} [chunk=null] - Data chunk bytes or null.
 * @returns {Promise<ArrayBuffer>} ArrayBuffer of encrypted or plaintext packet.
 * @example
 * const packet = await makePacket({ type: 'chunk', sequenceId: 0, filename: 'f' }, chunkBytes);
 */
async function makePacket(meta, chunk = null) {
    const metaJson = JSON.stringify(meta || {});
    const metaBytes = new TextEncoder().encode(metaJson);
    const total = 4 + metaBytes.byteLength + (chunk?.byteLength || 0);
    const plain = new ArrayBuffer(total);
    const dv = new DataView(plain);
    const u8 = new Uint8Array(plain);
    dv.setUint32(0, metaBytes.byteLength);
    u8.set(metaBytes, 4);
    if (chunk) u8.set(chunk, 4 + metaBytes.byteLength);

    try {
        const aesKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, plain);
        const peerKeyB64 = transfers[meta.filename]?.receiverPublicKey || sessionStorage.getItem('senderPublicKey');
        if (!peerKeyB64) throw new Error('Missing publicKey');
        const pubKey = await importPublicKey(peerKeyB64);
        const rawAes = await crypto.subtle.exportKey('raw', aesKey);
        const wrapped = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, pubKey, rawAes);
        const outLen = 4 + wrapped.byteLength + iv.byteLength + cipher.byteLength;
        const out = new ArrayBuffer(outLen);
        const ov = new DataView(out);
        let off = 0;
        ov.setUint32(off, wrapped.byteLength); off += 4;
        new Uint8Array(out, off, wrapped.byteLength).set(new Uint8Array(wrapped)); off += wrapped.byteLength;
        new Uint8Array(out, off, iv.byteLength).set(iv); off += iv.byteLength;
        new Uint8Array(out, off).set(new Uint8Array(cipher));
        return out;
    } catch {
        console.warn('makePacket: encryption failed, sending plaintext');
        return plain;
    }
}

/**
 * Unwrap and decrypt a packet created by makePacket.
 * @async
 * @param {ArrayBuffer} packetBuf - Received packet buffer.
 * @returns {Promise<{meta:Object, chunk:Uint8Array}>} Parsed metadata and data chunk.
 * @example
 * const { meta, chunk } = await unwrapPacket(packetBuf);
 */
async function unwrapPacket(packetBuf) {
    let buf = packetBuf;
    try {
        const dv = new DataView(buf);
        let off = 0;
        const wrappedLen = dv.getUint32(off); off += 4;
        const wrappedKey = buf.slice(off, off + wrappedLen); off += wrappedLen;
        const iv = new Uint8Array(buf, off, 12); off += 12;
        const cipher = buf.slice(off);
        if (!_myPrivateKey) throw new Error('No privateKey');
        const rawAes = await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, _myPrivateKey, wrappedKey);
        const aesKey = await crypto.subtle.importKey('raw', rawAes, { name: 'AES-GCM' }, false, ['decrypt']);
        buf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, cipher);
    } catch {
        console.warn('unwrapPacket: using plaintext buffer');
    }

    try {
        const dv2 = new DataView(buf);
        const len = dv2.getUint32(0);
        const u8 = new Uint8Array(buf);
        const meta = JSON.parse(new TextDecoder().decode(u8.subarray(4, 4 + len)));
        const chunk = u8.subarray(4 + len);
        return { meta, chunk };
    } catch {
        console.error('unwrapPacket: parse failed');
        return { meta: {}, chunk: new Uint8Array() };
    }
}

// ───────────────── FORMAT FILE SIZE ─────────────────
/**
 * Convert bytes into a human‑readable string (B, KB, MB, GB).
 * @param {number} bytes - Number of bytes.
 * @returns {string} Formatted size string.
 * @example
 * console.log(formatFileSize(1024)); // "1.00 KB"
 */
function formatFileSize(bytes) {
    if (bytes < 1024)                return bytes + ' B';
    const kb = bytes / 1024;
    if (kb < 1024)                   return kb.toFixed(2) + ' KB';
    const mb = kb / 1024;
    if (mb < 1024)                   return mb.toFixed(2) + ' MB';
    const gb = mb / 1024;
    return gb.toFixed(2) + ' GB';
}

// ───────────────── KEY IMPORT ─────────────────
/**
 * Import a Base64 SPKI public key for RSA-OAEP encryption.
 * @async
 * @param {string} spkiB64 - Base64-encoded SPKI public key.
 * @returns {Promise<CryptoKey>} CryptoKey for encryption.
 * @example
 * const pubKey = await importPublicKey(spkiB64);
 */
async function importPublicKey(spkiB64) {
    const raw = Uint8Array.from(atob(spkiB64), c => c.charCodeAt(0));
    return crypto.subtle.importKey('spki', raw.buffer, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt']);
}

/**
 * Import a Base64 PKCS#8 private key for RSA-OAEP decryption.
 * @async
 * @param {string} pkcs8B64 - Base64-encoded PKCS#8 private key.
 * @returns {Promise<CryptoKey>} CryptoKey for decryption.
 * @example
 * const privKey = await importPrivateKey(pkcs8B64);
 */
async function importPrivateKey(pkcs8B64) {
    const raw = Uint8Array.from(atob(pkcs8B64), c => c.charCodeAt(0));
    return crypto.subtle.importKey('pkcs8', raw.buffer, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['decrypt']);
}



