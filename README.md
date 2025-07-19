# SimpleChat

SimpleChat is a web-based chat application (live at [simplchat.azurewebsites.net](https://simplchat.azurewebsites.net/)) built on ASP.NET Core MVC. It offers real-time room chat and private messages, plus direct peer-to-peer file transfers— all from your browser. Think of it as a lightweight instant messenger: you join the room, see who’s online, exchange messages instantly, and share files securely, all without leaving the web page.

## 🔑 Key Features

* **Real-Time Chat**: Broadcast messages to the entire room or have one-to-one private conversations. Instant updates powered by SignalR.
* **P2P File Transfers**: Send files directly between browsers using WebRTC DataChannels—no heavy payloads on your server.
* **Resumable, Chunked Transfers**: Files are split into ~64 KB chunks, each encrypted, sent, and persisted in IndexedDB. Interrupted transfers resume without retransmitting completed chunks.
* **Pause / Resume / Cancel**: Full transfer control with UI buttons. Pause halts chunk sends, resume picks up at the correct offset, cancel tears down and cleans up state.
* **Hybrid Encryption**: AES-GCM encrypts file data; the AES key is wrapped by the recipient’s RSA-OAEP public key. Only the intended peer can unwrap and decrypt.
* **Safe Messaging**: All outgoing chat text is sanitized (via `sanitizeMessage()`) to strip invisible/control characters and prevent XSS, and validated to be under 24 KB (`isMessageUnder24KB()`).
* **Smooth UX**: Online user count, dynamic chat tabs (created on first private message), auto‑scroll, and a Disconnect button with hover confirmation.

> Why hybrid? SignalR ensures everyone sees chat events; WebRTC DataChannels ensure efficient, low‑latency file streams directly between browsers.

## 📁 Folder Structure & Components

```text
SimpleChat/
├─ Controllers/
│   ├── ChatController.cs       # MVC actions for login, join, and chat operations
│   └── HomeController.cs       # Landing, index, and privacy pages
│
├─ Hubs/
│   └── ChatHub.cs              # SignalR hub: broadcastMessage, personalMessage, file-transfer signaling, ICE and SDP RPCs
│
├─ Models/
│   ├── User.cs                 # Represents connected user details
│   ├── FileMetadata.cs         # Carries metadata: name, size, type, chunk count, hash
│   └── ErrorViewModel.cs       # Standard MVC error model
│
├─ Utils/
│   └── Sanitizer.cs            # Helper to clean incoming messages
│
├─ Views/
│   ├─ Chat/
│   │   ├── Landing.cshtml      # Username entry & join room
│   │   └── ChatPage.cshtml     # Chat UI: message input, chat windows, file controls
│   ├─ Home/
│   │   ├── Index.cshtml        # Homepage
│   │   └── Privacy.cshtml      # Privacy policy
│   └─ Shared/
│       ├── _ViewImports.cshtml
│       └── _ViewStart.cshtml
│
├─ wwwroot/
│   ├── css/site.css            # Global styles
│   ├── lib/…                   # Vendor libs (SignalR client, etc.)
│   ├── site.js                 # **Placeholder** (currently empty)
│   ├── chat.js                 # **Core Logic:** SignalR startup, event handlers, file-transfer orchestration, transfer UI rendering, initialization
│   └── chatfunc.js             # **UI Logic:** click handlers for tabs, hover effects
│
├─ appsettings.json             # Holds Azure SignalR connection string
├─ Program.cs                   # App startup, DI, routing, middleware
└── SimpleChat.csproj            # Project manifest
```

## 🔄 Application Flows

### ⚡ Messaging Flow

1. **Initialization** (`chat.js`)

   * On `DOMContentLoaded`, `connection.start()` opens a SignalR connection to `/chat` and captures the `connectionId`.
   * Store `connection.connectionId` as `sessionStorage.senderId`, set `sessionStorage.receiverId = 'room'`, and broadcast a system arrival message.

2. **Incoming Events** (`chat.js`)

   * `UpdateUserCount`: refreshes online user indicator.
   * `ReceiveMessage(user, message, type, connId, sConnId)`:

     * **system**: styled `.system` text appears in the room chat.
     * **broadcast**: `<div class="receiverMsg">` added to `.chatbox.roomchat` with `<span class="chat_username">{user} ~</span>`.
     * **personal**: if target chatbox exists, append there; else create new tab, register peer, then append.

3. **Sending Messages** (`sendMessage()` in `chat.js`)

   * Identify active chatbox (`.chatbox:not([hidden])`).
   * Sanitize via `sanitizeMessage()`, enforce size via `isMessageUnder24KB()`, drop empty/whitespace messages.
   * Locally inject `<div class='userMsg'>`, scroll, then invoke SignalR:

     * **Room**: `broadcastMessage(clientName, message, 'broadcast', '')`.
     * **Private**: fetch `rConnId` from `sessionStorage[receiverName]`, then `personalMessage(clientName, message, 'personal', rConnId, senderId)`.

4. **Tab Switching** (`chatfunc.js`)

   * Inline click listeners handle `.username` elements, toggling `.chatbox` visibility and updating `sessionStorage.receiverId`.

### 📂 File Transfer Flow

1. **Setup & Quota**

   * On load, reserve 50% of `navigator.deviceMemory` (or 1 GB fallback) as `sessionStorage.availableMemory`.
   * Select Files → validate `sessionStorage.receiverId` is a valid peer → for each file, generate key, call `createTransferUI()`.

2. **Metadata Exchange**

   * Compute `totalChunks`, `fileHash` (SHA‑256 via `computeHash()`), and populate metadata.
   * Send via `connection.invoke('SendFileMetadata', metadata)`.
   * On `ReceiveFileMetadata`, compare `metadata.fileSize` vs. `availableMemory`; on accept, deduct quota, setup RTCPeerConnection and `setupDataChannel()`, then `ConfirmTransfer`.

3. **Buffer‑Threshold Detection**

   * First chunk send uses `detectMaxBufferedAmount()` to determine ideal `maxBuffer` for the DataChannel via `getBufferThreshold()`.

4. **Chunk Sending** (`TransferManager`)

   * `sendNextChunk()` handles offsets, flow control (`waitForDrain(dataChannel, maxBuffer)`), slice → `makePacket()` → `dataChannel.send()`, and updates UI (`updateProgress()`, stats).
   * Honors `paused`/`canceled` flags, auto‑cancels on repeated drain timeouts.

5. **Chunk Receiving** (`receiveChunk()`)

   * `unwrapPacket()` decrypts (AES‑GCM + RSA‑OAEP) or falls back to plaintext JSON on failure.
   * **SOF**: store sender’s public key, init state.
   * **chunk**: persist via `saveChunk()`, update UI; on completion, call `finalizeFile()`.

6. **Finalization & Controls**

   * `finalizeFile()`: loads slices from IndexedDB, assembles Blob, verifies SHA‑256 via `computeHash()`, injects a 2‑minute-expiring download link, restores memory quota.
   * UI buttons (pause/resume/cancel), `<progress>` bar, speed/ETA (`formatETA()`), and status labels are enabled/disabled via `createTransferUI()` as state changes.

### 🔧 SignalR Hub Methods & Events

* **Client → Server RPCs**: `broadcastMessage`, `personalMessage`, `SendFileMetadata`, `ConfirmTransfer`, `SendIceCandidate`, `SendOffer`, `SendAnswer`.
* **Server → Client Events**: `ReceiveMessage`, `ReceiveFileMetadata`, `ReceiveIceCandidate`, `ReceiveOffer`, `ReceiveAnswer`, and disconnect notifications.

### 🛠️ Utilities

* `sanitizeMessage()`: strip control/XSS chars.
* `isMessageUnder24KB()`: enforce size limit.
* `computeHash()`: SHA‑256 hash of Blob.
* `detectMaxBufferedAmount()` / `getBufferThreshold()`: DataChannel buffer calibration.
* `formatFileSize()`, `formatETA()`, `sleep()`, and key‑import helpers.

## 🛠️ Setup & Running Locally

1. **Clone & Build**

   ```bash
   git clone https://github.com/DiscardedOne/SimpleChat.git
   cd SimpleChat
   dotnet restore && dotnet build
   ```
2. **Configure Azure SignalR**
   In `appsettings.json`:

   ```json
   "ConnectionStrings": { "AzureSignalREndpoint": "<YOUR_AZURE_SIGNALR_CONNECTION>" }
   ```
3. **Run**

   ```bash
   dotnet run
   ```

   App listens on [https://localhost:5140](https://localhost:5140).
4. **Test**
   Open multiple browsers/incognito sessions at [https://localhost:5140](https://localhost:5140), join with unique usernames, and test messaging/file transfers.

> Note: Even for local development you need an Azure SignalR instance (**free tier available**).

## 🤝 Contributing

Feel free to open issues or PRs. Follow existing C# & JavaScript styles, include tests/docs for new features, and use GitHub Issues for bug reports or enhancements.
We welcome contributions! Areas for improvement:

- Decentralized Local App: Remove dependency on WebSocket connectivity by creating a purely HTML/CSS/JS local-only version; maintain a hosted web version with SignalR fallback via ASP.NET Core MVC.
- Voice & Video Calling: Integrate real-time voice and video chat features using WebRTC audio/video streams.
- SessionStore Improvements:
	- Don’t store transient connectionId values in sessionStorage; use persistent User IDs instead.
	- Store the current chatbox (group or user) in a session-store key to avoid looping through all chatboxes.
	- Encrypt sessionStorage key names for enhanced security.
- Offline & Notifications:
	- Add message-read notifications and badges for unread messages.
	- Option to save or bookmark particular chat threads for quick access.
- Enhanced File Transfers:
	- Leverage the File System Access API for direct disk writes, reducing IndexedDB/RAM dependence.
	- Use TURN servers to improve peer connectivity and ensure reliable file transfers behind NATs.
	- In finalizeFile(), if a hash mismatch occurs, identify missing packets and request retransmission of only those chunks.

Please read our [Contributing Guidelines](https://github.com/DiscardedOne/SimpleChat/blob/main/CONTRIBUTING.md) before submitting pull requests.
 
Happy chatting & secure file sharing! 🚀
