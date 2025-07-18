using SimpleChat.Hubs;

using Azure.Monitor.OpenTelemetry.AspNetCore;

var builder = WebApplication.CreateBuilder(args);

// Add the OpenTelemetry telemetry service to the application.
// This service will collect and send telemetry data to Azure Monitor.
builder.Services.AddOpenTelemetry().UseAzureMonitor(options => {
    options.ConnectionString = builder.Configuration.GetConnectionString("AppInsightsConnectionString");
});

// Configure logging
builder.Logging.ClearProviders();
builder.Logging.AddConsole();
builder.Logging.AddOpenTelemetry(options =>
{
    options.IncludeFormattedMessage = true;
    options.IncludeScopes = true;
    options.ParseStateValues = true;
});

// Add services to the container.
builder.Services.AddControllersWithViews();

//string conString = builder.Configuration.GetConnectionString("AzureSignalREndpoint");

// 1) Configure core SignalR timeouts here:
builder.Services
    .AddSignalR(options =>
    {
        // Ping clients every 5s
        options.KeepAliveInterval    = TimeSpan.FromSeconds(5);
        // Declare a client dead if no response within 15s
        options.ClientTimeoutInterval = TimeSpan.FromSeconds(15);
    })
    // 2) Then just hook up Azure SignalR by passing your connection string:
    .AddAzureSignalR(builder.Configuration.GetConnectionString("AzureSignalREndpoint"));

var app = builder.Build();

// Configure the HTTP request pipeline.
if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Home/Error");
    // The default HSTS value is 30 days. You may want to change this for production scenarios, see https://aka.ms/aspnetcore-hsts.
    app.UseHsts();
}

app.UseHttpsRedirection();
app.UseRouting();

app.UseAuthorization();

app.MapStaticAssets();

app.MapControllerRoute(
        name: "default",
        pattern: "{controller=Chat}/{action=Landing}/{id?}")
    .WithStaticAssets();

app.MapHub<ChatHub>("/chat");

app.Run();