using System.Text.RegularExpressions;
namespace PersonalFinance.Api.Application.Ai;

public static class AiPrivacyText
{
    private static readonly Regex Credentials = new(@"(?i)(?:cvv|cvc|password|密码|api[_ -]?key|密钥)(?:[\s""':=：]+[^\s,，。;；}]+|[A-Za-z0-9_.@!$%&*+/-]{3,200})", RegexOptions.CultureInvariant, TimeSpan.FromMilliseconds(100));
    private static readonly Regex ApiKeys = new(@"\bsk-[A-Za-z0-9_-]{16,}\b", RegexOptions.CultureInvariant, TimeSpan.FromMilliseconds(100));
    private static readonly Regex Cards = new(@"(?<!\d)(?:\d[ -]?){12,18}\d(?!\d)", RegexOptions.CultureInvariant, TimeSpan.FromMilliseconds(100));
    private static readonly Regex Phones = new(@"(?<!\d)(?:\+?86[ -]?)?1[3-9]\d{9}(?!\d)", RegexOptions.CultureInvariant, TimeSpan.FromMilliseconds(100));
    private static readonly Regex Emails = new(@"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", RegexOptions.CultureInvariant, TimeSpan.FromMilliseconds(100));
    private static readonly Regex Identifiers = new(@"(?<![A-Za-z0-9])[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}(?![A-Za-z0-9])", RegexOptions.CultureInvariant, TimeSpan.FromMilliseconds(100));
    public static string Sanitize(string value)
    {
        // Input length is bounded by the caller. Do not use this on authoritative money fields.
        var text = Credentials.Replace(value, "[CREDENTIAL REDACTED]"); text = ApiKeys.Replace(text, "[KEY REDACTED]");
        text = Emails.Replace(text, "[EMAIL REDACTED]");
        string MaskNumbers(string part) => Cards.Replace(Phones.Replace(part, "[PHONE REDACTED]"), m => { var digits = new string(m.Value.Where(char.IsDigit).ToArray()); return "[CARD••" + digits[^4..] + "]"; });
        // UUID digit groups can resemble a card number. Preserve identifiers after
        // credential/email redaction; otherwise subsequent authorized tool calls fail.
        var result = new System.Text.StringBuilder(); var position = 0;
        foreach (Match identifier in Identifiers.Matches(text)) {
            result.Append(MaskNumbers(text[position..identifier.Index])); result.Append(identifier.Value); position = identifier.Index + identifier.Length;
        }
        result.Append(MaskNumbers(text[position..])); return result.ToString();
    }
}
