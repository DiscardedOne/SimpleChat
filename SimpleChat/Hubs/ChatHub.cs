using System.Collections.Concurrent;
using Microsoft.AspNetCore.SignalR;
using SimpleChat.Models;
using SimpleChat.Utils;

namespace SimpleChat.Hubs
{
    public class ChatHub: Hub
    {
        private static readonly ConcurrentDictionary<string, string> ConnectedUsers = new();
        private static int _userCount = 0;

        public override async Task OnConnectedAsync()
        {
            var userName = Context.User?.Identity?.Name ?? Context.ConnectionId;
            if (ConnectedUsers.TryAdd(Context.ConnectionId, userName))
            {
                int count = Interlocked.Increment(ref _userCount);
                //Console.WriteLine($"User {userName} connected, user count: {count}");
                await Clients.All.SendAsync("UpdateUserCount", count);
            }
            await base.OnConnectedAsync();
        }

        public override async Task OnDisconnectedAsync(Exception? exception)
        {
            if (ConnectedUsers.TryRemove(Context.ConnectionId, out var userName))
            {
                int count = Interlocked.Decrement(ref _userCount);
                //Console.WriteLine($"User {userName} disconnected, user count: {count}");
                await Clients.All.SendAsync("UpdateUserCount", count);
                await Clients.All.SendAsync("DisconnectUser", userName);
            }
            await base.OnDisconnectedAsync(exception);
        }
        
        public async Task broadcastMessage(string user, string message, string type, string connId = "")
        {
            //message = Sanitizer.SanitizeMessage(message);
            if(type == "system")
            {
                if(message.Contains("has arrived")) ConnectedUsers[Context.ConnectionId] = user;
                await Clients.All.SendAsync("ReceiveMessage", user, message, type, connId);
            }
            if (type == "broadcast")
            {
                List<string> excludedConnectionIds = new List<string> { Context.ConnectionId };
                await Clients.AllExcept(excludedConnectionIds).SendAsync("ReceiveMessage", user, message, type, connId);
            }
        }
        public async Task personalMessage(string user, string message, string type, string connId="", string sConnId = "")
        {
            //message = Sanitizer.SanitizeMessage(message);
            if(type == "personal")
            {
                if (connId == "") Console.WriteLine("connId is empty");
                else if(connId != sConnId)
                {
                    await Clients.Client(connId).SendAsync("ReceiveMessage", user, message, type, connId, sConnId);
                }
            }
        }
        public async Task disconnectClient(string user)
        {
            await Clients.All.SendAsync("DisconnectUser", user);
            Context.Abort();
        }

        public async Task duplicateUser(string connId)
        {
            await Clients.Client(connId).SendAsync("DuplicateUser");
        }
        
        // ****************** Initial metadata ******************
        public async Task SendFileMetadata(FileMetadata metadata)
        {
            //Console.WriteLine($"This is metadata :  {metadata.ReceiverConnectionId}");
            await Clients.Client(metadata.ReceiverConnectionId)
                .SendAsync("ReceiveFileMetadata", metadata);
        }

        public async Task ConfirmTransfer(string senderConnectionId, bool accepted, string filename, string? publicKey = null)
            => await Clients.Client(senderConnectionId)
                .SendAsync("TransferConfirmation", accepted, filename, publicKey);

        // ****************** SignalR chunk fallback ******************
        public async Task SendFileChunk(string receiverConnectionId, string fileName, int chunkIndex, string base64Chunk)
            => await Clients.Client(receiverConnectionId)
                .SendAsync("ReceiveFileChunk", fileName, chunkIndex, base64Chunk);

        // ****************** WebRTC signaling ******************
        public async Task SendOffer(string receiverConnectionId, string offer, string senderConnectionId, string filename)
            => await Clients.Client(receiverConnectionId)
                .SendAsync("ReceiveOffer", offer, senderConnectionId, filename);

        public async Task SendAnswer(string receiverConnectionId, string answer, string senderConnectionId, string filename)
            => await Clients.Client(receiverConnectionId)
                .SendAsync("ReceiveAnswer", answer, senderConnectionId, filename);

        public async Task SendIceCandidate(string receiverConnectionId, string candidate, string senderConnectionId, string filename)
        {
            //Console.WriteLine($"The params are in order : {receiverConnectionId} // {candidate} //  {senderConnectionId} //  {filename}");
            await Clients.Client(receiverConnectionId)
                .SendAsync("ReceiveIceCandidate", candidate, senderConnectionId, filename);
        }

        public string GetConnectionId() => Context.ConnectionId;
    }
}
