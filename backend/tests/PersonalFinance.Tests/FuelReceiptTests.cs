using PersonalFinance.Api.Application;
using PersonalFinance.Api.Contracts;
using Xunit;
namespace PersonalFinance.Tests;
public class FuelReceiptTests {
 [Fact] public void SignaturesTypesAndNamesMustAgree(){var bytes=new byte[]{137,80,78,71,13,10,26,10,0};var png=new FuelReceiptInput("receipt.png","image/png",Convert.ToBase64String(bytes));Assert.Equal(bytes,FuelReceiptRules.Validate(png));Assert.Throws<ApiException>(()=>FuelReceiptRules.Validate(png with{ContentType="image/jpeg"}));Assert.Throws<ApiException>(()=>FuelReceiptRules.Validate(png with{FileName="../receipt.png"}));Assert.Throws<ApiException>(()=>FuelReceiptRules.Validate(png with{Base64="bad"}));}
 [Fact] public void EmptyOrOversizedAttachmentsAreRejected(){Assert.Throws<ApiException>(()=>FuelReceiptRules.Validate(new("x.png","image/png","")));Assert.Throws<ApiException>(()=>FuelReceiptRules.Validate(new("x.png","image/png",new string('A',4194308))));}
}
