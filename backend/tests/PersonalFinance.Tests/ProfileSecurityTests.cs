using PersonalFinance.Api.Application;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.AspNetCore.Http;
using Xunit;
namespace PersonalFinance.Tests;
public class ProfileSecurityTests
{
    [Theory]
    [InlineData("short1")]
    [InlineData("abcdefghijklmnop")]
    [InlineData("1234567890123456")]
    public void WeakPasswordsAreRejected(string password) => Assert.Throws<ApiException>(() => AuthService.ValidatePassword(password));
    [Fact]
    public void LongPasswordsAreRejected() => Assert.Throws<ApiException>(() => AuthService.ValidatePassword(new string('a', 128) + "1"));
    [Fact]
    public void PassphrasesAreAccepted() => AuthService.ValidatePassword("My finance passphrase 2026!");
    [Fact]
    public void EmailsAreNormalized() => Assert.Equal("owner@example.com", AuthService.NormalizeEmail(" Owner@Example.COM "));
    [Theory]
    [InlineData("not-email")]
    [InlineData("Name <owner@example.com>")]
    [InlineData("")]
    public void InvalidEmailsAreRejected(string email) => Assert.Throws<ApiException>(() => AuthService.NormalizeEmail(email));
    [Theory]
    [InlineData("China Standard Time", "Asia/Shanghai")]
    [InlineData("Pacific Standard Time", "America/Los_Angeles")]
    [InlineData("Asia/Shanghai", "Asia/Shanghai")]
    [InlineData("UTC", "UTC")]
    public void ProfileTimeZonesUseBrowserCompatibleIds(string input, string expected) => Assert.Equal(expected, AuthService.NormalizeTimeZone(input));
    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("Not/A_TimeZone")]
    public void InvalidTimeZonesAreRejected(string? timeZone) => Assert.Throws<ApiException>(() => AuthService.NormalizeTimeZone(timeZone));
    [Theory]
    [InlineData(null, "password")]
    [InlineData("", "password")]
    [InlineData("owner@example.com", null)]
    public async Task MissingLoginCredentialsAreRejectedBeforeDatabaseAccess(string? email, string? password)
    {
        await using var db = new FinanceDb(new DbContextOptionsBuilder<FinanceDb>().Options);
        var auth = new AuthService(db, new ConfigurationBuilder().Build());
        var error = await Assert.ThrowsAsync<ApiException>(() => auth.Login(new LoginInput(email!, password!), new DefaultHttpContext()));
        Assert.Equal(401, error.Status);
        Assert.Equal("INVALID_CREDENTIALS", error.Code);
    }
}
