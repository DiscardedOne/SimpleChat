using System.Text;
using System.Text.RegularExpressions;
using System.Web;

namespace SimpleChat.Utils;

public class Sanitizer
{
    public static string SanitizeMessage(string? message)
    {
        if (message == null)
            return string.Empty;

        // Step 0: Strip zero-width & Bidi override characters
        // Unicode ranges: \u200B–\u200F, \u202A–\u202E, \u2060–\u206F
        message = Regex.Replace(message, @"[\u200B-\u200F\u202A-\u202E\u2060-\u206F]", "");

        // Step 1: Normalize to FormKC (like JS's NFKC)
        string normalized = message.Normalize(NormalizationForm.FormKC);

        // Step 2: Remove control characters except \t, \n, \r
        StringBuilder noControls = new StringBuilder();
        foreach (char ch in normalized)
        {
            if (ch == '\t' || ch == '\n' || ch == '\r' || (ch >= 0x20 && ch <= 0x7E))
            {
                noControls.Append(ch);
            }
        }

        return noControls.ToString();  // raw, un‑encoded text
        
        //Step 3: Allow only safe characters; encode everything else as numeric HTML entities
        // StringBuilder partiallyEncoded = new StringBuilder();
        // foreach (char ch in noControls.ToString())
        // {
        //     if (Regex.IsMatch(ch.ToString(), @"^[A-Za-z0-9 \-_.:@]$"))
        //     {
        //         partiallyEncoded.Append(ch);
        //     }
        //     else
        //     {
        //         partiallyEncoded.Append($"&#{(int)ch};");
        //     }
        // }
        //
        // // Step 4: Final HTML escape (e.g., to handle stray <, &, etc.)
        // return partiallyEncoded.ToString();
    }
}