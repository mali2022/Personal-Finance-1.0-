using System.Buffers.Binary;
using System.Text;
using PersonalFinance.Api.Application;
using PersonalFinance.Api.Contracts;
using SkiaSharp;
using Xunit;

namespace PersonalFinance.Tests;

public sealed class ProfileAvatarTests
{
    [Theory]
    [InlineData(1, 0, 1, 2, 3)]
    [InlineData(2, 1, 0, 3, 2)]
    [InlineData(3, 3, 2, 1, 0)]
    [InlineData(4, 2, 3, 0, 1)]
    [InlineData(5, 0, 2, 1, 3)]
    [InlineData(6, 2, 0, 3, 1)]
    [InlineData(7, 3, 1, 2, 0)]
    [InlineData(8, 1, 3, 0, 2)]
    public void JpegExifOrientationIsAppliedBeforeMetadataIsRemoved(int orientation, int topLeft, int topRight, int bottomLeft, int bottomRight)
    {
        SKColor[] colors = [SKColors.Red, SKColors.Lime, SKColors.Blue, SKColors.Yellow];
        using var image = new SKBitmap(128, 80);
        using (var canvas = new SKCanvas(image))
        using (var paint = new SKPaint())
        {
            for (var i = 0; i < colors.Length; i++)
            {
                paint.Color = colors[i];
                canvas.DrawRect(i % 2 * 64, i / 2 * 40, 64, 40, paint);
            }
        }
        using var jpeg = image.Encode(SKEncodedImageFormat.Jpeg, 100);
        var source = WithExifOrientation(jpeg.ToArray(), (ushort)orientation);
        using (var data = SKData.CreateCopy(source))
        using (var codec = SKCodec.Create(data))
        {
            Assert.NotNull(codec);
            Assert.Equal(orientation, (int)codec.EncodedOrigin);
        }
        var output = AuthService.NormalizeAvatar(source);
        using var result = SKBitmap.Decode(output);
        Assert.NotNull(result);
        Assert.Equal(256, result.Width);
        Assert.Equal(256, result.Height);
        (int x, int y)[] samples = [(32, 32), (224, 32), (32, 224), (224, 224)];
        int[] expected = [topLeft, topRight, bottomLeft, bottomRight];
        for (var i = 0; i < samples.Length; i++)
        {
            var actual = result.GetPixel(samples[i].x, samples[i].y);
            var color = colors[expected[i]];
            Assert.InRange(Math.Abs(actual.Red - color.Red), 0, 15);
            Assert.InRange(Math.Abs(actual.Green - color.Green), 0, 15);
            Assert.InRange(Math.Abs(actual.Blue - color.Blue), 0, 15);
            Assert.Equal(255, actual.Alpha);
        }
        Assert.DoesNotContain("PRIVATE_AVATAR_MARKER", Encoding.ASCII.GetString(output));
        using var outputData = SKData.CreateCopy(output);
        using var outputCodec = SKCodec.Create(outputData);
        Assert.NotNull(outputCodec);
        Assert.Equal(SKEncodedImageFormat.Png, outputCodec.EncodedFormat);
        Assert.Equal(SKEncodedOrigin.TopLeft, outputCodec.EncodedOrigin);
    }

    [Fact]
    public void AvatarSizeAndFormatGuardsRemainEnforced()
    {
        foreach (var invalid in new[] { Array.Empty<byte>(), Encoding.UTF8.GetBytes("<svg></svg>"), new byte[2097153] })
            Assert.Equal("AVATAR_INVALID", Assert.Throws<ApiException>(() => AuthService.NormalizeAvatar(invalid)).Code);
        using var oversized = new SKBitmap(4097, 1);
        using var png = oversized.Encode(SKEncodedImageFormat.Png, 100);
        Assert.Equal("AVATAR_INVALID", Assert.Throws<ApiException>(() => AuthService.NormalizeAvatar(png.ToArray())).Code);
    }

    private static byte[] WithExifOrientation(byte[] jpeg, ushort orientation)
    {
        byte[] exif = [0x45, 0x78, 0x69, 0x66, 0, 0, // Exif signature.
            0x49, 0x49, 0x2a, 0, 8, 0, 0, 0, // Little-endian TIFF header and first IFD offset.
            1, 0, 0x12, 1, 3, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]; // One SHORT Orientation tag.
        BinaryPrimitives.WriteUInt16LittleEndian(exif.AsSpan(24, 2), orientation);
        using var result = new MemoryStream();
        result.Write(jpeg.AsSpan(0, 2));
        WriteSegment(result, 0xe1, exif);
        WriteSegment(result, 0xfe, Encoding.ASCII.GetBytes("PRIVATE_AVATAR_MARKER"));
        result.Write(jpeg.AsSpan(2));
        return result.ToArray();
    }

    private static void WriteSegment(Stream destination, byte marker, byte[] payload)
    {
        destination.WriteByte(0xff); destination.WriteByte(marker);
        Span<byte> length = stackalloc byte[2];
        BinaryPrimitives.WriteUInt16BigEndian(length, checked((ushort)(payload.Length + 2)));
        destination.Write(length); destination.Write(payload);
    }
}
