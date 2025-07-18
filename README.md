# SimpleChat

**SimpleChat** is an ASP.NET Core MVC application that integrates real-time messaging with P2P file transfers using SignalR and WebRTC DataChannels. This README will guide you through the folder structure, architecture, control flow, and how each module connects—so you can understand, run, and contribute to the project.

---

## 📁 Folder Structure

```
SimpleChat/
├─ Controllers/
│   ├─ ChatController.cs         # Serves the chat page and handles chat-related MVC actions
│   └─ HomeController.cs         # Serves landing/home and privacy pages
│
├─ Hubs/
│   └─ ChatHub.cs                # SignalR Hub: broadcast, personal messaging, file-transfer signaling
│
├─ Models/
│   ├─ User.cs                   # Connected user representation
│   ├─ FileMetadata.cs           # Metadata payload for file transfers
│   └─ ErrorViewModel.cs         # Standard MVC error model
│
├─ Utils/
│   └─ Sanitizer.cs              # Sanitizes user messages against XSS
│
├─ Views/
│   ├─ Chat/
│   │   ├─ ChatPage.cshtml       # Main chat UI with message input, chatboxes, file controls
│   │   └─ Landing.cshtml        # Initial chat landing/login page
│   ├─ Home/
│   │   ├─ Index.cshtml          # Homepage
│   │   └─ Privacy.cshtml        # Privacy policy page
│   └─ Shared/
│       ├─ _ViewImports.cshtml
│       └─ _ViewStart.cshtml
│
├─ wwwroot/
│   ├─ css/site.css              # Global styles
│   ├─ lib/ …                    # Client libraries (e.g. SignalR client)
│   ├─ site.js                   # Bootstraps UI: connection start, DOMContentLoaded hooks
│   ├─ chat.js                   # **Messaging & UI Module** (SignalR events + DOM interactions)
│   └─ chatFunc.js               # **File-Transfer & Utilities Module**
│
├─ appsettings.json             # ASP.NET Core configuration
├─ Program.cs                    # Application entry point and DI setup
└─ SimpleChat.csproj             # Project manifest
```

---

## 🚀 Application Overview

SimpleChat delivers:

1. **Real-Time Chat**

   * Public broadcasts to the “room.”
   * Private 1:1 messages between users.

2. **Peer-to-Peer File Transfer**

   * Chunked, resumable transfers.
   * Pause, resume, cancel controls.
   * Local IndexedDB persistence for reliability.

3. **End-to-End Hybrid Encryption**

   * AES-GCM for payload confidentiality.
   * RSA-OAEP key wrap for AES keys.

Under the hood, **SignalR** carries signaling messages (offers, answers, ICE candidates, metadata), while **WebRTC DataChannels** carry encrypted file chunks directly between peers.

---

## 🔗 Control Flow & Module Responsibilities

### 1. Messaging & UI Module (`chat.js`)

* **Initialization (`site.js` + `chat.js`)**

  * Establishes a SignalR `HubConnection` to `/chat`.
  * Configures keep-alive and timeout intervals.

* **Event Handlers**

  * **`UpdateUserCount`**: Refreshes online user counter.
  * **`ReceiveMessage`**: Inserts system, broadcast, or personal messages into the correct chatbox.
  * **`DisconnectUser`**, **`DuplicateUser`**: Handles user departures and name collisions.

* **Sending Messages**

  * **`sendMessage()`** reads the active chatbox, sanitizes via `sanitizeMessage()`, checks size with `isMessageUnder24KB()`, then invokes either `broadcastMessage` or `personalMessage` on the hub.
  * Clears input and scrolls to bottom (`scrollToBottom()`).

* **UI Event Binding**

  * **Disconnect Button**: Hover toggles label and styling. Stores user name in `sessionStorage`.
  * **Username Click**: Switches visible chatbox (`roomchat` vs. `<user>Chat`), updates `.chatName`, and sets `receiverId` in `sessionStorage`.

* **File-Selection & Metadata**

  * File input change → create metadata (size, chunks, hash) → display UI element (`createTransferUI()`) → send metadata via SignalR (`SendFileMetadata`).

* **Transfer Controls**

  * **Pause/Resume** → `toggleTransfer()` sends a control packet over DataChannel.
  * **Cancel** → `cancelTransfer()` signals peer and tears down state.

### 2. File-Transfer & Utilities Module (`chatFunc.js`)

#### a) Key Management

* On load, generates an RSA-OAEP keypair: stores `_myPrivateKey` (in-memory) and public key (SPKI) in `sessionStorage`.

#### b) Packet & Encryption

* **`makePacket(meta, chunk)`**: Packs metadata + optional chunk, then attempts:

  1. AES-GCM encryption of the combined buffer.
  2. RSA-OAEP wrapping of the AES key with peer’s public key.

  * Falls back to plaintext on error.

* **`unwrapPacket(buffer)`**: Inverse of `makePacket()`: unwrap AES key, decrypt, parse metadata and chunk.

#### c) Transfer State & Concurrency

* Global **`transfers`** object tracks each file’s state: offsets, paused/canceled flags, UI references.
* **`TransferManager`** class: queues multiple files, limits concurrent chunk sends (default 3), and calls `sendNextChunk()`.

#### d) Chunked Sending (`sendNextChunk()`)

* **Initialization**: sets `_offset`, `_idx`, calculates buffer threshold (`getBufferThreshold()`), sends SOF packet. Enables UI controls.
* **Flow Control**: waits on `waitForDrain()` when `dataChannel.bufferedAmount` exceeds threshold.
* **Chunk Send**: slices file Blob by `CHUNK_SIZE`, encrypts slice, `dataChannel.send()`, updates progress & stats.
* **Completion**: on `_offset >= file.size`, updates UI, cleans state, and frees memory.

#### e) Chunked Receiving (`receiveChunk()`)

* Decrypts/unpacks packet, then:

  * **SOF**: initialize receive counters, UI controls.
  * **chunk**: saves to IndexedDB (`saveChunk()`), updates progress, and if all chunks present, invokes `finalizeFile()`.
  * **Control**: processes pause/cancel signals.

* **`finalizeFile()`**: reassembles buffered chunks, verifies SHA‑256 hash, and publishes a temporary download link (expires in 2 minutes).

#### f) Helpers & Persistence

* IndexedDB helpers: `openDb()`, `saveChunk()`, `loadAllChunks()`, `clearChunks()`.
* Utilities: `computeHash()`, `sleep()`, `preTransferChecks()`, `detectMaxBufferedAmount()`, `getBufferThreshold()`, `waitForDrain()`, `getEffectiveElapsedMs()`, `formatETA()`, `formatFileSize()`.

---

## 🛠️ Setup & Running

```bash
# Clone repository
git clone https://github.com/your-username/SimpleChat.git
cd SimpleChat

# Restore dependencies & build
dotnet restore
dotnet build

# Run web server
dotnet run
```

Open your browser at `https://localhost:5140`. Use multiple tabs/windows to simulate multiple users. Test messaging, private chat, and file transfers.

---

## 🤝 Contributing

* Report bugs or suggest enhancements via GitHub Issues.
* PRs should include tests and docs updates.
* Follow existing code style and patterns.

---

*Happy chatting!* 🚀

