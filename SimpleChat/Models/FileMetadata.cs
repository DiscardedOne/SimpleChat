namespace SimpleChat.Models;

public class FileMetadata
{
    public string FileName { get; set; }
    public long FileSize { get; set; }
    public string FileType { get; set; }
    public string SenderConnectionId { get; set; }
    public string ReceiverConnectionId { get; set; }
    public string FileHash { get; set; }
    public int TotalChunks { get; set; }
}