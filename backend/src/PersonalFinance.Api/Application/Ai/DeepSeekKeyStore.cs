using Microsoft.AspNetCore.DataProtection;
namespace PersonalFinance.Api.Application.Ai;

public static class DeepSeekKeyStore
{
    private const string Purpose = "PersonalFinance.DeepSeek.ServerApiKey.v1";
    public static string PathFor(IConfiguration configuration, IHostEnvironment environment) => Path.Combine(
        configuration["DataProtection:KeyPath"] ?? Path.Combine(environment.ContentRootPath, ".keys"), "deepseek-api-key.protected");
    public static string? Read(IDataProtectionProvider protection, IConfiguration configuration, IHostEnvironment environment)
    {
        var path = PathFor(configuration, environment);
        try { return File.Exists(path) && new FileInfo(path).Length <= 16000 ? protection.CreateProtector(Purpose).Unprotect(File.ReadAllText(path)) : null; }
        catch (Exception e) when (e is System.Security.Cryptography.CryptographicException or IOException or UnauthorizedAccessException) { return null; }
    }
    public static void Store(string key, IDataProtectionProvider protection, IConfiguration configuration, IHostEnvironment environment)
    {
        if (string.IsNullOrWhiteSpace(key) || key.Length > 2000 || key.Any(char.IsControl)) throw new InvalidOperationException("密钥格式无效。");
        var path = PathFor(configuration, environment);
        var directory = Path.GetDirectoryName(path)!;
        Directory.CreateDirectory(directory);
        if (!OperatingSystem.IsWindows())
            File.SetUnixFileMode(directory, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute);
        var encrypted = protection.CreateProtector(Purpose).Protect(key);
        var temporary = path + "." + Guid.NewGuid().ToString("N") + ".tmp";
        try
        {
            File.WriteAllText(temporary, encrypted);
            if (!OperatingSystem.IsWindows()) File.SetUnixFileMode(temporary, UnixFileMode.UserRead | UnixFileMode.UserWrite);
            File.Move(temporary, path, overwrite: true);
        }
        finally { if (File.Exists(temporary)) File.Delete(temporary); }
    }
}
