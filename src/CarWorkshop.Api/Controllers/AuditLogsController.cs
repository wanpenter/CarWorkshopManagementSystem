using CarWorkshop.Api.Authentication;
using CarWorkshop.Application.Contracts;
using CarWorkshop.Application.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CarWorkshop.Api.Controllers;

[ApiController]
[Route("api/audit-logs")]
[Authorize(Policy = WorkshopAuthentication.AdminPolicy)]
public sealed class AuditLogsController(AuditLogService auditLogs) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<PagedResult<AuditLogDetails>>> GetPage(
        [FromQuery] string? entityType = null,
        [FromQuery] string? action = null,
        [FromQuery] string? search = null,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = AuditLogService.DefaultPageSize,
        CancellationToken cancellationToken = default)
    {
        var result = await auditLogs.GetPageAsync(
            new AuditLogQuery(entityType, action, search, page, pageSize),
            cancellationToken);
        return Ok(result);
    }
}
