using PersonalFinance.Api.Contracts;
namespace PersonalFinance.Api.Application;
internal static class SpendingCompute
{
    static readonly SemaphoreSlim Gate=new(2,2);
    public static async Task<T> Run<T>(Func<T> compute,CancellationToken ct)
    {
        if(!await Gate.WaitAsync(0,ct))throw new ApiException(429,"求解服务繁忙，请稍后重试","OPTIMIZATION_BUSY");
        try{return await Task.Run(compute,ct);}finally{Gate.Release();}
    }
}
